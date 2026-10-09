import { Injectable } from '@nestjs/common';
import type { AssemblyInput, SessionUser, StockVoucherInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { StockOpsStore } from '../../common/application/stock-ops-store.js';
import { StockDemandStore, type DemandQuery } from './stock-demand-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft can be changed. Cancel a posted voucher instead.', undefined, { code: 'STOCK_DOC_NOT_EDITABLE' });
const changed = () => new ConcurrencyError('This voucher was changed. Reload and try again.');

/**
 * Stock vouchers (breakage, gift, sample, internal use: stock out at cost against an expense account) and assembly
 * vouchers (build a kit from its components, or break it back into them). Posting runs in the database
 * (stockVoucherPost / assemblyVoucherPost); cancel reverses.
 */
@Injectable()
export class StockVouchersService {
  constructor(
    private readonly store: StockDemandStore,
    private readonly ops: StockOpsStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  // ---------------------------------------------------------------- stock vouchers
  listVouchers(user: SessionUser, q: DemandQuery) {
    return this.store.listStockVouchers(user.tenantId, q);
  }

  async getVoucher(user: SessionUser, id: string) {
    const x = await this.store.getStockVoucher(user.tenantId, id);
    if (!x) throw new NotFoundError('Stock voucher not found');
    return x;
  }

  async createVoucher(user: SessionUser, meta: RequestMeta, input: StockVoucherInput) {
    const data = await this.voucherPayload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('stockVoucherAddUpdate', data));
    return this.getVoucher(user, id);
  }

  async updateVoucher(user: SessionUser, meta: RequestMeta, id: string, input: StockVoucherInput & { rowVersion: number }) {
    const x = await this.getVoucher(user, id);
    if (x.rowVersion !== input.rowVersion) throw changed();
    if (x.status !== 'DRAFT') throw notEditable();
    const data = await this.voucherPayload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('stockVoucherAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.getVoucher(user, id);
  }

  async removeVoucher(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('stockVoucher', user.tenantId, id, rowVersion)))) throw notEditable();
  }

  async postVoucher(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const x = await this.getVoucher(user, id);
    if (x.rowVersion !== rowVersion) throw changed();
    if (x.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('stockVoucherPost', id));
    return this.getVoucher(user, id);
  }

  async cancelVoucher(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const x = await this.getVoucher(user, id);
    if (x.rowVersion !== rowVersion) throw changed();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('stockVoucherCancel', id, reason));
    return this.getVoucher(user, id);
  }

  private async voucherPayload(user: SessionUser, p: StockVoucherInput) {
    const [o, d] = await Promise.all([this.ops.options(user.tenantId), this.store.options(user.tenantId)]);
    const e: Record<string, string> = {};
    if (!o.warehouses.some((x) => x.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    const expense = p.expenseAccountId ?? d.expenseDefaults[p.voucherType]?.id ?? null;
    if (!expense) e.expenseAccountId = 'Choose the expense account';
    else if (!o.accounts.some((x) => x.id === expense)) e.expenseAccountId = 'Choose a postable account';
    const lines = p.lines.map((l, i) => {
      const item = o.products.find((x) => x.id === l.itemId);
      if (!item) e[`lines.${i}.itemId`] = 'Choose an active product';
      return { lineNo: i + 1, itemId: l.itemId, batchId: l.batchId, uomId: item?.uomId, uomFactor: 1, qty: l.qty, rate: item?.avgCost ?? 0, remark: l.remark };
    });
    if (Object.keys(e).length) throw v(e);
    return {
      voucherType: p.voucherType, docDate: p.docDate, warehouseId: p.warehouseId, referenceNo: p.referenceNo, breakageReason: p.voucherType === 'BRK' ? p.breakageReason : null,
      recipientName: p.recipientName, occasion: p.voucherType === 'GFT' ? p.occasion : null, customerId: p.customerId, employeeId: p.employeeId, isReturnable: p.isReturnable,
      returnDueDate: p.isReturnable ? p.returnDueDate : null, departmentId: p.departmentId, costCentreId: p.costCentreId, expenseAccountId: expense, remarks: p.remarks,
      totalItems: new Set(lines.map((l) => l.itemId)).size, totalQty: lines.reduce((s, l) => s + l.qty, 0), totalAmount: r2(lines.reduce((s, l) => s + l.qty * l.rate, 0)), lines,
    };
  }

  // ---------------------------------------------------------------- assembly
  listAssemblies(user: SessionUser, q: DemandQuery) {
    return this.store.listAssemblies(user.tenantId, q);
  }

  async getAssembly(user: SessionUser, id: string) {
    const x = await this.store.getAssembly(user.tenantId, id);
    if (!x) throw new NotFoundError('Assembly voucher not found');
    return x;
  }

  async createAssembly(user: SessionUser, meta: RequestMeta, input: AssemblyInput) {
    const data = await this.assemblyPayload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('assemblyVoucherAddUpdate', data));
    return this.getAssembly(user, id);
  }

  async updateAssembly(user: SessionUser, meta: RequestMeta, id: string, input: AssemblyInput & { rowVersion: number }) {
    const x = await this.getAssembly(user, id);
    if (x.rowVersion !== input.rowVersion) throw changed();
    if (x.status !== 'DRAFT') throw notEditable();
    const data = await this.assemblyPayload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('assemblyVoucherAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.getAssembly(user, id);
  }

  async removeAssembly(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('assembly', user.tenantId, id, rowVersion)))) throw notEditable();
  }

  async postAssembly(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const x = await this.getAssembly(user, id);
    if (x.rowVersion !== rowVersion) throw changed();
    if (x.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('assemblyVoucherPost', id));
    return this.getAssembly(user, id);
  }

  async cancelAssembly(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const x = await this.getAssembly(user, id);
    if (x.rowVersion !== rowVersion) throw changed();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('assemblyVoucherCancel', id, reason));
    return this.getAssembly(user, id);
  }

  /** Lines follow the kit's components (qty per kit × kit qty), costed at average cost. */
  private async assemblyPayload(user: SessionUser, p: AssemblyInput) {
    const [o, d] = await Promise.all([this.ops.options(user.tenantId), this.store.options(user.tenantId)]);
    const kit = d.kits.find((k) => k.id === p.kitId);
    const e: Record<string, string> = {};
    if (!kit) e.kitId = 'Choose an active kit';
    else if (!kit.components.length) e.kitId = 'This kit has no components';
    if (!o.warehouses.some((x) => x.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (Object.keys(e).length) throw v(e);
    const lines = kit!.components.map((c, i) => {
      const cost = o.products.find((x) => x.id === c.itemId)?.avgCost ?? 0;
      return { lineNo: i + 1, itemId: c.itemId, qtyPerKit: c.qtyPerKit, qty: c.qtyPerKit * p.kitQty, unitCost: cost };
    });
    const total = r2(lines.reduce((s, l) => s + l.qty * l.unitCost, 0));
    return { docDate: p.docDate, kitId: p.kitId, direction: p.direction, kitQty: p.kitQty, warehouseId: p.warehouseId, remarks: p.remarks, kitUnitCost: r2(total / p.kitQty), totalCost: total, lines };
  }
}
