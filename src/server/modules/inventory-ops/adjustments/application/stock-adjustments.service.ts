import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { AdjustmentInput, SessionUser, StockAdjustment } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService, type DocumentFacts } from '../../../approvals/application/approvals.service.js';
import { StockOpsStore, type AdjustmentBase, type OpsQuery } from '../../common/application/stock-ops-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft adjustment can be changed. Cancel a posted one instead.', undefined, { code: 'STOCK_DOC_NOT_EDITABLE' });

/**
 * Stock adjustments: counted quantity vs book, per item / batch. Draft → (approval engine when a "Stock adjustment"
 * workflow applies; final approval posts) → posted (database stockAdjustmentPost: write-off / adjustment movements and
 * Dr / Cr inventory against the reason's or offset account). Without a workflow adj:post posts directly.
 */
@Injectable()
export class StockAdjustmentsService implements OnModuleInit {
  constructor(
    private readonly store: StockOpsStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['ADJ'],
      workflowSubject: 'STOCK_ADJUSTMENT',
      link: (id) => `/inventory/adjustments?adj=${id}`,
      lines: async (tenantId, id) => ((await this.store.getAdjustment(tenantId, id))?.lines ?? []).map((l) => ({
        account: `${l.item.sku} ${l.item.name}`, particulars: `${l.qtyOnHand} → ${l.qtyCounted}`, debit: l.value > 0 ? l.value : 0, credit: l.value < 0 ? -l.value : 0,
      })),
      onApproved: async (tenantId, id, approverUserId) => {
        await this.store.set('adjustment', tenantId, id, { approvedByUserId: approverUserId, approvedAt: new Date() });
        await this.store.run('stockAdjustmentPost', id);
      },
      onReturned: async (tenantId, id, action, reason) => { await this.store.set('adjustment', tenantId, id, { status: 'DRAFT', rejectionReason: reason }); },
    });
  }

  list(user: SessionUser, q: OpsQuery) {
    return this.store.listAdjustments(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<StockAdjustment> {
    const a = await this.store.getAdjustment(user.tenantId, id);
    if (!a) throw new NotFoundError('Adjustment not found');
    const approval = await this.approvals.forEntity(user, 'ADJ', id);
    const routing = a.status === 'DRAFT' ? await this.approvals.preview(user.tenantId, 'STOCK_ADJUSTMENT', Math.abs(a.netValue), this.facts(a), a.preparedBy?.id ?? user.id) : null;
    return { ...a, approval, routing, approvalId: approval?.status === 'PENDING' ? approval.id : null, canAct: !!approval?.canAct };
  }

  async create(user: SessionUser, meta: RequestMeta, input: AdjustmentInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('stockAdjustmentAddUpdate', { ...data, preparedByUserId: user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: AdjustmentInput & { rowVersion: number }) {
    const a = await this.current(user, id, input.rowVersion);
    if (a.status !== 'DRAFT') throw notEditable();
    const data = await this.payload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('stockAdjustmentAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const a = await this.current(user, id, rowVersion);
    if (a.status !== 'DRAFT') throw notEditable();
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('adjustment', user.tenantId, id, rowVersion)))) throw new ConcurrencyError('This adjustment was changed. Reload and try again.');
  }

  async submit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const a = await this.current(user, id, rowVersion);
    if (a.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set('adjustment', user.tenantId, id, { status: 'PENDING_APPROVAL', submittedAt: new Date(), approvalRequired: true });
      const req = await this.approvals.submit(user, { entityType: 'ADJ', entityId: id, docLabel: a.docNo, title: a.reason.label, amount: Math.abs(a.netValue), branchId: null, facts: this.facts(a) });
      if (!req) throw new ConflictError('No approval workflow covers this adjustment. Post it directly.', undefined, { code: 'APPROVAL_NO_WORKFLOW' });
    });
    return this.get(user, id);
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const a = await this.get(user, id);
    if (!a.approvalId) throw new ConflictError('This adjustment isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, a.approvalId, 'approve', { reason: null, comment });
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const a = await this.get(user, id);
    if (!a.approvalId) throw new ConflictError('This adjustment isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, a.approvalId, 'reject', { reason, comment: null });
    return this.get(user, id);
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const a = await this.current(user, id, rowVersion);
    if (a.status !== 'DRAFT') throw a.status === 'PENDING_APPROVAL' ? new ConflictError('Waiting for approval; final approval posts it.', undefined, { code: 'ADJUSTMENT_APPROVAL_REQUIRED' }) : notEditable();
    if (await this.approvals.route(user.tenantId, 'STOCK_ADJUSTMENT', Math.abs(a.netValue), this.facts(a))) {
      throw new ConflictError('An approval workflow covers this adjustment. Submit it for approval.', undefined, { code: 'ADJUSTMENT_APPROVAL_REQUIRED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('stockAdjustmentPost', id));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const a = await this.current(user, id, rowVersion);
    if (a.status === 'CANCELLED') return a;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (a.status === 'PENDING_APPROVAL') await this.approvals.cancelFor(user, 'ADJ', id, reason);
      await this.store.run('stockAdjustmentCancel', id, reason);
    });
    return this.get(user, id);
  }

  private facts(a: Pick<AdjustmentBase, 'reason'>): DocumentFacts {
    return { DOC_TYPE: 'ADJ', REASON: a.reason.code };
  }

  private async payload(user: SessionUser, p: AdjustmentInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.warehouses.some((x) => x.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    const reason = o.reasons.find((x) => x.id === p.reasonId);
    if (!reason) e.reasonId = 'Choose a reason';
    if (p.offsetAccountId && !o.accounts.some((x) => x.id === p.offsetAccountId)) e.offsetAccountId = 'Choose a postable account';
    p.lines.forEach((l, i) => { if (!o.products.some((x) => x.id === l.itemId)) e[`lines.${i}.itemId`] = 'Choose an active product'; });
    if (Object.keys(e).length) throw v(e);
    const stock = await this.store.onHand(user.tenantId, p.warehouseId, p.lines.map((l) => l.itemId));
    const lines = p.lines.map((l, i) => {
      const onHand = stock.filter((s) => s.itemId === l.itemId && (l.batchId ? s.batchId === l.batchId : true)).reduce((s, x) => s + x.qtyOnHand, 0);
      const unitCost = o.products.find((x) => x.id === l.itemId)!.avgCost;
      return { lineNo: i + 1, itemId: l.itemId, batchId: l.batchId, qtyOnHand: onHand, qtyCounted: l.qtyCounted, unitCost };
    });
    return {
      docDate: p.docDate, warehouseId: p.warehouseId, reasonId: p.reasonId, offsetAccountId: p.offsetAccountId, remarks: p.remarks, lineCount: lines.length,
      netValue: r2(lines.reduce((s, l) => s + (l.qtyCounted - l.qtyOnHand) * l.unitCost, 0)), approvalRequired: false, lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const a = await this.store.getAdjustment(user.tenantId, id);
    if (!a) throw new NotFoundError('Adjustment not found');
    if (a.rowVersion !== rowVersion) throw new ConcurrencyError('This adjustment was changed. Reload and try again.');
    return a;
  }
}
