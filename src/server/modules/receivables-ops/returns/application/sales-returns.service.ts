import { Injectable } from '@nestjs/common';
import { docTotals, lineAmounts, type ReceivablesQuery, type SalesReturnInput, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ReceivablesStore } from '../../common/application/receivables-store.js';

const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft return can be changed or posted. Cancel a posted return instead.', undefined, { code: 'SALES_RETURN_NOT_EDITABLE' });
const changed = () => new ConcurrencyError('This return was changed. Reload and try again.');

/**
 * Sales returns: goods back in against an invoice (qty ≤ invoiced − already returned) or without one. Posting
 * (Sales.salesReturnPost) restocks / quarantines / writes off each line at the invoice cost, reverses COGS and raises
 * the credit note (applied to the invoice when it still owes enough, else kept as customer credit). Cancel reverses all.
 */
@Injectable()
export class SalesReturnsService {
  constructor(
    private readonly store: ReceivablesStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: ReceivablesQuery) {
    return this.store.listReturns(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const r = await this.store.getReturn(user.tenantId, id);
    if (!r) throw new NotFoundError('Sales return not found');
    return r;
  }

  async returnable(user: SessionUser, invoiceId: string) {
    const r = await this.store.returnable(user.tenantId, invoiceId);
    if (!r) throw new NotFoundError('Invoice not found');
    return r;
  }

  async create(user: SessionUser, meta: RequestMeta, input: SalesReturnInput) {
    const data = await this.payload(user, input, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('salesReturnAddUpdate', data));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: SalesReturnInput & { rowVersion: number }) {
    const r = await this.get(user, id);
    if (r.rowVersion !== input.rowVersion) throw changed();
    if (r.status !== 'DRAFT') throw notEditable();
    const data = await this.payload(user, input, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('salesReturnAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  /** Saves and posts a return inside the caller's unit of work (route settlements); returns its id. */
  async createAndPostIn(user: SessionUser, input: SalesReturnInput) {
    const data = await this.payload(user, input, null);
    const id = await this.store.save('salesReturnAddUpdate', data);
    await this.store.run('salesReturnPost', id);
    return id;
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('return', user.tenantId, id, rowVersion)))) throw notEditable();
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw changed();
    if (r.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('salesReturnPost', id));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw changed();
    if (r.status === 'CANCELLED') return r;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('salesReturnCancel', id, reason));
    return this.get(user, id);
  }

  /** Lines priced from the input (the invoice's rate / discount / tax when returned against it); qty checked against what is still returnable. */
  private async payload(user: SessionUser, p: SalesReturnInput, selfId: string | null) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.customers.some((c) => c.id === p.customerId)) e.customerId = 'Choose an active customer';
    if (!o.warehouses.some((w) => w.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    const ret = p.invoiceId ? await this.store.returnable(user.tenantId, p.invoiceId) : null;
    if (p.invoiceId && !ret) e.invoiceId = 'Invoice not found';
    else if (ret && ret.invoice.customer.id !== p.customerId) e.invoiceId = 'This invoice belongs to another customer';
    else if (ret && !['POSTED', 'PARTIALLY_PAID', 'PAID'].includes(ret.invoice.status)) e.invoiceId = 'Only a posted invoice can take a return';
    const reasons = new Set(o.lookups.returnReasons.map((x) => x.code));
    const disp = new Set(o.lookups.dispositions.map((x) => x.code));
    // a draft being edited doesn't count against itself: returnable() only counts posted returns
    void selfId;
    const lines = p.lines.map((l, i) => {
      if (!o.products.some((x) => x.id === l.itemId)) e[`lines.${i}.itemId`] = 'Choose an active product';
      if (!reasons.has(l.reason)) e[`lines.${i}.reason`] = 'Choose a reason';
      if (!disp.has(l.disposition)) e[`lines.${i}.disposition`] = 'Choose what happens to the goods';
      const src = ret && l.invoiceLineId ? ret.lines.find((x) => x.invoiceLineId === l.invoiceLineId) : null;
      if (ret && l.invoiceLineId && !src) e[`lines.${i}.invoiceLineId`] = 'This line is not on the invoice';
      const qty = Number(l.qty);
      if (src && qty > src.returnableQty) e[`lines.${i}.qty`] = `At most ${src.returnableQty} can still be returned`;
      const rate = src ? src.rate : Number(l.rate);
      const discountPct = src ? src.discountPct : Number(l.discountPct ?? 0);
      const taxRate = src ? src.taxRate : Number(l.taxRate ?? 0);
      const a = lineAmounts({ baseQty: qty, rate, discountPct, taxRate });
      return {
        row: {
          lineNo: i + 1, invoiceLineId: src?.invoiceLineId ?? null, itemId: l.itemId, batchId: src?.batchId ?? l.batchId ?? null, rate, soldQty: src?.soldQty ?? null,
          qtyCtn: 0, qtyLoose: qty, ctnFactor: 1, baseQty: qty, grossAmount: a.grossAmount, discountPct, discountAmount: a.discountAmount, valueAmount: a.netAmount,
          taxCodeId: src?.taxCodeId ?? l.taxCodeId ?? null, taxRate, taxAmount: a.taxAmount, totalAmount: a.totalAmount, reason: l.reason, disposition: l.disposition,
        },
        a,
      };
    });
    if (Object.keys(e).length) throw v(e);
    const t = docTotals(lines.map((x) => x.a));
    return {
      returnType: p.invoiceId ? 'AGAINST_INVOICE' : 'WITHOUT_INVOICE', docDate: p.docDate, customerId: p.customerId, invoiceId: p.invoiceId ?? null,
      branchId: p.branchId ?? ret?.invoice.branch.id ?? null, warehouseId: p.warehouseId, remarks: p.remarks ?? null,
      totalItems: new Set(lines.map((x) => x.row.itemId)).size, totalQty: lines.reduce((s, x) => s + x.row.baseQty, 0),
      grossAmount: t.grossAmount, discountAmount: t.discountAmount, valueAmount: t.netAmount, taxAmount: t.taxAmount, totalAmount: t.totalAmount,
      lines: lines.map((x) => x.row),
    };
  }
}
