import { Injectable } from '@nestjs/common';
import {
  invoiceTotals,
  type AdminSession, type BillingRunResult, type InvoiceCreate, type InvoiceGenerate, type InvoiceGenerateResult, type InvoiceLineInput, type InvoiceList,
  type InvoiceListQuery, type InvoiceUpdate, type InvoiceVoid, type PlatformInvoiceDetail,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { todayPk } from '../../../tenants/subscriptions/domain/billing.js';
import { PaymentStore } from '../../payments/application/payment-store.js';
import { prorate } from '../domain/proration.js';
import { InvoiceStore } from './invoice-store.js';

const notDraft = () => new ConflictError('Only a draft invoice can be changed or issued. Void it and issue a new one instead.', undefined, { code: 'INVOICE_NOT_DRAFT' });
const stale = () => new ConcurrencyError('Someone else changed this invoice. Reload and try again.');
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Platform invoices (Super Admin › Billing › Platform Invoices). Manual invoices start as drafts; subscription invoices
 * are generated from the subscription (plan, add-ons, coupon, provincial sales tax) by Platform.platformInvoiceGenerate.
 * Issuing assigns the FS-INV number; an issued invoice is never edited (void + new).
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly store: InvoiceStore,
    private readonly payments: PaymentStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(q: InvoiceListQuery): Promise<InvoiceList> {
    const today = todayPk();
    const month = q.month ?? today.slice(0, 7);
    const [page, kpis, months] = await Promise.all([this.store.list(q, today), this.store.kpis(month), this.store.months()]);
    return { ...page, kpis, months };
  }

  async get(id: string): Promise<PlatformInvoiceDetail> {
    const inv = await this.store.detail(id, todayPk());
    if (!inv) throw new NotFoundError('Invoice not found');
    return { ...inv, payments: await this.payments.forInvoice(id) };
  }

  async create(admin: AdminSession, meta: RequestMeta, input: InvoiceCreate): Promise<PlatformInvoiceDetail> {
    if (!(await this.store.tenantExists(input.tenantId))) throw new ValidationError('Choose an existing company', { tenantId: ['Unknown company'] });
    const data = await this.draftData(input.tenantId, input);
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ tenantId: input.tenantId, ...data }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: InvoiceUpdate): Promise<PlatformInvoiceDetail> {
    const inv = await this.draft(id, input.rowVersion);
    const data = await this.draftData(inv.tenantId, input);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, ...data }));
    return this.get(id);
  }

  async issue(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<PlatformInvoiceDetail> {
    await this.draft(id, rowVersion);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.issue(id));
    return this.get(id);
  }

  async void(admin: AdminSession, meta: RequestMeta, id: string, input: InvoiceVoid): Promise<PlatformInvoiceDetail> {
    const inv = await this.get(id);
    if (inv.rowVersion !== input.rowVersion) throw stale();
    if (inv.status === 'VOID') throw new ConflictError('This invoice is already void.', undefined, { code: 'INVOICE_NOT_DRAFT' });
    if (inv.paidAmount > 0) throw new ConflictError('This invoice has payments allocated. Refund them before voiding it.', undefined, { code: 'INVOICE_HAS_PAYMENTS' });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.voidInvoice(id, input.reason));
    return this.get(id);
  }

  /**
   * Generates subscription invoices for one company (its period starting on `period`, default its current period) or
   * for every live paid subscription whose current period has no invoice yet. `issue` issues them straight away.
   */
  async generate(admin: AdminSession, meta: RequestMeta, period: string | undefined, input: InvoiceGenerate): Promise<InvoiceGenerateResult> {
    const result: InvoiceGenerateResult = { generated: 0, issued: 0, invoices: [], skipped: [] };
    const ctx = adminActorContext(admin, meta);
    const couponId = input.couponCode ? await this.store.couponByCode(input.couponCode) : null;
    if (input.couponCode && !couponId) throw new ValidationError('Unknown coupon code', { couponCode: ['No such coupon'] });
    if (input.tenantId) {
      const start = period ?? (await this.store.subscriptionPeriod(input.tenantId));
      if (!start) throw new ConflictError('This company has no paid live subscription to invoice.', undefined, { code: 'INVOICE_NO_SUBSCRIPTION' });
      const id = await this.unitOfWork.run(ctx, () => this.generateOne(input.tenantId!, start, couponId, input.issue, result));
      result.invoices.push((await this.store.get(id, todayPk()))!);
      return result;
    }
    if (couponId) throw new ValidationError('A coupon applies to one company: choose it', { tenantId: ['Required with a coupon'] });
    for (const s of await this.store.dueSubscriptions(period ?? todayPk())) {
      try {
        const id = await this.unitOfWork.run(ctx, () => this.generateOne(s.tenantId, s.periodStart, null, input.issue, result));
        result.invoices.push((await this.store.get(id, todayPk()))!);
      } catch (e) {
        result.skipped.push({ tenantName: s.tenantName, reason: message(e) });
      }
    }
    return result;
  }

  /** The invoicing half of a billing run: bills and issues every live paid subscription's current period without an invoice. */
  async run(context: AuditContext, asOf: string, result: BillingRunResult): Promise<void> {
    for (const s of await this.store.dueSubscriptions(asOf)) {
      try {
        const counts = { generated: 0, issued: 0, invoices: [], skipped: [] } as InvoiceGenerateResult;
        await this.unitOfWork.run(context, () => this.generateOne(s.tenantId, s.periodStart, null, true, counts));
        result.invoicesGenerated += counts.generated;
        result.invoicesIssued += counts.issued;
      } catch (e) {
        result.errors.push({ subject: s.tenantName, message: message(e) });
      }
    }
  }

  private async generateOne(tenantId: string, periodStart: string, couponId: string | null, issue: boolean, result: InvoiceGenerateResult) {
    const id = await this.store.generate(tenantId, periodStart, couponId);
    const inv = await this.store.get(id, todayPk());
    if (inv && inv.status === 'DRAFT') {
      result.generated += 1;
      if (issue) {
        await this.store.issue(id);
        result.issued += 1;
      }
    }
    return id;
  }

  /** The payload of platformInvoiceAddUpdate: lines (prorated where asked), the tax rate and the totals. */
  private async draftData(tenantId: string, input: InvoiceCreate | InvoiceUpdate) {
    const lines = input.lines.map((l: InvoiceLineInput, i) => {
      let unitPrice = l.unitPrice;
      if (l.prorateFrom && l.lineKind.startsWith('PRORATION')) {
        if (!input.periodStart || !input.periodEnd) throw new ValidationError('Set the invoice period to prorate a line', { periodStart: ['Required to prorate'] });
        unitPrice = prorate(l.unitPrice, input.periodStart, input.periodEnd, l.prorateFrom);
      }
      return { lineNo: i + 1, lineKind: l.lineKind, description: l.description, quantity: l.quantity, unitPrice, amount: Math.round(l.quantity * unitPrice * 100) / 100 };
    });
    const tax = await this.store.tenantTax(tenantId, input.issuedOn);
    const taxRate = input.taxRate ?? tax.rate;
    const t = invoiceTotals(lines, input.discountAmount, taxRate);
    if (t.gross < 0) throw new ValidationError('The lines add up to less than zero', { lines: ['Total below zero'] });
    if (t.discount > t.gross) throw new ValidationError('The discount is more than the lines', { discountAmount: ['At most the subtotal'] });
    if (input.periodStart && input.periodEnd && input.periodEnd < input.periodStart) throw new ValidationError('The period ends before it starts', { periodEnd: ['After the start'] });
    return {
      invoiceKind: input.invoiceKind, description: input.description, issuedOn: input.issuedOn, dueOn: input.dueOn,
      periodStart: input.periodStart ?? null, periodEnd: input.periodEnd ?? null, grossAmount: t.gross, discountAmount: t.discount, netAmount: t.net,
      taxAuthorityId: tax.authorityId, taxRate, taxAmount: t.tax, totalAmount: t.total, lines,
    };
  }

  private async draft(id: string, rowVersion: number) {
    const inv = await this.store.get(id, todayPk());
    if (!inv) throw new NotFoundError('Invoice not found');
    if (inv.status !== 'DRAFT') throw notDraft();
    if (inv.rowVersion !== rowVersion) throw stale();
    return inv;
  }
}
