import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  LEAVE_REJECT_REASONS, type LeaveApply, type LeaveOnBehalf, type LeaveOverview, type LeavePreview, type LeavePreviewInput, type LeaveReject,
  type LeaveRequestDetail, type LeaveRequestQuery, type MyLeave, type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { addMonths, approvalChain, countLeaveDays, insufficientBalance, leaveRuleErrors, leaveWarnings, stageOfStep } from '../domain/leave-rules.js';
import { LeaveRequestStore, type LeaveEmployee, type LeaveRequestBase, type LeaveTypeFull } from './leave-request-store.js';

const notPending = () => new ConflictError('This leave request is no longer pending.', undefined, { code: 'LEAVE_NOT_PENDING' });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (d: string) => `${d.slice(8, 10)} ${MON[Number(d.slice(5, 7)) - 1]}`;
const range = (r: { fromDate: string; toDate: string }) => (r.fromDate === r.toDate ? dm(r.fromDate) : `${dm(r.fromDate)} – ${dm(r.toDate)}`);
const CHAIN_ROUTE: Record<string, string[]> = { MANAGER: ['Line manager'], MANAGER_HR: ['Line manager', 'HR'], MANAGER_HR_CEO: ['Line manager', 'HR', 'CEO'], HR: ['HR'] };

type Evaluated = { type: LeaveTypeFull; days: number; chain: string; yearStart: string; available: number; preview: LeavePreview };

/**
 * Leave requests (LV-). Self-service requests route through the approval engine on the leave type's own chain: the
 * LEAVE_APPROVAL fact (MANAGER / MANAGER_HR / MANAGER_HR_CEO / HR, raised above hrApprovalAboveDays) picks the default
 * workflow seeded for that chain. With no workflow (or no approver on any step) HR — or the line manager — decides
 * directly. HR applying on someone's behalf skips the chain: the request is recorded approved.
 * The balance check refuses requests beyond what is available unless the type allows a negative balance.
 */
