import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { SessionUser, SettlementDetail, SettlementPay, SettlementQuery, SettlementUpdate } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { ComponentStore } from '../../components/application/component-store.js';
import { StructureStore } from '../../structures/application/structure-store.js';
import { settlementSalaryFacts } from '../domain/settlement-facts.js';
import { SettlementStore, type SettlementBase } from './settlement-store.js';

const locked = (s: { docNo: string }, why: string) => new ConflictError(`${s.docNo}: ${why}.`, undefined, { code: 'FINAL_SETTLEMENT_LOCKED' });

/**
 * Full & final settlements (FS-), Phase 33. Started from an exit; Recalculate evaluates the last salary in the app
 * (Phase 12 structure lines, Phase 32 calculator for the exit month) and lets Payroll.finalSettlementCalculate do the
 * rest (gratuity rule, leave encashment, notice, loans, final-month tax, EOBI). Edited while DRAFT; submitted to the
 * FINAL_SETTLEMENT workflow (with none, a user with fs:approve decides); approval posts the JV; payment posts the BPV.
 * The preparer never approves. Completing the exit needs the settlement approved (database rule).
 */
@Injectable()
export class FinalSettlementsService implements OnModuleInit {
  constructor(
    private readonly store: SettlementStore,
    private readonly structures: StructureStore,
    private readonly components: ComponentStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['FS'],
      workflowSubject: 'FINAL_SETTLEMENT',
      link: (id) => `/hr/settlements/${id}`,
      lines: async (tenantId, id) => (await this.store.glPreview(tenantId, id)).map((l) => ({ account: l.account, particulars: l.particulars, debit: l.debit, credit: l.credit })),
      onApproved: async (_tenantId, id) => { await this.store.call('approve', id); },
      onReturned: async (_tenantId, id, action, reason) => { await this.store.call('sendBack', id, reason ?? (action === 'REJECT' ? 'Rejected' : 'Changes requested')); },
    });
  }

  list(user: SessionUser, q: SettlementQuery) {
    return this.store.list(user.tenantId, q);
  }

  options(user: SessionUser, id: string) {
    return this.store.options(user.tenantId, id);
  }

  private async base(user: SessionUser, id: string): Promise<SettlementBase> {
    const s = await this.store.get(user.tenantId, id);
    if (!s) throw new NotFoundError('Final settlement not found');
    return s;
  }

  async get(user: SessionUser, id: string): Promise<SettlementDetail> {
    const s = await this.base(user, id);
    const a = await this.approvals.forEntity(user, 'FS', id);
    const has = (p: string) => user.permissions.includes(p);
    const step = a?.status === 'PENDING' ? a.steps.find((x) => x.state === 'current') : null;
    const preparer = s.preparedBy?.id ?? s.createdBy?.id ?? null;
    const pending = s.status === 'PENDING_APPROVAL';
    return {
      ...s,
      approval: a ? { status: a.status, steps: a.steps.map((x) => ({ stepNo: x.stepNo, name: x.name, state: x.state, approvers: x.approvers.map((p) => p.name), actedBy: x.actedBy[0]?.name ?? null, actedAt: x.actedBy[0]?.at ?? null })) } : null,
      waitingOn: step ? `${step.name}${step.approvers.length ? ` — ${step.approvers.map((p) => p.name).join(', ')}` : ''}` : pending ? 'An approver with final settlement rights' : null,
      can: {
        edit: s.status === 'DRAFT' && has('fs:edit'),
        submit: s.status === 'DRAFT' && has('fs:edit') && s.lines.some((l) => l.amount > 0),
        approve: pending && preparer !== user.id && (a?.status === 'PENDING' ? !!a.canAct : has('fs:approve')),
        pay: s.status === 'APPROVED' && s.netAmount > 0 && has('fs:post'),
        cancel: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID'].includes(s.status) && s.exit.status !== 'CLOSED' && has('fs:edit'),
      },
    };
  }

  async ofOffboarding(user: SessionUser, offboardingId: string) {
    return this.store.ofOffboarding(user.tenantId, offboardingId);
  }

  /** From an exit: creates the settlement and calculates it in one transaction. */
  async start(user: SessionUser, meta: RequestMeta, offboardingId: string) {
    const facts = await this.factsForExit(user, offboardingId);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.start(offboardingId);
      await this.store.calculate(newId, facts);
      await this.store.setWords(user.tenantId, newId);
      return newId;
    });
    return this.get(user, id);
  }

  async calculate(user: SessionUser, meta: RequestMeta, id: string) {
    const s = await this.base(user, id);
    if (s.status !== 'DRAFT') throw locked(s, 'only a draft is recalculated');
    const facts = await this.factsForExit(user, s.exit.id);
    const summary = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const r = await this.store.calculate(id, facts);
      await this.store.setWords(user.tenantId, id);
      return r;
    });
    return { ...(await this.get(user, id)), summary };
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: SettlementUpdate) {
    const s = await this.base(user, id);
    if (s.status !== 'DRAFT') throw locked(s, 'only a draft can be edited');
    if (s.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this settlement. Reload and try again.');
    const data: Record<string, unknown> = { id, rowVersion: input.rowVersion };
    for (const k of ['remarks', 'pfTrustBalanceAmount', 'employeeBankId', 'payFromBankAccountId'] as const) if (input[k] !== undefined) data[k] = input[k];
    if (input.lines) data.lines = input.lines.map((l) => ({ ...l, ...(l.id ? {} : { id: undefined }) }));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save(data);
      await this.store.setWords(user.tenantId, id);
    });
    return this.get(user, id);
  }

  async submit(user: SessionUser, meta: RequestMeta, id: string) {
    const s = await this.base(user, id);
    if (s.status !== 'DRAFT') throw locked(s, 'only a draft is submitted');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.call('submit', id);
      const reqId = await this.approvals.submit(user, {
        entityType: 'FS', entityId: id, docLabel: s.docNo, title: `Final settlement · ${s.employee.name}`, amount: Math.max(0, s.netAmount),
        branchId: null, facts: { DOC_TYPE: 'FS' },
      });
      if (reqId) await this.store.setApprovalRequest(user.tenantId, id, reqId);
    });
    return this.get(user, id);
  }

  private async decide(user: SessionUser, meta: RequestMeta, id: string, act: 'approve' | 'reject' | 'changes', text: string | null) {
    const s = await this.get(user, id);
    if (s.status !== 'PENDING_APPROVAL') throw locked(s, 'it is not awaiting approval');
    if ((s.preparedBy?.id ?? s.createdBy?.id) === user.id) throw new ForbiddenError('You prepared this settlement, so someone else must approve it.', undefined, { code: 'FINAL_SETTLEMENT_PREPARER' });
    const req = await this.approvals.forEntity(user, 'FS', id);
    if (req?.status === 'PENDING') {
      await this.approvals.act(user, meta, req.id, act, act === 'approve' ? { reason: null, comment: text } : { reason: text, comment: null });
    } else {
      if (!user.permissions.includes('fs:approve')) throw new ForbiddenError('You can’t approve final settlements.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.call(act === 'approve' ? 'approve' : 'sendBack', id, text));
    }
    return this.get(user, id);
  }

  approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) { return this.decide(user, meta, id, 'approve', comment); }
  reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) { return this.decide(user, meta, id, 'reject', reason); }
  sendBack(user: SessionUser, meta: RequestMeta, id: string, reason: string) { return this.decide(user, meta, id, 'changes', reason); }

  async pay(user: SessionUser, meta: RequestMeta, id: string, input: SettlementPay) {
    const s = await this.base(user, id);
    if (s.status !== 'APPROVED') throw locked(s, 'it must be approved before it is paid');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.pay(id, { bankAccountId: input.bankAccountId, valueDate: input.valueDate, chequeNo: input.chequeNo }));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const s = await this.base(user, id);
    if (s.status === 'CANCELLED') throw locked(s, 'it is already cancelled');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (s.status === 'PENDING_APPROVAL') await this.approvals.cancelFor(user, 'FS', id, reason);
      await this.store.call('cancel', id, reason);
    });
    return this.get(user, id);
  }

  /** The app-side salary facts of the exiting employee (salary in force on the last working day). */
  private async factsForExit(user: SessionUser, offboardingId: string) {
    const exit = await this.store.exitFacts(user.tenantId, offboardingId);
    if (!exit) throw new NotFoundError('Exit not found');
    const sal = await this.store.salaryOn(user.tenantId, exit.employeeId, exit.lastWorkingDay);
    if (!sal) throw new ConflictError('This employee has no salary to settle on. Add their salary first.', undefined, { code: 'FINAL_SETTLEMENT_NO_SALARY' });
    const [structures, comps] = await Promise.all([this.structures.list(user.tenantId), this.components.list(user.tenantId)]);
    const s = structures.find((x) => x.id === sal.structureId);
    const a = sal.addonStructureId ? structures.find((x) => x.id === sal.addonStructureId) : undefined;
    const lines = [...(s?.lines ?? []), ...(a?.lines ?? [])].map((l) => ({ componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText }));
    return settlementSalaryFacts({
      basicAmount: sal.basicAmount, structureLines: lines, components: comps.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null })),
      statutory: sal.statutory, joiningDate: exit.joiningDate, lastWorkingDay: exit.lastWorkingDay,
    });
  }
}
