import { Injectable, type OnModuleInit } from '@nestjs/common';
import { baseQtyOf, docTotals, lineAmounts, type PoInput, type PurchaseOptions, type PurchaseOrder, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService, type DocumentFacts } from '../../../approvals/application/approvals.service.js';
import { PurchasingStore, type ListQuery, type OrderBase } from '../../common/application/purchasing-store.js';

const EDITABLE = ['DRAFT'];
const PENDING = ['PENDING_L1', 'PENDING_L2'];
const notEditable = () => new ConflictError('Only a draft purchase order can be changed.', undefined, { code: 'PO_NOT_EDITABLE' });
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * Purchase orders: draft → (approval engine when a "Purchase order" workflow applies, PENDING_L1 / L2; otherwise a user
 * with po:approve approves directly) → approved → received / billed (database roll-ups from GRNs and bills).
 * Cancelled before anything is received.
 */
@Injectable()
export class PurchaseOrdersService implements OnModuleInit {
  constructor(
    private readonly store: PurchasingStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['PO'],
      workflowSubject: 'PURCHASE_ORDER',
      link: (id) => `/purchases/orders?po=${id}`,
      lines: async (tenantId, id) => ((await this.store.getOrder(tenantId, id))?.lines ?? []).map((l) => ({
        account: l.item ? `${l.item.sku} ${l.item.name}` : l.description ?? 'Line', particulars: `${l.baseQty} @ ${l.rate}`, debit: l.totalAmount, credit: 0,
      })),
      onApproved: async (tenantId, id) => { await this.store.run('purchaseOrderApprove', id, null); },
      onReturned: async (tenantId, id) => { await this.store.set('order', tenantId, id, { status: 'DRAFT' }); },
      onStepChange: async (tenantId, id, step) => { await this.store.set('order', tenantId, id, { status: step.stepNo > 1 ? 'PENDING_L2' : 'PENDING_L1' }); },
    });
  }

  list(user: SessionUser, q: ListQuery) {
    return this.store.listOrders(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<PurchaseOrder> {
    const po = await this.store.getOrder(user.tenantId, id);
    if (!po) throw new NotFoundError('Purchase order not found');
    const approval = await this.approvals.forEntity(user, 'PO', id);
    const routing = po.status === 'DRAFT' ? await this.approvals.preview(user.tenantId, 'PURCHASE_ORDER', po.totalAmount, this.facts(po), po.createdBy?.id ?? user.id) : null;
    return { ...po, approval, routing, approvalId: approval?.status === 'PENDING' ? approval.id : null, canAct: !!approval?.canAct };
  }

  async create(user: SessionUser, meta: RequestMeta, input: PoInput) {
    const data = this.payload(await this.store.options(user.tenantId), input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('purchaseOrderAddUpdate', { ...data, buyerUserId: input.buyerUserId ?? user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: PoInput & { rowVersion: number }) {
    const po = await this.current(user, id, input.rowVersion);
    if (!EDITABLE.includes(po.status)) throw notEditable();
    const known = new Set(po.lines.map((l) => l.id));
    const data = this.payload(await this.store.options(user.tenantId), { ...input, lines: input.lines.map((l) => (l.id && known.has(l.id) ? l : { ...l, id: null })) });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('purchaseOrderAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const po = await this.current(user, id, rowVersion);
    if (po.status !== 'DRAFT' || po.submittedAt) throw new ConflictError('Only a purchase order that was never submitted can be deleted; cancel it instead.', undefined, { code: 'PO_NOT_EDITABLE' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('order', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This purchase order was changed. Reload and try again.');
  }

  /** Sends the PO to its approval workflow; with none, 409 APPROVAL_NO_WORKFLOW (approve it directly). */
  async submit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const po = await this.current(user, id, rowVersion);
    if (po.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set('order', user.tenantId, id, { status: 'PENDING_L1', submittedAt: new Date() });
      const req = await this.approvals.submit(user, { entityType: 'PO', entityId: id, docLabel: po.docNo, title: po.vendor.name, amount: po.totalAmount, branchId: po.branch.id, facts: this.facts(po) });
      if (!req) throw new ConflictError('No approval workflow covers this purchase order. Approve it directly.', undefined, { code: 'APPROVAL_NO_WORKFLOW' });
    });
    return this.get(user, id);
  }

  /** Approves through the PO's approval request; with no workflow, po:approve approves directly. */
  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const po = await this.get(user, id);
    if (po.approvalId) {
      await this.approvals.act(user, meta, po.approvalId, 'approve', { reason: null, comment });
      return this.get(user, id);
    }
    if (!user.permissions.includes('po:approve')) throw new ForbiddenError('You can’t approve purchase orders.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
    if (po.status !== 'DRAFT') throw notEditable();
    if (po.routing) throw new ConflictError('An approval workflow covers this purchase order. Submit it for approval.', undefined, { code: 'PO_APPROVAL_REQUIRED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('purchaseOrderApprove', id, comment));
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const po = await this.get(user, id);
    if (!po.approvalId) throw new ConflictError('This purchase order isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, po.approvalId, 'reject', { reason, comment: null });
    return this.get(user, id);
  }

  /** Recalls a submitted PO (the preparer) back to draft. */
  async recall(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const po = await this.current(user, id, rowVersion);
    if (!PENDING.includes(po.status)) throw new ConflictError('Only a purchase order waiting for approval can be recalled.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'PO', id, 'Recalled by the preparer');
      await this.store.set('order', user.tenantId, id, { status: 'DRAFT' });
    });
    return this.get(user, id);
  }

  /** Cancels a PO nothing was received against yet (a pending approval request is withdrawn with it). */
  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const po = await this.current(user, id, rowVersion);
    if (po.status === 'CANCELLED') return po;
    if (po.lines.some((l) => l.receivedQty > 0) || ['PARTIALLY_RECEIVED', 'RECEIVED', 'BILLED'].includes(po.status)) {
      throw new ConflictError('Goods were already received against this purchase order; it can’t be cancelled.', undefined, { code: 'PO_NOT_EDITABLE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'PO', id, reason);
      await this.store.run('purchaseOrderCancel', id, reason);
    });
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private facts(po: Pick<OrderBase, 'branch' | 'costCentre'>): DocumentFacts {
    return { DOC_TYPE: 'PO', BRANCH: po.branch.id, ...(po.costCentre && { COST_CENTRE: po.costCentre.id }) };
  }

  private payload(o: PurchaseOptions, p: PoInput) {
    const e: Record<string, string> = {};
    if (!o.vendors.some((x) => x.id === p.vendorId)) e.vendorId = 'Choose an active vendor';
    if (!o.branches.some((x) => x.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (p.warehouseId && !o.warehouses.some((x) => x.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (p.costCentreId && !o.costCentres.some((x) => x.id === p.costCentreId)) e.costCentreId = 'Choose an active cost centre';
    if (p.departmentId && !o.departments.some((x) => x.id === p.departmentId)) e.departmentId = 'Choose an active department';
    if (p.projectId && !o.projects.some((x) => x.id === p.projectId)) e.projectId = 'Choose an open project';
    if (!o.paymentTerms.some((x) => x.code === p.paymentTerms)) e.paymentTerms = 'Choose payment terms';
    const lines = p.lines.map((l, i) => {
      const item = l.itemId ? o.products.find((x) => x.id === l.itemId) : null;
      if (l.itemId && !item) e[`lines.${i}.itemId`] = 'Choose an active product';
      if (l.accountId && !o.accounts.some((x) => x.id === l.accountId)) e[`lines.${i}.accountId`] = 'Choose a postable account';
      if (l.taxCodeId && !o.taxCodes.some((x) => x.id === l.taxCodeId)) e[`lines.${i}.taxCodeId`] = 'Choose an active tax code';
      if (l.costCentreId && !o.costCentres.some((x) => x.id === l.costCentreId)) e[`lines.${i}.costCentreId`] = 'Choose an active cost centre';
      const baseQty = baseQtyOf(l.qtyCtn, l.qtyLoose, item?.ctn ?? 1);
      const a = lineAmounts({ baseQty, rate: l.rate, discountPct: l.discountPct, taxRate: l.taxRate });
      return {
        ...(l.id && { id: l.id }), lineNo: i + 1, itemId: l.itemId, description: l.description, accountId: l.accountId, qtyCtn: l.qtyCtn, qtyLoose: l.qtyLoose,
        baseQty, bonusQty: l.bonusQty, rate: l.rate, discountPct: l.discountPct, taxCodeId: l.taxCodeId, taxRate: l.taxRate, costCentreId: l.costCentreId, remarks: l.remarks,
        grossAmount: a.grossAmount, discountAmount: a.discountAmount, netAmount: a.netAmount, taxAmount: a.taxAmount, totalAmount: a.totalAmount, _a: a,
      };
    });
    if (Object.keys(e).length) throw v(e);
    const t = docTotals(lines.map((l) => l._a));
    return {
      docDate: p.docDate, vendorId: p.vendorId, branchId: p.branchId, warehouseId: p.warehouseId, expectedDate: p.expectedDate, paymentTerms: p.paymentTerms, creditDays: p.creditDays,
      costCentreId: p.costCentreId, departmentId: p.departmentId, projectId: p.projectId, buyerUserId: p.buyerUserId, remarks: p.remarks,
      grossAmount: t.grossAmount, discountAmount: t.discountAmount, netAmount: t.netAmount, taxAmount: t.taxAmount, totalAmount: t.totalAmount,
      lines: lines.map(({ _a, ...l }) => { void _a; return l; }),
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const po = await this.store.getOrder(user.tenantId, id);
    if (!po) throw new NotFoundError('Purchase order not found');
    if (po.rowVersion !== rowVersion) throw new ConcurrencyError('This purchase order was changed. Reload and try again.');
    return po;
  }
}