@Injectable()
export class LeaveRequestsService implements OnModuleInit {
  constructor(
    private readonly store: LeaveRequestStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['LV'],
      workflowSubject: 'LEAVE_REQUEST',
      link: (id) => `/hr/leave/requests?request=${id}`,
      lines: async (tenantId, id) => {
        const r = await this.store.get(tenantId, id);
        return r ? [{ account: `${r.leaveType.name} · ${range(r)}`, particulars: `${r.days} day${r.days === 1 ? '' : 's'} · ${r.employee.name}${r.reason ? ` — ${r.reason}` : ''}`, debit: 0, credit: 0 }] : [];
      },
      onApproved: async (_tenantId, id) => { await this.store.approve(id, null); },
      onReturned: async (_tenantId, id, action, reason) => {
        const code = (LEAVE_REJECT_REASONS as readonly string[]).includes(reason ?? '') ? reason! : 'OTHER';
        await this.store.reject(id, code, code === reason ? null : action === 'REQUEST_CHANGES' ? `Changes requested: ${reason ?? ''}` : reason, false);
      },
      onStepChange: async (_tenantId, id, step) => { await this.store.save({ id, stage: stageOfStep(step) }); },
    });
  }

  // ---------------------------------------------------------------- HR
  async list(user: SessionUser, q: LeaveRequestQuery) {
    const today = await this.store.today(user.tenantId);
    const yearStart = await this.store.yearStart(user.tenantId, today);
    const l = await this.store.list(user.tenantId, { ...q, yearStart });
    return { ...l, yearStart, items: await Promise.all(l.items.map(async (i) => ({ ...i, waitingOn: i.status === 'PENDING' ? await this.waitingOn(user, i.id) : null }))) };
  }

  async overview(user: SessionUser, q: { month?: string; departmentId?: string }): Promise<LeaveOverview> {
    const today = await this.store.today(user.tenantId);
    const yearStart = await this.store.yearStart(user.tenantId, today);
    const o = await this.store.overview(user.tenantId, { month: q.month ?? today.slice(0, 7), departmentId: q.departmentId, today, yearStart, yearEnd: addMonths(yearStart, 12) });
    const pending = await Promise.all(o.pending.map(async (p) => {
      const b = await this.store.balance(user.tenantId, p.employee.id, p.leaveType.id, await this.store.yearStart(user.tenantId, p.fromDate));
      return { ...p, waitingOn: await this.waitingOn(user, p.id), balanceOf: b ? { available: b.available, entitled: b.entitled + b.carriedIn + b.adjusted } : null };
    }));
    return { ...o, pending, routeNote: 'approvals via each leave type’s chain' };
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async get(user: SessionUser, id: string, own = false): Promise<LeaveRequestDetail> {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Leave request not found');
    if (own) {
      const me = await this.store.employeeOfUser(user.tenantId, user.id);
      if (!me || me.id !== r.employee.id) throw new NotFoundError('Leave request not found');
    }
    const [approval, emp, balance] = await Promise.all([
      this.approvals.forEntity(user, 'LV', id),
      this.store.employee(user.tenantId, r.employee.id),
      this.store.yearStart(user.tenantId, r.fromDate).then((y) => this.store.balance(user.tenantId, r.employee.id, r.leaveType.id, y)),
    ]);
    const current = approval?.status === 'PENDING' ? approval.steps.find((s) => s.state === 'current') : null;
    return {
      ...r, approval, balance,
      canAct: r.status === 'PENDING' && (approval?.status === 'PENDING' ? !!approval.canAct : await this.mayDecideDirectly(user, r)),
      waitingOn: current ? `${current.name}${current.approvers.length ? ` — ${current.approvers.map((a) => a.name).join(', ')}` : ''}` : r.status === 'PENDING' ? 'HR' : null,
      overlap: emp ? await this.store.clashes(user.tenantId, emp, r.fromDate, r.toDate) : [],
    };
  }

  /** HR records leave for an employee: the approval chain is skipped and the request is approved at once. */
  async applyOnBehalf(user: SessionUser, meta: RequestMeta, input: LeaveOnBehalf) {
    const emp = await this.store.employee(user.tenantId, input.employeeId);
    if (!emp || emp.status === 'EXITED') throw new ValidationError('Choose an active employee', { employeeId: ['Not an active employee'] });
    const ev = await this.evaluate(user.tenantId, emp, input, true);
    this.refuse(ev);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save(this.row(emp, input, ev, { channel: 'HR', appliedOnBehalf: true, stage: 'HR_REVIEW' }));
      await this.store.approve(newId, 'Applied by HR on behalf of the employee');
      return newId;
    });
    return this.get(user, id);
  }

  /** Approve through the request's current approval step; with no engine request, HR or the line manager approves. */
  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const r = await this.get(user, id);
    if (r.status !== 'PENDING') throw notPending();
    await this.recheckBalance(user.tenantId, r);
    if (r.approval?.status === 'PENDING') {
      await this.approvals.act(user, meta, r.approval.id, 'approve', { reason: null, comment });
      if (comment) await this.unitOfWork.run(actorContext(user, meta), () => this.note(user.tenantId, id, { decisionComment: comment }));
    } else {
      if (!(await this.mayDecideDirectly(user, r))) throw new ForbiddenError('You can’t approve this leave request.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.approve(id, comment));
    }
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, input: LeaveReject) {
    const r = await this.get(user, id);
    if (r.status !== 'PENDING') throw notPending();
    if (r.approval?.status === 'PENDING') {
      await this.approvals.act(user, meta, r.approval.id, 'reject', { reason: input.reason, comment: input.comment });
      await this.unitOfWork.run(actorContext(user, meta), () => this.note(user.tenantId, id, { decisionComment: input.comment, suggestAlternative: input.suggestAlternative }));
    } else {
      if (!(await this.mayDecideDirectly(user, r))) throw new ForbiddenError('You can’t reject this leave request.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.reject(id, input.reason, input.comment, input.suggestAlternative));
    }
    return this.get(user, id);
  }

  async approveMany(user: SessionUser, meta: RequestMeta, ids: string[]) {
    const done: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try { await this.approve(user, meta, id, null); done.push(id); } catch (e) {
        // domain errors carry a user-facing message; database / driver errors are not shown as-is
        failed.push({ id, message: e instanceof DomainError ? e.message : 'This leave request could not be approved.' });
      }
    }
    return { done, failed };
  }

  /** HR cancels a pending or approved request (the balance is restored). */
  async cancel(user: SessionUser, meta: RequestMeta, id: string, reason: string | null, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.status !== 'PENDING' && r.status !== 'APPROVED') throw notPending();
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this request. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'LV', id, reason ?? 'Cancelled by HR');
      await this.store.cancel(id, reason ?? 'Cancelled by HR');
    });
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- my leave
  async myLeave(user: SessionUser): Promise<MyLeave> {
    const me = await this.me(user);
    const today = await this.store.today(user.tenantId);
    const yearStart = await this.store.yearStart(user.tenantId, today);
    const [data, mgr] = await Promise.all([this.store.myLeave(user.tenantId, me.id, today, yearStart), this.store.manager(user.tenantId, me.id)]);
    const requests = await Promise.all(data.requests.map(async (i) => ({ ...i, waitingOn: i.status === 'PENDING' ? await this.waitingOn(user, i.id) : null })));
    return { ...data, requests, route: mgr ? `${mgr.name}, then HR when the leave type needs it` : 'HR' };
  }

  async preview(user: SessionUser, input: LeavePreviewInput, own: boolean): Promise<LeavePreview> {
    const emp = own ? await this.me(user) : input.employeeId ? await this.store.employee(user.tenantId, input.employeeId) : null;
    if (!emp) throw new ValidationError('Choose an employee', { employeeId: ['Required'] });
    return (await this.evaluate(user.tenantId, emp, input, !own && input.onBehalf)).preview;
  }

  async apply(user: SessionUser, meta: RequestMeta, input: LeaveApply) {
    const me = await this.me(user);
    if (input.handoverEmployeeId === me.id) throw new ValidationError('Choose a colleague for the handover', { handoverEmployeeId: ['Not yourself'] });
    const ev = await this.evaluate(user.tenantId, me, input, false);
    this.refuse(ev);
    const mgr = await this.store.manager(user.tenantId, me.id);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const startsWithManager = ev.chain.startsWith('MANAGER') && !!mgr?.userId;
      const newId = await this.store.save(this.row(me, input, ev, {
        channel: 'ESS_WEB', appliedOnBehalf: false, stage: startsWithManager ? 'LINE_MANAGER' : 'HR_REVIEW', currentApproverEmployeeId: startsWithManager ? mgr!.employeeId : null,
      }));
      const r = (await this.store.get(user.tenantId, newId))!;
      const facts = { DOC_TYPE: 'LV', LEAVE_APPROVAL: ev.chain, LEAVE_DAYS: ev.days, ...(me.branchId && { BRANCH: me.branchId }), ...(me.departmentId && { DEPARTMENT: me.departmentId }) };
      const route = await this.approvals.preview(user.tenantId, 'LEAVE_REQUEST', 0, facts, user.id);
      if (route?.steps.some((s) => s.approvers.length)) {
        const reqId = await this.approvals.submit(user, { entityType: 'LV', entityId: newId, docLabel: r.docNo, title: `${ev.type.name} · ${range(r)} · ${me.name}`, amount: 0, branchId: me.branchId, facts });
        if (reqId) await this.store.save({ id: newId, approvalRequestId: reqId });
      }
      return newId;
    });
    return this.get(user, id, true);
  }

  /** Withdraw a pending request, or cancel approved leave that hasn't started. */
  async cancelMine(user: SessionUser, meta: RequestMeta, id: string, reason: string | null, rowVersion: number) {
    const r = await this.get(user, id, true);
    const today = await this.store.today(user.tenantId);
    if (!(r.status === 'PENDING' || (r.status === 'APPROVED' && r.fromDate > today))) {
      throw new ConflictError(r.status === 'APPROVED' ? 'Leave that has started can only be cancelled by HR.' : 'This leave request is no longer pending.', undefined, { code: 'LEAVE_NOT_PENDING' });
    }
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('This request was changed. Reload and try again.');
    const why = reason ?? (r.status === 'PENDING' ? 'Withdrawn by the employee' : 'Cancelled by the employee');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'LV', id, why);
      await this.store.cancel(id, why);
    });
    return this.get(user, id, true);
  }

  // ---------------------------------------------------------------- rules
  /**
   * Approving moves the request's days from booked to used, so the balance (which excludes pending days) must still
   * cover them: HR may have debited the balance since the request was filed. Refused here with the catalogue code
   * rather than by the deferred balance guard at commit (leaveRequestApprove re-checks the same in the database).
   */
  private async recheckBalance(tenantId: string, r: LeaveRequestDetail) {
    const type = await this.store.leaveType(tenantId, r.leaveType.id);
    if (!type || !insufficientBalance(type, r.balance?.balance ?? 0, r.days)) return;
    const left = r.balance?.balance ?? 0;
    throw new ValidationError(`Only ${left} day${left === 1 ? '' : 's'} of ${type.name} left — not enough to approve ${r.days} day${r.days === 1 ? '' : 's'}`, undefined, { code: 'LEAVE_INSUFFICIENT_BALANCE' });
  }

  private async evaluate(tenantId: string, emp: LeaveEmployee, input: { leaveTypeId: string; duration: string; fromDate: string; toDate: string }, onBehalf: boolean): Promise<Evaluated> {
    const type = await this.store.leaveType(tenantId, input.leaveTypeId);
    if (!type || type.status !== 'ACTIVE') throw new ValidationError('Choose an active leave type', { leaveTypeId: ['Not an active leave type'] });
    const [today, yearStart, holidays] = await Promise.all([
      this.store.today(tenantId), this.store.yearStart(tenantId, input.fromDate), this.store.holidays(tenantId, emp.branchId, input.fromDate, input.toDate),
    ]);
    const count = countLeaveDays({ fromDate: input.fromDate, toDate: input.toDate, duration: input.duration, weeklyOff: emp.weeklyOff, holidays, sandwich: type.sandwichRule });
    const [daysThisMonth, timesInService, balance, overlaps, clashes, mgr] = await Promise.all([
      this.store.daysInMonth(tenantId, emp.id, type.id, input.fromDate), this.store.timesInService(tenantId, emp.id, type.id),
      this.store.balance(tenantId, emp.id, type.id, yearStart), this.store.overlaps(tenantId, emp.id, input.fromDate, input.toDate),
      this.store.clashes(tenantId, emp, input.fromDate, input.toDate), this.store.manager(tenantId, emp.id),
    ]);
    const errors = leaveRuleErrors(type, { ...input, days: count.days, today, onBehalf, employee: emp, daysThisMonth, timesInService });
    const available = balance?.available ?? 0;
    if (overlaps) errors.fromDate = 'These dates overlap your other pending or approved leave';
    if (!errors.toDate && insufficientBalance(type, available, count.days)) errors.days = `Only ${available} day${available === 1 ? '' : 's'} of ${type.name} available`;
    const chain = approvalChain(type, count.days);
    const route = onBehalf ? ['HR (recorded on behalf, no approval chain)'] : (CHAIN_ROUTE[chain] ?? ['HR']).map((s) => (s === 'Line manager' && mgr ? mgr.name : s));
    const empty = { entitled: 0, carriedIn: 0, adjusted: 0, used: 0, booked: 0, encashed: 0, lapsed: 0, balance: 0, available: 0 };
    return {
      type, days: count.days, chain, yearStart, available,
      preview: {
        days: count.days, calendarDays: count.calendarDays, weeklyOffDays: count.weeklyOffDays, holidays: count.holidays,
        balance: type.isPaid ? { ...(balance ?? empty), after: available - count.days } : null,
        errors, warnings: leaveWarnings(type, count.days), route, clashes,
      },
    };
  }

  private refuse(ev: Evaluated) {
    const { errors } = ev.preview;
    const entries = Object.entries(errors);
    if (!entries.length) return;
    const details = Object.fromEntries(entries.map(([k, m]) => [k, [m]]));
    if (errors.fromDate?.includes('overlap')) throw new ConflictError(errors.fromDate, details, { code: 'LEAVE_OVERLAP' });
    if (errors.days && entries.length === 1) throw new ValidationError(errors.days, details, { code: 'LEAVE_INSUFFICIENT_BALANCE' });
    throw new ValidationError(entries[0]![1], details, { code: 'LEAVE_POLICY_VIOLATION' });
  }

  private row(emp: LeaveEmployee, input: { leaveTypeId: string; duration: string; fromDate: string; toDate: string; reason: string | null; handoverEmployeeId: string | null; contactDuringLeave: string | null }, ev: Evaluated, extra: Record<string, unknown>) {
    return {
      employeeId: emp.id, leaveTypeId: input.leaveTypeId, duration: input.duration, fromDate: input.fromDate, toDate: input.toDate, days: ev.days,
      reason: input.reason, handoverEmployeeId: input.handoverEmployeeId, contactDuringLeave: input.contactDuringLeave,
      ...(ev.type.isPaid && { balanceBefore: ev.available, balanceAfter: ev.available - ev.days }),
      ...extra,
    };
  }

  /** Without an engine request: HR (lv:approve) or the employee's line manager decides; never the employee. */
  private async mayDecideDirectly(user: SessionUser, r: LeaveRequestBase) {
    const me = await this.store.employeeOfUser(user.tenantId, user.id);
    if (me?.id === r.employee.id) return false;
    if (user.permissions.includes('lv:approve')) return true;
    const mgr = await this.store.manager(user.tenantId, r.employee.id);
    return !!mgr?.userId && mgr.userId === user.id;
  }

  private note(tenantId: string, id: string, data: { decisionComment?: string | null; suggestAlternative?: boolean }) {
    return this.store.note(tenantId, id, data);
  }

  private async waitingOn(user: SessionUser, id: string) {
    const a = await this.approvals.forEntity(user, 'LV', id);
    const s = a?.status === 'PENDING' ? a.steps.find((x) => x.state === 'current') : null;
    return s ? `${s.name}${s.approvers.length ? ` — ${s.approvers.map((x) => x.name).join(', ')}` : ''}` : 'HR';
  }

  private async me(user: SessionUser) {
    const me = await this.store.employeeOfUser(user.tenantId, user.id);
    if (!me) throw new ForbiddenError('Your user isn’t linked to an employee record, so you can’t apply for leave. Ask HR to link it.');
    return me;
  }
}
