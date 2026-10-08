import { Injectable, type OnModuleInit } from '@nestjs/common';
import { overtimeAmount, rangeDays, roundOvertime, spanHours, type OvertimeClaim, type OvertimeClaimInput, type OvertimeRate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { OvertimeClaimStore, type ClaimBase } from './overtime-claim-store.js';

const notPending = () => new ConflictError('This overtime claim is no longer pending.', undefined, { code: 'REQUEST_NOT_PENDING' });
const overLimit = (field: string, m: string) => new ValidationError(m, { [field]: [m] }, { code: 'OVERTIME_OVER_LIMIT' });
const v = (field: string, m: string) => new ValidationError(m, { [field]: [m] });

/**
 * Overtime claims (OT-): HR logs overtime on behalf of an employee; it is priced with the active overtime policy
 * (hours × hourly rate × the day type's multiplier, or comp-off at 0) within the policy's limits, and routed through
 * the approval engine (default "Overtime claims": line manager, then HR; no workflow → att:approve). Approved claims
 * are pushed to payroll in Phase 32; approved comp-off claims are credited as leave in Phase 31.
 */
@Injectable()
export class OvertimeClaimsService implements OnModuleInit {
  constructor(
    private readonly store: OvertimeClaimStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['OT'],
      workflowSubject: 'OVERTIME_CLAIM',
      link: (id) => `/hr/overtime?claim=${id}`,
      lines: async (tenantId, id) => {
        const c = await this.store.get(tenantId, id);
        return c ? [{ account: `${c.employee.name} · ${c.dateFrom}${c.dateTo !== c.dateFrom ? ` – ${c.dateTo}` : ''}`, particulars: `${c.hours} h × ${c.hourlyRate} × ${c.multiplier}${c.isCompOff ? ' (comp-off)' : ''}`, debit: c.amount, credit: 0 }] : [];
      },
      onApproved: async (_tenantId, id) => { await this.store.approve(id); },
      onReturned: async (_tenantId, id, _action, reason) => { await this.store.reject(id, reason ?? 'Rejected'); },
    });
  }

  async list(user: SessionUser, q: { month?: string; status?: string; search?: string; page: number; pageSize: number }) {
    const month = q.month ?? new Date().toISOString().slice(0, 7);
    const l = await this.store.list(user.tenantId, { ...q, month });
    return { ...l, items: await Promise.all(l.items.map((c) => this.withApproval(user, c))) };
  }

  async get(user: SessionUser, id: string): Promise<OvertimeClaim> {
    const c = await this.store.get(user.tenantId, id);
    if (!c) throw new NotFoundError('Overtime claim not found');
    return this.withApproval(user, c);
  }

  private async withApproval(user: SessionUser, c: ClaimBase): Promise<OvertimeClaim> {
    const approval = await this.approvals.forEntity(user, 'OT', c.id);
    const s = approval?.status === 'PENDING' ? approval.steps.find((x) => x.state === 'current') : null;
    return { ...c, approval, canAct: !!approval?.canAct, waitingOn: s ? `${s.name}${s.approvers.length ? ` — ${s.approvers.map((a) => a.name).join(', ')}` : ''}` : c.status === 'PENDING' ? 'HR' : null };
  }

  /** The policy and hourly rate the log-overtime form prices with. */
  async rate(user: SessionUser, employeeId: string, date: string): Promise<OvertimeRate> {
    const p = await this.store.activePolicy(user.tenantId);
    return {
      hourlyRate: p ? await this.store.hourlyRate(user.tenantId, employeeId, date, p.hourlyRateBasis) : null, basis: p?.hourlyRateBasis ?? null,
      policy: p ? { id: p.id, weekdayMultiplier: p.weekdayMultiplier, weeklyOffMultiplier: p.weeklyOffMultiplier, holidayMultiplier: p.holidayMultiplier, minMinutes: p.minMinutes, dailyCapHours: p.dailyCapHours, monthlyCapHours: p.monthlyCapHours, rounding: p.rounding, allowCompOff: p.allowCompOff } : null,
      usedThisMonth: await this.store.hoursInMonth(user.tenantId, employeeId, date.slice(0, 7), null),
    };
  }

  async create(user: SessionUser, meta: RequestMeta, input: OvertimeClaimInput) {
    const data = await this.price(user, input, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save({ ...data, source: 'HR' });
      const c = (await this.store.get(user.tenantId, newId))!;
      await this.approvals.submit(user, { entityType: 'OT', entityId: newId, docLabel: c.docNo, title: `Overtime · ${c.employee.name}`, amount: c.amount, branchId: data.branchId, facts: { DOC_TYPE: 'OT', ...(data.branchId && { BRANCH: data.branchId }) } });
      return newId;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: OvertimeClaimInput & { rowVersion: number }) {
    const c = await this.get(user, id);
    if (c.status !== 'PENDING') throw notPending();
    if (c.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this claim. Reload and try again.');
    const data = await this.price(user, input, id);
    const { branchId, ...rest } = data;
    void branchId;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...rest, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const c = await this.get(user, id);
    if (c.status !== 'PENDING') throw notPending();
    if (c.approval?.status === 'PENDING') await this.approvals.act(user, meta, c.approval.id, 'approve', { reason: null, comment });
    else {
      if (!user.permissions.includes('att:approve')) throw new ForbiddenError('You can’t approve overtime.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.approve(id));
    }
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const c = await this.get(user, id);
    if (c.status !== 'PENDING') throw notPending();
    if (c.approval?.status === 'PENDING') await this.approvals.act(user, meta, c.approval.id, 'reject', { reason, comment: null });
    else {
      if (!user.permissions.includes('att:approve')) throw new ForbiddenError('You can’t reject overtime.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.reject(id, reason));
    }
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    const c = await this.get(user, id);
    if (c.status !== 'PENDING' && c.status !== 'APPROVED') throw notPending();
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this claim. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (c.approval?.status === 'PENDING') await this.approvals.cancelFor(user, 'OT', id, reason ?? 'Cancelled');
      await this.store.cancel(id, reason);
    });
    return this.get(user, id);
  }

  /** Prices a claim with the active policy and checks its limits. */
  private async price(user: SessionUser, input: OvertimeClaimInput, exceptId: string | null) {
    const p = await this.store.activePolicy(user.tenantId);
    if (!p) throw new ConflictError('No overtime policy is active. Activate one under OT policy first.');
    const dateTo = input.dateTo ?? input.dateFrom;
    const emp = await this.store.employee(user.tenantId, input.employeeId, dateTo);
    if (!emp) throw v('employeeId', 'Choose an employee employed on those dates');
    if (p.eligibleUpToGradeRank !== null && emp.gradeRank !== null && emp.gradeRank > p.eligibleUpToGradeRank) throw overLimit('employeeId', 'This employee’s grade isn’t eligible for overtime under the active policy.');
    if (input.isCompOff && !p.allowCompOff) throw v('isCompOff', 'The active policy doesn’t allow comp-off instead of payment');
    const days = rangeDays(input.dateFrom, dateTo);
    const hours = input.hours ?? roundOvertime(spanHours(input.timeFrom!, input.timeTo!) * days, p.rounding);
    if (hours * 60 < p.minMinutes) throw overLimit('hours', `Overtime under ${p.minMinutes} minutes doesn’t count under the policy.`);
    if (p.dailyCapHours !== null && hours / days > p.dailyCapHours) throw overLimit('hours', `Over the daily cap of ${p.dailyCapHours} hours.`);
    const month = dateTo.slice(0, 7);
    if (p.monthlyCapHours !== null) {
      const used = await this.store.hoursInMonth(user.tenantId, input.employeeId, month, exceptId);
      if (used + hours > p.monthlyCapHours) throw overLimit('hours', `Over the monthly cap of ${p.monthlyCapHours} hours (${used} already claimed in ${month}).`);
    }
    const rate = (await this.store.hourlyRate(user.tenantId, input.employeeId, dateTo, p.hourlyRateBasis)) ?? input.hourlyRate;
    if (rate === null) throw v('hourlyRate', 'No salary is on record for this employee: enter the hourly rate');
    const multiplier = input.dayType === 'WEEKDAY' ? p.weekdayMultiplier : input.dayType === 'WEEKLY_OFF' ? p.weeklyOffMultiplier : p.holidayMultiplier;
    const hourlyRate = Math.round(rate * 10_000) / 10_000;
    return {
      employeeId: input.employeeId, dateFrom: input.dateFrom, dateTo, dayType: input.dayType, timeFrom: input.timeFrom, timeTo: input.timeTo, hours, multiplier, hourlyRate,
      isCompOff: input.isCompOff, amount: overtimeAmount(hours, hourlyRate, multiplier, input.isCompOff), reason: input.reason, overtimePolicyId: p.id,
      preApproved: input.preApproved, payrollMonth: `${month}-01`, branchId: emp.branchId,
    };
  }
}
