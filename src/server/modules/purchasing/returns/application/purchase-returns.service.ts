import { Injectable } from '@nestjs/common';
import { returnLineAmounts, type PurchaseReturn, type PurchaseReturnInput, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PayablesStore } from '../../common/application/payables-store.js';
import { PurchasingStore, type ListQuery } from '../../common/application/purchasing-store.js';

const REASONS = ['EXPIRED', 'DAMAGED', 'WRONG_ITEM', 'QUALITY'];
const LIVE_BILL = ['POSTED', 'PARTIALLY_PAID', 'PAID'];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft purchase return can be changed. Cancel a posted one instead.', undefined, { code: 'RETURN_NOT_EDITABLE' });

/**
 * Purchase returns: goods sent back to the vendor. Posting (database purchaseReturnPost) takes the stock out at book
 * value, reverses input tax and debits the payable (or the cash account for a cash refund); a credit return against a
 * bill creates the settling debit note and applies it to that bill. Cancelling reverses it while the note is unapplied.
 */
@Injectable()
export class PurchaseReturnsService {
  constructor(
    private readonly store: PayablesStore,
    private readonly purchasing: PurchasingStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: ListQuery) {
    return this.store.listReturns(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<PurchaseReturn> {
    const r = await this.store.getReturn(user.tenantId, id);
    if (!r) throw new NotFoundError('Purchase return not found');
    return r;
  }

  returnBills(user: SessionUser, vendorId: string) {
    return this.store.returnBills(user.tenantId, vendorId);
  }

  async returnable(user: SessionUser, billId: string, exceptId: string | null) {
    const b = await this.purchasing.getBill(user.tenantId, billId);
    if (!b) throw new NotFoundError('Bill not found');
    return this.store.returnable(user.tenantId, billId, exceptId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: PurchaseReturnInput) {
    const data = await this.payload(user, input, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('purchaseReturnAddUpdate', data));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: PurchaseReturnInput & { rowVersion: number }) {
    const r = await this.current(user, id, input.rowVersion);
    if (r.status !== 'DRAFT') throw notEditable();
    const data = await this.payload(user, { ...input, lines: input.lines.map((l) => ({ ...l, id: null })) }, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('purchaseReturnAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.current(user, id, rowVersion);
    if (r.status !== 'DRAFT') throw notEditable();
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('return', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This return was changed. Reload and try again.');
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.current(user, id, rowVersion);
    if (r.status !== 'DRAFT') throw notEditable();
    if (r.bill) await this.checkQty(user, r.bill.id, r.lines.map((l) => ({ billLineId: l.billLineId, qty: l.returnQty + l.bonusQty })), id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('purchaseReturnPost', id));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const r = await this.current(user, id, rowVersion);
    if (r.status === 'CANCELLED') return r;
    if (r.debitNote && r.debitNote.status === 'APPLIED') {
      throw new ConflictError(`Its debit note ${r.debitNote.docNo} is applied to a bill. Reverse that application first.`, undefined, { code: 'RETURN_NOT_EDITABLE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('purchaseReturnCancel', id, reason));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private async checkQty(user: SessionUser, billId: string, lines: { billLineId: string | null; qty: number }[], selfId: string | null) {
    const can = await this.store.returnable(user.tenantId, billId, selfId);
    lines.forEach((l, i) => {
      if (!l.billLineId) return;
      const c = can.find((x) => x.billLineId === l.billLineId);
      if (!c) throw v({ [`lines.${i}.billLineId`]: 'Not a stock line of this bill' });
      if (l.qty > c.returnableQty + 0.0001) {
        throw new ConflictError(`Line ${i + 1}: ${l.qty} returned but only ${c.returnableQty} of ${c.item.name} can still be returned on this bill.`, { [`lines.${i}.returnQty`]: ['More than can be returned'] }, { code: 'RETURN_QTY_EXCEEDS' });
      }
    });
  }

  private async payload(user: SessionUser, p: PurchaseReturnInput, selfId: string | null) {
    const o = await this.purchasing.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.vendors.some((x) => x.id === p.vendorId)) e.vendorId = 'Choose an active vendor';
    if (!o.branches.some((x) => x.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (!o.warehouses.some((x) => x.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (!REASONS.includes(p.reason)) e.reason = 'Choose a reason';
    if (p.settlement === 'CASH_REFUND' && !o.cashAccounts.some((x) => x.id === p.cashAccountId)) e.cashAccountId = 'Choose an active cash account';
    const bill = p.billId ? await this.purchasing.getBill(user.tenantId, p.billId) : null;
    if (p.billId && !bill) e.billId = 'Bill not found';
    else if (bill && bill.vendor.id !== p.vendorId) e.billId = `Bill ${bill.docNo} is from ${bill.vendor.name}`;
    else if (bill && !LIVE_BILL.includes(bill.status)) e.billId = `Bill ${bill.docNo} isn’t posted`;
    p.lines.forEach((l, i) => {
      if (!o.products.some((x) => x.id === l.itemId)) e[`lines.${i}.itemId`] = 'Choose an active product';
      if (l.taxCodeId && !o.taxCodes.some((x) => x.id === l.taxCodeId)) e[`lines.${i}.taxCodeId`] = 'Choose an active tax code';
      if (l.billLineId && !bill) e[`lines.${i}.billLineId`] = 'Pick the bill first';
    });
    if (Object.keys(e).length) throw v(e);
    if (bill) await this.checkQty(user, bill.id, p.lines.map((l) => ({ billLineId: l.billLineId, qty: l.returnQty + l.bonusQty })), selfId);
    const can = bill ? await this.store.returnable(user.tenantId, bill.id, selfId) : [];
    const lines = p.lines.map((l, i) => {
      const a = returnLineAmounts(l);
      return {
        lineNo: i + 1, billLineId: l.billLineId, itemId: l.itemId, batchNo: l.batchNo, expiryDate: l.expiryDate,
        purchasedQty: can.find((c) => c.billLineId === l.billLineId)?.purchasedQty ?? null, returnQty: l.returnQty, bonusQty: l.bonusQty, rate: l.rate,
        discountPct: l.discountPct, taxCodeId: l.taxCodeId, taxRate: l.taxRate, ...a,
      };
    });
    const sum = (k: 'grossAmount' | 'discountAmount' | 'taxAmount' | 'totalAmount') => r2(lines.reduce((s, l) => s + l[k], 0));
    return {
      docDate: p.docDate, vendorId: p.vendorId, branchId: p.branchId, warehouseId: p.warehouseId, billId: p.billId, supplierBillNo: p.supplierBillNo ?? bill?.vendorInvoiceNo ?? null,
      settlement: p.settlement, cashAccountId: p.settlement === 'CASH_REFUND' ? p.cashAccountId : null, reason: p.reason, gatePassNo: p.gatePassNo, transporter: p.transporter,
      debitNoteNarration: p.debitNoteNarration, remarks: p.remarks,
      grossAmount: sum('grossAmount'), discountAmount: sum('discountAmount'), taxAmount: sum('taxAmount'), totalAmount: sum('totalAmount'),
      lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('This return was changed. Reload and try again.');
    return r;
  }
}
