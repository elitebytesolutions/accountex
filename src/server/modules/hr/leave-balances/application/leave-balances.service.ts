import { Injectable } from '@nestjs/common';
import type { LeaveAdjustmentInput, LeaveBalanceQuery, LeaveBalanceView, SessionUser, YearEndView } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { addMonths } from '../../leave-requests/domain/leave-rules.js';
import { LeaveBalanceStore } from './leave-balance-store.js';

/**
 * Leave balances (kept by the database from requests and the adjustments ledger), manual / opening / comp-off
 * adjustments (append-only; comp-off from a Phase 30 approved comp-off overtime claim), the monthly accrual run and the
 * year-end close (carry forward / encash / lapse) with its reversal.
 */
@Injectable()
export class LeaveBalancesService {
  constructor(
    private readonly store: LeaveBalanceStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async view(user: SessionUser, q: LeaveBalanceQuery): Promise<LeaveBalanceView> {
    const today = await this.store.today(user.tenantId);
    const yearStart = q.year ?? (await this.store.yearStart(user.tenantId, today));
    const [v, years] = await Promise.all([this.store.view(user.tenantId, { ...q, yearStart, today }), this.store.years(user.tenantId)]);
    return { ...v, years: [...new Set([...years, yearStart, await this.store.yearStart(user.tenantId, today)])].sort().reverse() };
  }

  adjustments(user: SessionUser, q: { employeeId?: string; leaveTypeId?: string; year?: string }) {
    return this.store.adjustments(user.tenantId, { employeeId: q.employeeId, leaveTypeId: q.leaveTypeId, yearStart: q.year });
  }

  compOffClaims(user: SessionUser, employeeId: string) {
    return this.store.compOffClaims(user.tenantId, employeeId);
  }

  async addAdjustment(user: SessionUser, meta: RequestMeta, input: LeaveAdjustmentInput) {
    if (!(await this.store.employeeActive(user.tenantId, input.employeeId))) throw new ValidationError('Choose an active employee', { employeeId: ['Not an active employee'] });
    const { overtimeClaimId, ...rest } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.addAdjustment({ ...rest, overtimeEntryId: input.kind === 'COMP_OFF' ? overtimeClaimId : null }));
    return (await this.store.adjustments(user.tenantId, { employeeId: input.employeeId, leaveTypeId: input.leaveTypeId })).find((a) => a.id === id)!;
  }

  /** Accrual for a month (idempotent per employee, type and month): 409 when everyone was already credited. */
  async accrue(user: SessionUser, meta: RequestMeta, month: string, employeeId?: string) {
    const r = await this.unitOfWork.run(actorContext(user, meta), () => this.store.accrue(`${month}-01`, employeeId));
    if (!r.credited && r.skipped) throw new ConflictError(`Leave for ${month} is already accrued for every eligible employee.`, undefined, { code: 'LEAVE_ALREADY_ACCRUED' });
    return r;
  }

  // ---------------------------------------------------------------- year-end
  async yearEnd(user: SessionUser, year?: string): Promise<YearEndView> {
    const today = await this.store.today(user.tenantId);
    const closingYearStart = year ?? addMonths(await this.store.yearStart(user.tenantId, today), -12);
    const [plan, closings] = await Promise.all([this.store.plan(user.tenantId, closingYearStart), this.store.closings(user.tenantId)]);
    const sum = (k: 'unused' | 'carry' | 'encash' | 'lapse' | 'amount') => Math.round(plan.rows.reduce((n, r) => n + r[k], 0) * 100) / 100;
    return {
      closingYearStart, openingYearStart: addMonths(closingYearStart, 12), employees: plan.employees, rows: plan.rows,
      totals: { unused: sum('unused'), carry: sum('carry'), encash: sum('encash'), lapse: sum('lapse'), amount: sum('amount') },
      closings, closed: closings.find((c) => c.closingYearStart === closingYearStart && c.status === 'COMPLETED') ?? null,
    };
  }

  /** Close a leave year: carry forward / encash / lapse every unused balance, all in one transaction. */
  async close(user: SessionUser, meta: RequestMeta, year: string, input: { encashmentTarget: string; emailStatements: boolean }) {
    if (!/^\d{4}-\d{2}-01$/.test(year) || year !== (await this.store.yearStart(user.tenantId, year))) throw new ValidationError('Choose a leave year start', { year: ['Not the start of a leave year'] });
    const today = await this.store.today(user.tenantId);
    if (addMonths(year, 12) > today) throw new ValidationError('A leave year can be closed once it has ended', { year: ['Still running'] }, { code: 'LEAVE_POLICY_VIOLATION' });
    if ((await this.store.closings(user.tenantId)).some((c) => c.closingYearStart === year && c.status === 'COMPLETED')) throw new ConflictError('That leave year is already closed. Reverse the close first.', undefined, { code: 'LEAVE_YEAR_CLOSED' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = await this.store.createClosing({ closingYearStart: year, openingYearStart: addMonths(year, 12), ...input });
      await this.store.completeClosing(id);
    });
    return this.yearEnd(user, year);
  }

  async reverse(user: SessionUser, meta: RequestMeta, id: string, reason: string, rowVersion: number) {
    const c = (await this.store.closings(user.tenantId)).find((x) => x.id === id);
    if (!c) throw new NotFoundError('Year-end close not found');
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('This close was changed. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.reverseClosing(id, reason));
    return this.yearEnd(user, c.closingYearStart);
  }
}
