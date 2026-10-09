import { Injectable } from '@nestjs/common';
import type { Quotation, QuotationConvertInput, QuotationInput, SalesDocOptions, SalesQuery, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { invalid, salesLines } from '../../common/application/sales-lines.js';
import { SalesStore } from '../../common/application/sales-store.js';

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const notEditable = () => new ConflictError('Only a draft quotation can be changed or sent. Revise a sent one instead.', undefined, { code: 'QUOTATION_NOT_EDITABLE' });

/**
 * Quotations: draft → sent → accepted (or rejected; shown expired once past the validity date) → converted into a draft
 * sales order with the quotation's lines and rates. An expired or rejected quotation is revised into a new draft.
 */
@Injectable()
export class QuotationsService {
  constructor(private readonly store: SalesStore, private readonly unitOfWork: UnitOfWork) {}

  list(user: SessionUser, q: SalesQuery) {
    return this.store.listQuotations(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<Quotation> {
    const q = await this.store.getQuotation(user.tenantId, id);
    if (!q) throw new NotFoundError('Quotation not found');
    return q;
  }

  async create(user: SessionUser, meta: RequestMeta, input: QuotationInput) {
    const data = this.payload(await this.store.options(user.tenantId), input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('quotationAddUpdate', { ...data, salesRepUserId: data.salesRepUserId ?? user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: QuotationInput & { rowVersion: number }) {
    const q = await this.current(user, id, input.rowVersion);
    if (q.status !== 'DRAFT') throw notEditable();
    const data = this.payload(await this.store.options(user.tenantId), input, new Set(q.lines.map((l) => l.id)));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('quotationAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const q = await this.current(user, id, rowVersion);
    if (q.status !== 'DRAFT') throw new ConflictError('Only a draft quotation can be deleted; cancel or reject it instead.', undefined, { code: 'QUOTATION_NOT_EDITABLE' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('quotation', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This quotation was changed. Reload and try again.');
  }

  async send(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('quotationSend', id));
    return this.get(user, id);
  }

  async accept(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('quotationAccept', id));
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('quotationReject', id, reason));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const q = await this.current(user, id, rowVersion);
    if (q.status === 'CONVERTED' || q.order) throw new ConflictError('This quotation is already converted to a sales order.', undefined, { code: 'QUOTATION_NOT_OPEN' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('quotationCancel', id, reason));
    return this.get(user, id);
  }

  /** A new draft with the same customer and lines (dated today, same validity span), linked to the original. */
  async revise(user: SessionUser, meta: RequestMeta, id: string) {
    const q = await this.get(user, id);
    if (q.status === 'DRAFT') throw new ConflictError('This quotation is still a draft; edit it instead.', undefined, { code: 'QUOTATION_NOT_OPEN' });
    const span = Math.max(0, Math.round((Date.parse(q.validTill) - Date.parse(q.docDate)) / 86_400_000));
    const input: QuotationInput = {
      customerId: q.customer.id, docDate: today(), validTill: plusDays(today(), span || 15), subject: q.subject, salesRepUserId: q.salesRep?.id ?? null,
      branchId: q.branch?.id ?? null, priceListId: q.priceList?.id ?? null, remarks: q.remarks, terms: q.terms,
      lines: q.lines.map((l) => ({ itemId: l.item?.id ?? null, description: l.description, qtyCtn: l.qtyCtn, qtyLoose: l.qtyLoose, rate: l.rate, discountPct: l.discountPct, taxCodeId: l.taxCode?.id ?? null, taxRate: l.taxRate })),
    };
    const data = this.payload(await this.store.options(user.tenantId), input);
    const newId = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('quotationAddUpdate', { ...data, revisionOfId: id }));
    return this.get(user, newId);
  }

  /** Accepted (or sent, still valid) quotation → a draft sales order with its lines at the quoted rates. */
  async convert(user: SessionUser, meta: RequestMeta, id: string, input: QuotationConvertInput & { rowVersion: number }) {
    const q = await this.current(user, id, input.rowVersion);
    if (q.order) throw new ConflictError(`Already converted to ${q.order.docNo}.`, undefined, { code: 'QUOTATION_NOT_OPEN' });
    if (q.status === 'EXPIRED') throw new ConflictError('This quotation has expired. Revise it to send a new one.', undefined, { code: 'QUOTATION_EXPIRED' });
    if (!['SENT', 'ACCEPTED'].includes(q.status)) throw new ConflictError('Only a sent or accepted quotation can be converted.', undefined, { code: 'QUOTATION_NOT_OPEN' });
    const o = await this.store.options(user.tenantId);
    if (!o.warehouses.some((w) => w.id === input.warehouseId)) throw invalid({ warehouseId: 'Choose an active warehouse' });
    const customer = o.customers.find((c) => c.id === q.customer.id);
    const e: Record<string, string> = {};
    const { lines, totals } = salesLines(o, q.lines.map((l) => ({ itemId: l.item?.id ?? null, description: l.description, qtyCtn: l.qtyCtn, qtyLoose: l.qtyLoose, rate: l.rate, discountPct: l.discountPct, taxCodeId: l.taxCode?.id ?? null, taxRate: l.taxRate })), e);
    if (Object.keys(e).length) throw invalid(e);
    const orderId = await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (q.status === 'SENT') await this.store.run('quotationAccept', id);
      const soId = await this.store.save('salesOrderAddUpdate', {
        docDate: input.docDate, customerId: q.customer.id, quotationId: id, branchId: q.branch?.id ?? o.warehouses.find((w) => w.id === input.warehouseId)?.branchId ?? null,
        warehouseId: input.warehouseId, expectedDeliveryDate: input.expectedDeliveryDate ?? null, customerPoRef: input.customerPoRef ?? null, salesRepUserId: q.salesRep?.id ?? null,
        priceListId: q.priceList?.id ?? null, paymentTerms: customer?.paymentTerms ?? 'NET_30', reserveStock: input.reserveStock ?? true, remarks: `From ${q.docNo}`,
        grossAmount: totals.grossAmount, discountAmount: totals.discountAmount, taxAmount: totals.taxAmount, netAmount: totals.netAmount,
        lines: lines.map((l, i) => ({ ...l, quotationLineId: q.lines[i]!.id })),
      });
      await this.store.set('quotation', user.tenantId, id, { status: 'CONVERTED' });
      return soId;
    });
    return { quotation: await this.get(user, id), orderId };
  }

  // ---------------------------------------------------------------- helpers
  private payload(o: SalesDocOptions, p: QuotationInput, known?: Set<string>) {
    const e: Record<string, string> = {};
    if (!o.customers.some((x) => x.id === p.customerId)) e.customerId = 'Choose an active customer';
    if (p.branchId && !o.branches.some((x) => x.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (p.priceListId && !o.priceLists.some((x) => x.id === p.priceListId)) e.priceListId = 'Choose an active price list';
    if (p.salesRepUserId && !o.users.some((x) => x.id === p.salesRepUserId)) e.salesRepUserId = 'Choose an active user';
    const { lines, totals } = salesLines(o, p.lines, e, known);
    if (Object.keys(e).length) throw invalid(e);
    return {
      docDate: p.docDate, validTill: p.validTill, customerId: p.customerId, subject: p.subject ?? null, salesRepUserId: p.salesRepUserId ?? null, branchId: p.branchId ?? null,
      priceListId: p.priceListId ?? null, remarks: p.remarks ?? null, terms: p.terms ?? null,
      grossAmount: totals.grossAmount, discountAmount: totals.discountAmount, taxAmount: totals.taxAmount, netAmount: totals.netAmount, lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const q = await this.get(user, id);
    if (q.rowVersion !== rowVersion) throw new ConcurrencyError('This quotation was changed. Reload and try again.');
    return q;
  }
}
