import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { SalesDocOptions, SalesOrder, SalesOrderInput, SalesQuery, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService, type DocumentFacts } from '../../../approvals/application/approvals.service.js';
import { invalid, salesLines } from '../../common/application/sales-lines.js';
import { SalesStore, type OrderBase } from '../../common/application/sales-store.js';

const notEditable = () => new ConflictError('Only a draft sales order can be changed.', undefined, { code: 'SALES_ORDER_NOT_EDITABLE' });

/**
 * Sales orders: draft → (approval engine when a "Sales order" workflow applies, PENDING_APPROVAL; otherwise quo:approve
 * confirms directly) → confirmed, with the credit check (on hold / over limit → 409 unless the approver holds crovr:approve
 * and overrides) and stock reserved in the ship-from warehouse → partly delivered / to invoice / invoiced as challans and
 * invoices post. Closed short or cancelled (nothing delivered) release the reservations.
 */
@Injectable()
export class SalesOrdersService implements OnModuleInit {
  constructor(
    private readonly store: SalesStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['SO'],
      workflowSubject: 'SALES_ORDER',
      link: (id) => `/sales/orders?so=${id}`,
      lines: async (tenantId, id) => ((await this.store.getOrder(tenantId, id))?.lines ?? []).map((l) => ({
        account: l.item ? `${l.item.sku} ${l.item.name}` : l.description ?? 'Line', particulars: `${l.baseQty} @ ${l.rate}`, debit: l.totalAmount, credit: 0,
      })),
      onApproved: async (tenantId, id) => { await this.store.confirmOrder(id, false); },
      onReturned: async (tenantId, id) => { await this.store.set('order', tenantId, id, { status: 'DRAFT' }); },
    });
  }

  list(user: SessionUser, q: SalesQuery) {
    return this.store.listOrders(user.tenantId, q);
  }

  deliverable(user: SessionUser) {
    return this.store.deliverableOrders(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<SalesOrder> {
    const so = await this.store.getOrder(user.tenantId, id);
    if (!so) throw new NotFoundError('Sales order not found');
    const approval = await this.approvals.forEntity(user, 'SO', id);
    const routing = so.status === 'DRAFT' ? await this.approvals.preview(user.tenantId, 'SALES_ORDER', so.netAmount, this.facts(so), so.createdBy?.id ?? user.id) : null;
    return { ...so, approval, routing, approvalId: approval?.status === 'PENDING' ? approval.id : null, canAct: !!approval?.canAct };
  }

  async create(user: SessionUser, meta: RequestMeta, input: SalesOrderInput) {
    const data = this.payload(await this.store.options(user.tenantId), input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('salesOrderAddUpdate', { ...data, salesRepUserId: data.salesRepUserId ?? user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: SalesOrderInput & { rowVersion: number }) {
    const so = await this.current(user, id, input.rowVersion);
    if (so.status !== 'DRAFT') throw notEditable();
    const data = this.payload(await this.store.options(user.tenantId), input, new Set(so.lines.map((l) => l.id)));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('salesOrderAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const so = await this.current(user, id, rowVersion);
    if (so.status !== 'DRAFT') throw new ConflictError('Only a draft sales order can be deleted; cancel or close it instead.', undefined, { code: 'SALES_ORDER_NOT_EDITABLE' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('order', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This sales order was changed. Reload and try again.');
  }

  /** Sends the order to its approval workflow; with none, 409 APPROVAL_NO_WORKFLOW (confirm it directly). */
  async submit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const so = await this.current(user, id, rowVersion);
    if (so.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set('order', user.tenantId, id, { status: 'PENDING_APPROVAL' });
      const req = await this.approvals.submit(user, { entityType: 'SO', entityId: id, docLabel: so.docNo, title: so.customer.name, amount: so.netAmount, branchId: so.branch?.id ?? null, facts: this.facts(so) });
      if (!req) throw new ConflictError('No approval workflow covers this sales order. Confirm it directly.', undefined, { code: 'APPROVAL_NO_WORKFLOW' });
    });
    return this.get(user, id);
  }

  /**
   * Approves through the order's approval request; with no workflow, quo:approve confirms directly. A credit override
   * (customer on hold / over limit) needs crovr:approve.
   */
  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null, overrideCredit: boolean) {
    const so = await this.get(user, id);
    if (overrideCredit && !user.permissions.includes('crovr:approve')) throw new ForbiddenError('You can’t override credit limits.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
    if (so.approvalId) {
      await this.approvals.act(user, meta, so.approvalId, 'approve', { reason: null, comment });
      return this.get(user, id);
    }
    if (!user.permissions.includes('quo:approve')) throw new ForbiddenError('You can’t confirm sales orders.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
    if (so.status !== 'DRAFT') throw notEditable();
    if (so.routing) throw new ConflictError('An approval workflow covers this sales order. Submit it for approval.', undefined, { code: 'SALES_ORDER_APPROVAL_REQUIRED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.confirmOrder(id, overrideCredit));
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const so = await this.get(user, id);
    if (!so.approvalId) throw new ConflictError('This sales order isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, so.approvalId, 'reject', { reason, comment: null });
    return this.get(user, id);
  }

  async recall(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const so = await this.current(user, id, rowVersion);
    if (so.status !== 'PENDING_APPROVAL') throw new ConflictError('Only a sales order waiting for approval can be recalled.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'SO', id, 'Recalled by the preparer');
      await this.store.set('order', user.tenantId, id, { status: 'DRAFT' });
    });
    return this.get(user, id);
  }

  async close(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('salesOrderClose', id, reason));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const so = await this.current(user, id, rowVersion);
    if (so.status === 'CANCELLED') return so;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (so.status === 'PENDING_APPROVAL') await this.approvals.cancelFor(user, 'SO', id, reason);
      await this.store.run('salesOrderCancel', id, reason);
    });
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private facts(so: Pick<OrderBase, 'branch' | 'customer'>): DocumentFacts {
    return { DOC_TYPE: 'SO', CUSTOMER: so.customer.id, ...(so.branch && { BRANCH: so.branch.id }) };
  }

  private payload(o: SalesDocOptions, p: SalesOrderInput, known?: Set<string>) {
    const e: Record<string, string> = {};
    if (!o.customers.some((x) => x.id === p.customerId)) e.customerId = 'Choose an active customer';
    if (p.branchId && !o.branches.some((x) => x.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (!o.warehouses.some((x) => x.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (p.priceListId && !o.priceLists.some((x) => x.id === p.priceListId)) e.priceListId = 'Choose an active price list';
    if (p.salesRepUserId && !o.users.some((x) => x.id === p.salesRepUserId)) e.salesRepUserId = 'Choose an active user';
    if (!o.paymentTerms.some((x) => x.code === p.paymentTerms)) e.paymentTerms = 'Choose payment terms';
    const { lines, totals } = salesLines(o, p.lines, e, known);
    if (Object.keys(e).length) throw invalid(e);
    return {
      docDate: p.docDate, customerId: p.customerId, branchId: p.branchId ?? o.warehouses.find((w) => w.id === p.warehouseId)?.branchId ?? null, warehouseId: p.warehouseId,
      expectedDeliveryDate: p.expectedDeliveryDate ?? null, customerPoRef: p.customerPoRef ?? null, customerPoDate: p.customerPoDate ?? null, salesRepUserId: p.salesRepUserId ?? null,
      priceListId: p.priceListId ?? null, paymentTerms: p.paymentTerms, reserveStock: p.reserveStock ?? true, remarks: p.remarks ?? null,
      grossAmount: totals.grossAmount, discountAmount: totals.discountAmount, taxAmount: totals.taxAmount, netAmount: totals.netAmount, lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const so = await this.store.getOrder(user.tenantId, id);
    if (!so) throw new NotFoundError('Sales order not found');
    if (so.rowVersion !== rowVersion) throw new ConcurrencyError('This sales order was changed. Reload and try again.');
    return so;
  }
}
