import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CLAIM_REJECT_REASONS, claimPolicyCheck, type ClaimInput, type ClaimPayInput, type ExpenseClaim, type MyClaimOptions, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { CashBookStore } from '../../book/application/cash-book-store.js';
import { ClaimStore, type ClaimBase } from './claim-store.js';

const OPEN = ['PENDING', 'OVER_POLICY'];
const notEditable = () => new ConflictError('Only a draft or returned claim can be changed.', undefined, { code: 'CLAIM_NOT_EDITABLE' });
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Expense claims: employees draft and submit their own (My Profile); claims route through the approval engine (seeded
 * "Expense claims" workflow: line manager, then finance). Final approval posts the accrual (Dr expenses / Cr employee
 * claims payable, the database's expenseClaimApprove); paying posts Dr claims payable / Cr cash (CPV) or bank (BPV).
 */
@Injectable()
export class ExpenseClaimsService implements OnModuleInit {
  constructor(
    private readonly store: ClaimStore,
    private readonly book: CashBookStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['EXP'],
      workflowSubject: 'EXPENSE_CLAIM',
      link: (id) => `/cash/expenses?claim=${id}`,
      lines: async (tenantId, id) => ((await this.store.get(tenantId, id))?.lines ?? []).map((l) => ({ account: l.category?.name ?? 'Expense', particulars: l.description, debit: l.amount, credit: 0 })),
      onApproved: async (tenantId, id, approverUserId) => {
        const c = (await this.store.get(tenantId, id))!;
        await this.store.approve(id, null);
        await this.store.set(tenantId, id, { workflowStage: 'FINANCE', approvedWithException: c.isOverPolicy });
        await this.store.addAction(tenantId, id, c.isOverPolicy ? 'APPROVED_WITH_EXCEPTION' : 'APPROVED', 'FINANCE', approverUserId, null);
      },
      onReturned: async (tenantId, id, action, reason, actorUserId) => {
        if (action === 'REJECT') {
          const code = (CLAIM_REJECT_REASONS as readonly string[]).includes(reason ?? '') ? reason! : 'OTHER';
          await this.store.set(tenantId, id, { status: 'REJECTED', rejectionReason: code, rejectionComment: code === reason ? null : reason, allowResubmit: true });
          await this.store.addAction(tenantId, id, 'REJECTED', (await this.store.get(tenantId, id))!.workflowStage, actorUserId ?? null, reason);
        } else {
          await this.store.set(tenantId, id, { status: 'DRAFT', workflowStage: 'SENT' });
          await this.store.addAction(tenantId, id, 'COMMENTED', 'SENT', actorUserId ?? null, `Changes requested: ${reason ?? ''}`);
        }
      },
      onComment: async (tenantId, id, userId, comment) => { await this.store.addAction(tenantId, id, 'COMMENTED', (await this.store.get(tenantId, id))!.workflowStage, userId, comment); },
      comments: async (tenantId, id) => ((await this.store.get(tenantId, id))?.actions ?? []).filter((a) => a.action === 'COMMENTED').map((a) => ({ id: a.id, by: a.actor, at: a.actedAt, text: a.comment ?? '' })),
      onStepChange: async (tenantId, id, step, previous, actorUserId) => {
        const stage = step.approverType === 'LINE_MANAGER' ? 'MANAGER' : 'FINANCE';
        await this.store.set(tenantId, id, { workflowStage: stage });
        if (previous?.approverType === 'LINE_MANAGER') {
          await this.store.set(tenantId, id, { managerUserId: actorUserId, managerApprovedAt: new Date() });
          await this.store.addAction(tenantId, id, 'MANAGER_APPROVED', 'MANAGER', actorUserId, null);
        }
      },
    });
  }

  // ---------------------------------------------------------------- finance
  list(user: SessionUser, q: { status?: string; department?: string; search?: string; page: number; pageSize: number }) {
    return this.store.list(user.tenantId, q);
  }

  async get(user: SessionUser, id: string, own = false): Promise<ExpenseClaim> {
    const c = await this.store.get(user.tenantId, id);
    if (!c) throw new NotFoundError('Expense claim not found');
    if (own) {
      const me = await this.store.employeeOf(user.tenantId, user.id);
      if (!me || me.id !== c.employee.id) throw new NotFoundError('Expense claim not found');
    }
    const approval = await this.approvals.forEntity(user, 'EXP', id);
    return { ...c, approvalId: approval?.status === 'PENDING' ? approval.id : null, canAct: !!approval?.canAct };
  }

  /** Approve through the claim's approval request; a claim with no workflow is approved directly by cash approval. */
  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const c = await this.get(user, id);
    if (!OPEN.includes(c.status)) throw new ConflictError('Only a pending claim can be approved.');
    if (c.approvalId) await this.approvals.act(user, meta, c.approvalId, 'approve', { reason: null, comment });
    else {
      if (!user.permissions.includes('cash:approve')) throw new ForbiddenError('You can’t approve claims.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), async () => {
        await this.store.approve(id, comment);
        await this.store.set(user.tenantId, id, { workflowStage: 'FINANCE', approvedWithException: c.isOverPolicy });
        await this.store.addAction(user.tenantId, id, c.isOverPolicy ? 'APPROVED_WITH_EXCEPTION' : 'APPROVED', 'FINANCE', user.id, comment);
      });
    }
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, input: { reason: string; comment: string | null; allowResubmit: boolean }) {
    const c = await this.get(user, id);
    if (!OPEN.includes(c.status)) throw new ConflictError('Only a pending claim can be rejected.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (c.approvalId) await this.approvals.act(user, meta, c.approvalId, 'reject', { reason: input.reason, comment: input.comment });
      else {
        if (!user.permissions.includes('cash:approve')) throw new ForbiddenError('You can’t reject claims.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
        await this.store.set(user.tenantId, id, { status: 'REJECTED', rejectionReason: input.reason });
        await this.store.addAction(user.tenantId, id, 'REJECTED', c.workflowStage, user.id, input.comment);
      }
      await this.store.set(user.tenantId, id, { rejectionReason: input.reason, rejectionComment: input.comment, allowResubmit: input.allowResubmit });
    });
    return this.get(user, id);
  }

  async pay(user: SessionUser, meta: RequestMeta, id: string, p: ClaimPayInput) {
    const c = await this.get(user, id);
    if (c.status !== 'APPROVED') throw new ConflictError('Only an approved, unpaid claim can be paid.');
    const o = await this.book.options(user.tenantId);
    if (p.method === 'CASH') {
      const cash = o.cashAccounts.find((x) => x.id === p.cashAccountId);
      if (!cash) throw v({ cashAccountId: 'Choose an active cash account' });
      const amount = c.approvedAmount ?? c.totalAmount;
      if (amount > cash.balance) throw new ValidationError(`Only ${cash.balance.toLocaleString('en-PK')} is in ${cash.name}.`, { cashAccountId: ['Not enough cash'] }, { code: 'CASH_INSUFFICIENT' });
    } else if (!o.bankAccounts.some((b) => b.id === p.bankAccountId && b.accountId)) throw v({ bankAccountId: 'Choose an active bank account' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set(user.tenantId, id, {
        paymentMethod: p.method, paymentCashAccountId: p.method === 'CASH' ? p.cashAccountId : null, paymentBankAccountId: p.method === 'BANK_TRANSFER' ? p.bankAccountId : null,
        paidAt: new Date(`${p.date}T12:00:00Z`),
      });
      await this.store.pay(id);
      await this.store.addAction(user.tenantId, id, 'PAID', 'PAID', user.id, p.method === 'CASH' ? 'Paid in cash' : 'Paid by bank transfer');
    });
    return this.get(user, id);
  }

  /** Pays several approved claims, each in its own transaction; returns what was paid and what failed. */
  async payMany(user: SessionUser, meta: RequestMeta, claimIds: string[], p: ClaimPayInput) {
    const paid: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of claimIds) {
      try { await this.pay(user, meta, id, p); paid.push(id); } catch (e) { failed.push({ id, message: (e as Error).message }); }
    }
    return { paid, failed };
  }

  // ---------------------------------------------------------------- my claims
  /** Categories with their limits (and this month's use) and cost centres, for the employee's claim form. */
  async myOptions(user: SessionUser): Promise<MyClaimOptions> {
    const me = await this.me(user);
    const o = await this.book.options(user.tenantId);
    const categories = await Promise.all(o.expenseCategories.map(async (c) => ({
      id: c.id, code: c.code, name: c.name, icon: c.icon, limitAmount: c.limitAmount, limitPeriod: c.limitPeriod, receiptRequired: c.receiptRequired,
      requiresPreApproval: c.requiresPreApproval, usedThisMonth: await this.store.usedInMonth(user.tenantId, me.id, c.id, today(), null),
    })));
    return { categories, costCentres: o.costCentres };
  }

  async mine(user: SessionUser, q: { status?: string; page: number; pageSize: number }) {
    const me = await this.me(user);
    return this.store.list(user.tenantId, { ...q, employeeId: me.id });
  }

  async create(user: SessionUser, meta: RequestMeta, input: ClaimInput) {
    const me = await this.me(user);
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, docDate: today(), employeeId: me.id, branchId: me.branchId, source: 'ESS' }));
    return this.get(user, id, true);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ClaimInput & { rowVersion: number }) {
    const c = await this.own(user, id, input.rowVersion);
    if (c.status !== 'DRAFT') throw notEditable();
    const known = new Set(c.lines.map((l) => l.id));
    const data = await this.payload(user, { ...input, lines: input.lines.map((l) => (l.id && known.has(l.id) ? l : { ...l, id: undefined })) });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id, true);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.own(user, id, rowVersion);
    if (c.status !== 'DRAFT' || c.submittedAt) throw new ConflictError('Only a claim that was never submitted can be deleted; withdraw it instead.', undefined, { code: 'CLAIM_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft(user.tenantId, id, rowVersion));
  }

  /** Checks the category's policy limit (over-policy needs a justification) and sends the claim for approval. */
  async submit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.own(user, id, rowVersion);
    if (c.status !== 'DRAFT') throw notEditable();
    const o = await this.book.options(user.tenantId);
    const cat = o.expenseCategories.find((x) => x.id === c.category.id);
    if (!cat) throw v({ categoryId: 'This category is no longer active' });
    if (cat.receiptRequired && c.receiptCount === 0) throw v({ receiptCount: 'This category needs receipts' });
    const used = cat.limitPeriod === 'PER_MONTH' ? await this.store.usedInMonth(user.tenantId, c.employee.id, cat.id, c.docDate, id) : 0;
    const policy = claimPolicyCheck(cat.limitAmount, cat.limitPeriod, c.totalAmount, used);
    if (policy.isOver && !c.policyJustification) throw new ValidationError('This claim is over the policy limit; add a justification.', { policyJustification: [policy.message] }, { code: 'CLAIM_POLICY_JUSTIFICATION' });
    const resubmit = !!c.submittedAt;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set(user.tenantId, id, {
        status: 'PENDING', submittedAt: new Date(), workflowStage: 'SENT', isOverPolicy: policy.isOver, policyLimitAmount: policy.limitAmount, policyLimitPeriod: policy.limitPeriod,
      });
      await this.store.addAction(user.tenantId, id, resubmit ? 'RESUBMITTED' : 'SUBMITTED', 'SENT', user.id, null);
      const req = await this.approvals.submit(user, { entityType: 'EXP', entityId: id, docLabel: c.docNo, title: c.title, amount: c.totalAmount, branchId: c.branch.id, facts: { DOC_TYPE: 'EXP', BRANCH: c.branch.id, ...(c.costCentre && { COST_CENTRE: c.costCentre.id }) } });
      if (!req) await this.store.set(user.tenantId, id, { workflowStage: 'FINANCE' });
    });
    return this.get(user, id, true);
  }

  async withdraw(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.own(user, id, rowVersion);
    if (!OPEN.includes(c.status)) throw new ConflictError('Only a pending claim can be withdrawn.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'EXP', id, 'Withdrawn by the employee');
      await this.store.set(user.tenantId, id, { status: 'WITHDRAWN' });
      await this.store.addAction(user.tenantId, id, 'WITHDRAWN', c.workflowStage, user.id, null);
    });
    return this.get(user, id, true);
  }

  /** A rejected claim (when allowed) comes back as a new draft linked to it. */
  async resubmit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.own(user, id, rowVersion);
    if (c.status !== 'REJECTED' || !c.allowResubmit) throw new ConflictError('This claim can’t be resubmitted.');
    const input: ClaimInput = {
      title: c.title, merchant: c.merchant, categoryId: c.category.id, costCentreId: c.costCentre?.id ?? null, tripFrom: c.tripFrom, tripTo: c.tripTo,
      customerId: c.customer?.id ?? null, travelRequestRef: c.travelRequestRef, receiptCount: c.receiptCount, policyJustification: c.policyJustification,
      lines: c.lines.map((l) => ({ expenseDate: l.expenseDate, description: l.description, categoryId: l.category?.id ?? null, merchant: l.merchant, amount: l.amount, costCentreId: l.costCentre?.id ?? null })),
    };
    const data = await this.payload(user, input);
    const newId = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, docDate: today(), employeeId: c.employee.id, branchId: c.branch.id, source: 'ESS', resubmittedFromClaimId: id }));
    return this.get(user, newId, true);
  }

  // ---------------------------------------------------------------- helpers
  private async payload(user: SessionUser, c: ClaimInput) {
    const o = await this.book.options(user.tenantId);
    const e: Record<string, string> = {};
    const cat = o.expenseCategories.find((x) => x.id === c.categoryId);
    if (!cat) e.categoryId = 'Choose an active category';
    if (c.costCentreId && !o.costCentres.some((x) => x.id === c.costCentreId)) e.costCentreId = 'Choose an active cost centre';
    if (c.customerId && !o.customers.some((x) => x.id === c.customerId)) e.customerId = 'Choose a customer';
    c.lines.forEach((l, i) => {
      if (l.categoryId && !o.expenseCategories.some((x) => x.id === l.categoryId)) e[`lines.${i}.categoryId`] = 'Choose an active category';
      if (l.costCentreId && !o.costCentres.some((x) => x.id === l.costCentreId)) e[`lines.${i}.costCentreId`] = 'Choose an active cost centre';
    });
    if (Object.keys(e).length) throw v(e);
    const lineLimit = cat && ['PER_DAY', 'PER_NIGHT', 'PER_MEAL'].includes(cat.limitPeriod ?? '') ? cat.limitAmount : null;
    return {
      title: c.title, merchant: c.merchant, categoryId: c.categoryId, costCentreId: c.costCentreId, tripFrom: c.tripFrom, tripTo: c.tripTo, customerId: c.customerId,
      travelRequestRef: c.travelRequestRef, receiptCount: c.receiptCount, policyJustification: c.policyJustification,
      totalAmount: Math.round(c.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
      lines: c.lines.map((l, i) => ({ ...(l.id && { id: l.id }), lineNo: i + 1, expenseDate: l.expenseDate, description: l.description, categoryId: l.categoryId, merchant: l.merchant, amount: l.amount, costCentreId: l.costCentreId, isOverPolicy: !!lineLimit && l.amount > lineLimit })),
    };
  }

  private async me(user: SessionUser) {
    const me = await this.store.employeeOf(user.tenantId, user.id);
    if (!me) throw new ForbiddenError('Your user isn’t linked to an employee record, so you can’t file expense claims. Ask HR to link it.');
    return me;
  }

  private async own(user: SessionUser, id: string, rowVersion: number): Promise<ClaimBase> {
    const c = await this.get(user, id, true);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('This claim was changed. Reload and try again.');
    return c;
  }
}
