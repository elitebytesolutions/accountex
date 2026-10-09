import { Injectable } from '@nestjs/common';
import type { SalesmanTargetInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { DistributionOpsStore } from '../../common/application/distribution-ops-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const changed = () => new ConcurrencyError('This record was changed. Reload and try again.');

/**
 * Salesman / booker targets per period, achievement from their posted invoices (net of credit notes), and
 * commissions: rate from the commission slab matching the achievement %, approved (target:approve), posted as an
 * accrual (Dr sales commission expense / Cr commission payable) and sent to the month's draft payroll run as a
 * COMMISSION adjustment.
 */
@Injectable()
export class TargetsService {
  constructor(
    private readonly store: DistributionOpsStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  overview(user: SessionUser) {
    return this.store.targets(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, p: SalesmanTargetInput) {
    await this.check(user, p);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('salesmanTargetAddUpdate', {
      employeeId: p.employeeId, role: p.role, routeId: p.routeId ?? null, periodStart: p.periodStart, periodEnd: p.periodEnd, targetAmount: Number(p.targetAmount), achievedAmount: 0, status: 'OPEN',
    }));
    await this.refreshOne(user, meta, id);
    return (await this.store.getTarget(user.tenantId, id))!;
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, p: SalesmanTargetInput & { rowVersion: number }) {
    const t = await this.store.getTarget(user.tenantId, id);
    if (!t) throw new NotFoundError('Target not found');
    if (t.rowVersion !== p.rowVersion) throw changed();
    if (t.commission && t.commission.status !== 'DRAFT') throw new ConflictError('Its commission is already approved; the target can no longer change.', undefined, { code: 'COMMISSION_NOT_APPROVED' });
    await this.check(user, p);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('salesmanTargetAddUpdate', {
      id, rowVersion: p.rowVersion, employeeId: p.employeeId, role: p.role, routeId: p.routeId ?? null, periodStart: p.periodStart, periodEnd: p.periodEnd, targetAmount: Number(p.targetAmount),
    }));
    await this.refreshOne(user, meta, id);
    return (await this.store.getTarget(user.tenantId, id))!;
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('target', user.tenantId, id, rowVersion)))) {
      throw new ConflictError('This target has a commission; cancel it first.', undefined, { code: 'COMMISSION_NOT_APPROVED' });
    }
  }

  /** Recomputes achievement for the open targets of a period and (re)builds DRAFT commissions from the slabs. */
  async calculate(user: SessionUser, meta: RequestMeta, p: { periodStart: string; periodEnd: string }) {
    const o = await this.store.options(user.tenantId);
    const { targets } = await this.store.targets(user.tenantId);
    const inPeriod = targets.filter((t) => t.status === 'OPEN' && t.periodStart >= p.periodStart && t.periodEnd <= p.periodEnd);
    if (!inPeriod.length) throw v({ periodStart: 'No open target falls in this period' });
    if (!o.commissionSlabs.length) throw v({ periodStart: 'Set up commission slabs on Routes & Salesmen first' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const t of inPeriod) {
        const achieved = await this.store.achievement(user.tenantId, t.employee.id, t.role, t.periodStart, t.periodEnd, t.route?.id ?? null);
        await this.store.set('target', user.tenantId, t.id, { achievedAmount: achieved });
        const pct = t.targetAmount > 0 ? r2((achieved / t.targetAmount) * 100) : 0;
        const slabs = [...o.commissionSlabs].sort((a, b) => a.fromPct - b.fromPct);
        const slab = slabs.filter((s) => pct >= s.fromPct && pct < s.toPct).pop() ?? (pct >= (slabs.at(-1)?.toPct ?? Infinity) ? slabs.at(-1)! : null);
        if (!slab) continue;
        if (t.commission && t.commission.status !== 'DRAFT') continue;
        await this.store.save('salesmanCommissionAddUpdate', {
          ...(t.commission && { id: t.commission.id }), employeeId: t.employee.id, salesTargetId: t.id, periodStart: t.periodStart, periodEnd: t.periodEnd,
          targetAmount: t.targetAmount, achievedAmount: achieved, achievementPct: pct, commissionSlabId: slab.id, ratePct: slab.ratePct,
          commissionAmount: r2((achieved * slab.ratePct) / 100), status: 'DRAFT',
        });
      }
    });
    return this.store.targets(user.tenantId);
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.commission(user, id, rowVersion);
    if (c.status !== 'DRAFT') throw new ConflictError('Only a draft commission can be approved.', undefined, { code: 'COMMISSION_NOT_APPROVED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.set('commission', user.tenantId, id, { status: 'APPROVED', approvedByUserId: user.id, approvedAt: new Date() }));
    return (await this.store.getCommission(user.tenantId, id))!;
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.commission(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('salesmanCommissionAccrue', id));
    return (await this.store.getCommission(user.tenantId, id))!;
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.commission(user, id, rowVersion);
    if (c.status !== 'DRAFT' && c.status !== 'APPROVED') throw new ConflictError('A posted commission can’t be cancelled here.', undefined, { code: 'COMMISSION_NOT_APPROVED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.set('commission', user.tenantId, id, { status: 'CANCELLED' }));
    return (await this.store.getCommission(user.tenantId, id))!;
  }

  /** Adds the commission to the employee's draft payroll run for the commission month (COMMISSION component). */
  async sendToPayroll(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.commission(user, id, rowVersion);
    if (c.status !== 'ACCRUED') throw new ConflictError('Post the commission before sending it to payroll.', undefined, { code: 'COMMISSION_NOT_APPROVED' });
    if (c.payrollRun) throw new ConflictError(`Already sent to payroll run ${c.payrollRun.docNo}.`, undefined, { code: 'COMMISSION_NOT_APPROVED' });
    const run = await this.store.draftPayrollRun(user.tenantId, c.periodEnd);
    if (!run) throw new ConflictError('There is no draft payroll run for this month yet. Create it, then send the commission to payroll.', undefined, { code: 'COMMISSION_NO_PAYROLL_RUN' });
    const comp = await this.store.commissionComponentId(user.tenantId);
    if (!comp) throw new ConflictError('No salary component has the COMMISSION role.', undefined, { code: 'COMMISSION_NO_PAYROLL_RUN' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.addPayrollAdjustment(user.tenantId, {
      payrollRunId: run.id, employeeId: c.employee.id, componentId: comp, amount: c.commissionAmount, remarks: `Sales commission ${c.periodStart} – ${c.periodEnd}`, sourceDocId: id,
    }));
    return (await this.store.getCommission(user.tenantId, id))!;
  }

  private async refreshOne(user: SessionUser, meta: RequestMeta, id: string) {
    const t = (await this.store.getTarget(user.tenantId, id))!;
    const achieved = await this.store.achievement(user.tenantId, t.employee.id, t.role, t.periodStart, t.periodEnd, t.route?.id ?? null);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.set('target', user.tenantId, id, { achievedAmount: achieved }));
  }

  private async commission(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.store.getCommission(user.tenantId, id);
    if (!c) throw new NotFoundError('Commission not found');
    if (c.rowVersion !== rowVersion) throw changed();
    return c;
  }

  private async check(user: SessionUser, p: SalesmanTargetInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.employees.some((x) => x.id === p.employeeId)) e.employeeId = 'Choose an active employee';
    if (p.routeId && !o.routes.some((r) => r.id === p.routeId)) e.routeId = 'Choose an active route';
    if (Object.keys(e).length) throw v(e);
  }
}
