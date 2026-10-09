import { Injectable, type OnModuleInit } from '@nestjs/common';
import { termDays, type SalesDocOptions, type SalesInvoice, type SalesInvoiceInput, type SalesQuery, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, PermissionDeniedError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService, type DocumentFacts } from '../../../approvals/application/approvals.service.js';
import { invalid, salesLines } from '../../common/application/sales-lines.js';
import { SalesStore, type InvoiceBase } from '../../common/application/sales-store.js';

const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const notEditable = () => new ConflictError('Only a draft invoice can be changed or posted. Void a posted invoice instead.', undefined, { code: 'INVOICE_NOT_EDITABLE' });

/**
 * Sales invoices (STANDARD) and the counter sales voucher (COUNTER). A draft is posted by sinv:post, or first approved
 * through the engine when a "Sales invoice" workflow applies (it stays a draft while waiting). Posting runs the
 * database's salesInvoicePost: credit control, stock issue FEFO across batches (or GDNI → COGS for challan lines),
 * Dr receivable / Cr revenue and output tax, order roll-ups, challans marked invoiced, and an FBR submission queued
 * when the company reports on posting (sent by the Phase 28 FBR client). Posted invoices are only voided.
 */
@Injectable()
export class SalesInvoicesService implements OnModuleInit {
  constructor(
    private readonly store: SalesStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['INV'],
      workflowSubject: 'SALES_INVOICE',
      link: (id) => `/sales/invoices/${id}`,
      lines: async (tenantId, id) => ((await this.store.getInvoice(tenantId, id))?.lines ?? []).map((l) => ({
        account: l.item ? `${l.item.sku} ${l.item.name}` : l.description ?? 'Line', particulars: `${l.baseQty} @ ${l.rate}`, debit: 0, credit: l.totalAmount,
      })),
      onApproved: async (tenantId, id, approverUserId, autoPost) => { if (autoPost) await this.store.run('salesInvoicePost', id); },
      onReturned: async () => { /* stays a draft */ },
    });
  }

  list(user: SessionUser, q: SalesQuery) {
    return this.store.listInvoices(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<SalesInvoice> {
    const inv = await this.store.getInvoice(user.tenantId, id);
    if (!inv) throw new NotFoundError('Invoice not found');
    const approval = await this.approvals.forEntity(user, 'INV', id);
    const routing = inv.status === 'DRAFT' && inv.channel === 'STANDARD' && approval?.status !== 'PENDING' && approval?.status !== 'APPROVED'
      ? await this.approvals.preview(user.tenantId, 'SALES_INVOICE', inv.netAmount, this.facts(inv), inv.createdBy?.id ?? user.id) : null;
    return { ...inv, approval, routing, awaitingApproval: approval?.status === 'PENDING', approvalId: approval?.status === 'PENDING' ? approval.id : null, canAct: !!approval?.canAct };
  }

  /** The invoice for sinv:view, or for the approver who can act on its current step. */
  async view(user: SessionUser, id: string) {
    const inv = await this.get(user, id);
    if (!user.permissions.includes('sinv:view') && !inv.canAct) throw new PermissionDeniedError('You do not have permission to do this.');
    return inv;
  }

  async create(user: SessionUser, meta: RequestMeta, input: SalesInvoiceInput) {
    const data = this.payload(await this.store.options(user.tenantId), input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('salesInvoiceAddUpdate', { ...data, salesRepUserId: data.salesRepUserId ?? user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: SalesInvoiceInput & { rowVersion: number }) {
    const inv = await this.current(user, id, input.rowVersion);
    if (inv.status !== 'DRAFT' || inv.awaitingApproval) throw notEditable();
    const data = this.payload(await this.store.options(user.tenantId), { ...input, channel: inv.channel as SalesInvoiceInput['channel'] }, new Set(inv.lines.map((l) => l.id)));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('salesInvoiceAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const inv = await this.current(user, id, rowVersion);
    if (inv.status !== 'DRAFT' || inv.awaitingApproval) throw new ConflictError('Only a draft invoice can be deleted; void a posted one instead.', undefined, { code: 'INVOICE_NOT_EDITABLE' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('invoice', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This invoice was changed. Reload and try again.');
  }

  /** A draft invoice for a delivered challan: its lines at the sales order's rates, discounts and tax. */
  async fromChallan(user: SessionUser, meta: RequestMeta, challanId: string) {
    const dc = await this.store.getChallan(user.tenantId, challanId);
    if (!dc) throw new NotFoundError('Delivery challan not found');
    if (dc.status !== 'DELIVERED') throw new ConflictError('Only a delivered challan that is not invoiced yet can be invoiced.', undefined, { code: 'CHALLAN_NOT_DELIVERED' });
    const [so, o] = await Promise.all([this.store.getOrder(user.tenantId, dc.salesOrder.id), this.store.options(user.tenantId)]);
    if (!so) throw new NotFoundError('Sales order not found');
    const customer = o.customers.find((c) => c.id === dc.customer.id);
    const input: SalesInvoiceInput = {
      channel: 'STANDARD', customerId: dc.customer.id, docDate: dc.docDate > new Date().toISOString().slice(0, 10) ? dc.docDate : new Date().toISOString().slice(0, 10),
      branchId: dc.branch?.id ?? so.branch?.id ?? o.warehouses.find((w) => w.id === dc.warehouse.id)?.branchId ?? o.branches[0]?.id ?? '',
      warehouseId: dc.warehouse.id, salesOrderId: so.id, deliveryChallanId: dc.id, customerPoNo: so.customerPoRef, customerPoDate: so.customerPoDate,
      salesRepUserId: so.salesRep?.id ?? null, priceListId: so.priceList?.id ?? null, paymentTerms: so.paymentTerms ?? customer?.paymentTerms ?? 'NET_30', submitToFbr: o.fbr.active,
      lines: dc.lines.map((l) => {
        const ol = so.lines.find((x) => x.id === l.salesOrderLineId)!;
        return {
          itemId: l.item.id, description: ol.description, qtyCtn: 0, qtyLoose: l.baseQty, rate: ol.rate, discountPct: ol.discountPct, taxCodeId: ol.taxCode?.id ?? null,
          taxRate: ol.taxRate, salesOrderLineId: ol.id, deliveryChallanLineId: l.id, batchId: l.batchId,
        };
      }),
    };
    return this.create(user, meta, input);
  }

  /** Sends the invoice to its approval workflow (it stays a draft); with none, 409 APPROVAL_NO_WORKFLOW (post it directly). */
  async submit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const inv = await this.current(user, id, rowVersion);
    if (inv.status !== 'DRAFT' || inv.awaitingApproval) throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const req = await this.approvals.submit(user, { entityType: 'INV', entityId: id, docLabel: inv.docNo, title: inv.customer.name, amount: inv.netAmount, branchId: inv.branch.id, facts: this.facts(inv) });
      if (!req) throw new ConflictError('No approval workflow covers this invoice. Post it directly.', undefined, { code: 'APPROVAL_NO_WORKFLOW' });
    });
    return this.get(user, id);
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const inv = await this.get(user, id);
    if (!inv.approvalId) throw new ConflictError('This invoice isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, inv.approvalId, 'approve', { reason: null, comment });
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const inv = await this.get(user, id);
    if (!inv.approvalId) throw new ConflictError('This invoice isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, inv.approvalId, 'reject', { reason, comment: null });
    return this.get(user, id);
  }

  async recall(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const inv = await this.current(user, id, rowVersion);
    if (!inv.awaitingApproval) throw new ConflictError('Only an invoice waiting for approval can be recalled.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.approvals.cancelFor(user, 'INV', id, 'Recalled by the preparer'));
    return this.get(user, id);
  }

  /** Posts a draft no workflow covers, or one whose approval is complete (409 INVOICE_APPROVAL_REQUIRED otherwise). */
  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const inv = await this.current(user, id, rowVersion);
    if (inv.status !== 'DRAFT') throw notEditable();
    if (inv.awaitingApproval) throw new ConflictError('This invoice is waiting for approval.', undefined, { code: 'INVOICE_APPROVAL_REQUIRED' });
    if ((inv.approval as { status?: string } | null)?.status !== 'APPROVED' && inv.channel === 'STANDARD' && (await this.approvals.route(user.tenantId, 'SALES_INVOICE', inv.netAmount, this.facts(inv)))) {
      throw new ConflictError('An approval workflow covers this invoice. Submit it for approval before posting.', undefined, { code: 'INVOICE_APPROVAL_REQUIRED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('salesInvoicePost', id));
    return this.get(user, id);
  }

  /** Voids a posted invoice: journal, stock and order roll-ups reversed; challans go back to delivered. */
  async void(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const inv = await this.current(user, id, rowVersion);
    if (inv.status === 'VOID') return inv;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('salesInvoiceVoid', id, reason));
    return this.get(user, id);
  }

  /** The counter sales voucher: saved as a COUNTER invoice (SV number) and, unless kept as a draft, posted in the same transaction. */
  async voucher(user: SessionUser, meta: RequestMeta, input: SalesInvoiceInput & { post: boolean }) {
    if (input.post && !user.permissions.includes('sinv:post')) throw new ForbiddenError('You can’t post sales vouchers; save it as a draft.');
    return this.get(user, await this.saveAndPost(user, meta, { ...input, channel: 'COUNTER' }, input.post));
  }

  /**
   * Saves an invoice and, when asked, posts it in the same transaction (joins the caller's transaction when there is
   * one). Used by the counter voucher and by wholesale (quick entry, bookings, bulk runs, back-orders); returns its id.
   */
  async saveAndPost(user: SessionUser, meta: RequestMeta, input: SalesInvoiceInput, post: boolean) {
    const data = this.payload(await this.store.options(user.tenantId), input);
    return this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save('salesInvoiceAddUpdate', { ...data, salesRepUserId: data.salesRepUserId ?? user.id });
      if (post) await this.store.run('salesInvoicePost', newId);
      return newId;
    });
  }

  // ---------------------------------------------------------------- helpers
  private facts(inv: Pick<InvoiceBase, 'branch' | 'customer'>): DocumentFacts {
    return { DOC_TYPE: 'INV', BRANCH: inv.branch.id, CUSTOMER: inv.customer.id };
  }

  private payload(o: SalesDocOptions, p: SalesInvoiceInput, known?: Set<string>) {
    const e: Record<string, string> = {};
    const c = o.customers.find((x) => x.id === p.customerId);
    if (!c) e.customerId = 'Choose an active customer';
    if (!o.branches.some((x) => x.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (p.warehouseId && !o.warehouses.some((x) => x.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (!p.warehouseId && p.lines.some((l) => l.itemId && !l.deliveryChallanLineId)) e.warehouseId = 'Choose the warehouse the goods leave from';
    if (p.priceListId && !o.priceLists.some((x) => x.id === p.priceListId)) e.priceListId = 'Choose an active price list';
    if (p.salesRepUserId && !o.users.some((x) => x.id === p.salesRepUserId)) e.salesRepUserId = 'Choose an active user';
    if (!o.paymentTerms.some((x) => x.code === p.paymentTerms)) e.paymentTerms = 'Choose payment terms';
    const { lines, totals } = salesLines(o, p.lines, e, known);
    if (Object.keys(e).length) throw invalid(e);
    return {
      channel: p.channel ?? 'STANDARD', docDate: p.docDate, customerId: p.customerId, branchId: p.branchId, warehouseId: p.warehouseId ?? null, salesOrderId: p.salesOrderId ?? null,
      deliveryChallanId: p.deliveryChallanId ?? null, customerPoNo: p.customerPoNo ?? null, customerPoDate: p.customerPoDate ?? null, salesRepUserId: p.salesRepUserId ?? null,
      priceListId: p.priceListId ?? null, paymentTerms: p.paymentTerms, dueDate: p.dueDate ?? plusDays(p.docDate, termDays(p.paymentTerms)), saleType: p.saleType ?? 'REGULAR',
      buyerName: c!.name, buyerAddress: c!.address, buyerNtn: c!.ntn, buyerStrn: c!.strn, buyerCnic: c!.cnic, buyerCity: c!.city, contactPhone: c!.phone, contactEmail: c!.email,
      submitToFbr: p.submitToFbr ?? true, customerNotes: p.customerNotes ?? null, termsConditions: p.termsConditions ?? null, remarks: p.remarks ?? null,
      billBookNo: p.billBookNo ?? null, bookerName: p.bookerName ?? null, deliverymanName: p.deliverymanName ?? null, salesmanName: p.salesmanName ?? null,
      supervisorName: p.supervisorName ?? null, deliverySlot: p.deliverySlot ?? null,
      priceTier: p.priceTier ?? null, priceTierFactor: p.priceTierFactor ?? 1, routeId: p.routeId ?? null,
      bookerEmployeeId: p.bookerEmployeeId ?? null, salesmanEmployeeId: p.salesmanEmployeeId ?? null,
      grossAmount: totals.grossAmount, discountAmount: totals.discountAmount, taxableAmount: totals.taxableAmount, taxAmount: totals.taxAmount, netAmount: totals.netAmount, lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const inv = await this.get(user, id);
    if (inv.rowVersion !== rowVersion) throw new ConcurrencyError('This invoice was changed. Reload and try again.');
    return inv;
  }
}
