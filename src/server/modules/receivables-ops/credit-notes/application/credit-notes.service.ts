import { Injectable } from '@nestjs/common';
import { lineAmounts, type CreditNoteInput, type ReceivablesQuery, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ReceivablesStore } from '../../common/application/receivables-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft credit note can be changed or posted.', undefined, { code: 'CREDIT_NOTE_NOT_EDITABLE' });
const changed = () => new ConcurrencyError('This credit note was changed. Reload and try again.');

/**
 * Credit notes (rate difference, damage, short supply…): applied to an invoice (it can't exceed what the invoice
 * still owes) or kept as customer credit for receipts. Posting (Sales.creditNotePost) books Dr sales returns /
 * output tax, Cr the receivable, and brings restocked goods back at cost. Cancel reverses. Credit notes raised by a
 * sales return are cancelled with the return.
 */
@Injectable()
export class CreditNotesService {
  constructor(
    private readonly store: ReceivablesStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: ReceivablesQuery) {
    return this.store.listCreditNotes(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const c = await this.store.getCreditNote(user.tenantId, id);
    if (!c) throw new NotFoundError('Credit note not found');
    return c;
  }

  async create(user: SessionUser, meta: RequestMeta, input: CreditNoteInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('creditNoteAddUpdate', data));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: CreditNoteInput & { rowVersion: number }) {
    const c = await this.get(user, id);
    if (c.rowVersion !== input.rowVersion) throw changed();
    if (c.status !== 'DRAFT') throw notEditable();
    const data = await this.payload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('creditNoteAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('creditNote', user.tenantId, id, rowVersion)))) throw notEditable();
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw changed();
    if (c.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('creditNotePost', id));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw changed();
    if (c.status === 'CANCELLED') return c;
    if (c.salesReturn) throw new ConflictError(`This credit note was raised by sales return ${c.salesReturn.docNo}. Cancel the return instead.`, undefined, { code: 'CREDIT_NOTE_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('creditNoteCancel', id, reason));
    return this.get(user, id);
  }

  private async payload(user: SessionUser, p: CreditNoteInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.customers.some((c) => c.id === p.customerId)) e.customerId = 'Choose an active customer';
    if (!o.lookups.creditNoteReasons.some((x) => x.code === p.reason)) e.reason = 'Choose a reason';
    if (p.returnWarehouseId && !o.warehouses.some((w) => w.id === p.returnWarehouseId)) e.returnWarehouseId = 'Choose an active warehouse';
    const inv = p.invoiceId ? await this.store.returnable(user.tenantId, p.invoiceId) : null;
    if (p.invoiceId && !inv) e.invoiceId = 'Invoice not found';
    else if (inv && inv.invoice.customer.id !== p.customerId) e.invoiceId = 'This invoice belongs to another customer';
    const rows = p.lines.map((l, i) => {
      const item = l.itemId ? o.products.find((x) => x.id === l.itemId) : null;
      if (l.itemId && !item) e[`lines.${i}.itemId`] = 'Choose an active product';
      const qty = Number(l.qty ?? 0);
      // a value-only line (rate difference) is one unit of its amount
      const a = lineAmounts({ baseQty: qty > 0 ? qty : 1, rate: Number(l.rate), discountPct: 0, taxRate: Number(l.taxRate ?? 0) });
      const src = inv && l.invoiceLineId ? inv.lines.find((x) => x.invoiceLineId === l.invoiceLineId) : null;
      return {
        lineNo: i + 1, invoiceLineId: src?.invoiceLineId ?? null, itemId: l.itemId ?? null, description: l.description || item?.name || '', batchId: src?.batchId ?? null,
        invoicedQty: src?.soldQty ?? null, qtyCtn: 0, qtyLoose: qty, ctnFactor: 1, baseQty: qty, rate: Number(l.rate), valueAmount: a.netAmount, taxCodeId: l.taxCodeId ?? null,
        taxRate: Number(l.taxRate ?? 0), taxAmount: a.taxAmount, furtherTaxAmount: 0, totalAmount: a.totalAmount, restock: !!l.restock,
      };
    });
    const value = r2(rows.reduce((s, l) => s + l.valueAmount, 0));
    const tax = r2(rows.reduce((s, l) => s + l.taxAmount, 0));
    const total = r2(value + tax);
    if (p.treatment === 'APPLY_TO_INVOICE' && inv && total > inv.invoice.balanceAmount) e.invoiceId = `The invoice only owes ${inv.invoice.balanceAmount}; keep the rest as customer credit`;
    if (Object.keys(e).length) throw v(e);
    return {
      docDate: p.docDate, customerId: p.customerId, invoiceId: p.invoiceId ?? null, branchId: p.branchId ?? inv?.invoice.branch.id ?? null, reason: p.reason,
      reasonNote: p.reasonNote ?? null, returnWarehouseId: p.returnWarehouseId ?? null, treatment: p.treatment ?? 'APPLY_TO_INVOICE', valueAmount: value,
      taxAmount: tax, furtherTaxAmount: 0, totalAmount: total, narration: p.narration ?? null, lines: rows,
    };
  }
}
