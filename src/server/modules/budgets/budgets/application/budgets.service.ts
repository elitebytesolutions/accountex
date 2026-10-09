import { Injectable } from '@nestjs/common';
import type { BudgetDetail, BudgetInput, BudgetLinesInput, BudgetList, BudgetQuery, BudgetVariance, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { BudgetStore, type SeedLine } from './budget-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const invalid = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft budget version can be changed. Create a new version instead.', undefined, { code: 'BUDGET_VERSION_NOT_EDITABLE' });

/**
 * Budgets per fiscal year: a budget starts with version 1 (blank, or seeded from last year's actuals / budget with an
 * uplift); a draft version's account × month lines are edited, submitted for review and approved by someone else
 * (the previous approved version is superseded). Changing an approved budget means a new version. Budget vs actual
 * compares a version with posted actuals (Accounting.getBudgetVsActual).
 */
@Injectable()
export class BudgetsService {
  constructor(private readonly store: BudgetStore, private readonly unitOfWork: UnitOfWork) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async list(user: SessionUser, q: BudgetQuery): Promise<BudgetList> {
    const { items, total } = await this.store.list(user.tenantId, q);
    let revenue = 0, costs = 0, capexBudget = 0, capexUtilised = 0;
    for (const b of items) {
      if (b.budgetType === 'CAPITAL') { capexBudget += b.amount; capexUtilised += b.actualToDate; continue; }
      if (b.budgetType !== 'OPERATING' || !b.currentVersion) continue;
      const v = await this.store.version(user.tenantId, b.currentVersion.id);
      for (const l of v?.lines ?? []) { if (l.account.accountClass === 4) revenue += l.total; else costs += l.total; }
    }
    return { items, total, kpis: { revenue: r2(revenue), costs: r2(costs), result: r2(revenue - costs), capexBudget: r2(capexBudget), capexUtilised: r2(capexUtilised) } };
  }

  async get(user: SessionUser, id: string, versionId: string | null): Promise<BudgetDetail> {
    const b = await this.store.get(user.tenantId, id);
    if (!b) throw new NotFoundError('Budget not found');
    const vId = versionId ?? b.currentVersion?.id ?? null;
    const v = vId ? await this.store.version(user.tenantId, vId) : null;
    if (v && v.budgetId !== id) throw new NotFoundError('Budget version not found');
    return { ...b, version: v };
  }

  async create(user: SessionUser, meta: RequestMeta, input: BudgetInput) {
    const o = await this.store.options(user.tenantId);
    const fy = o.fiscalYears.find((f) => f.id === input.fiscalYearId);
    const e: Record<string, string> = {};
    if (!fy) e.fiscalYearId = 'Choose a fiscal year';
    if (input.costCentreId && !o.costCentres.some((c) => c.id === input.costCentreId)) e.costCentreId = 'Choose an active cost centre';
    if (input.projectId && !o.projects.some((p) => p.id === input.projectId)) e.projectId = 'Choose an open project';
    if (Object.keys(e).length) throw invalid(e);
    const seedFrom = input.seedFrom ?? 'BLANK';
    let lines: SeedLine[] = [];
    if (seedFrom !== 'BLANK') {
      const prev = await this.store.previousYear(user.tenantId, input.fiscalYearId);
      if (prev) lines = seedFrom === 'PRIOR_ACTUALS' ? await this.store.actuals(user.tenantId, prev) : await this.store.priorBudgetLines(user.tenantId, prev, input.budgetType);
      const k = 1 + Number(input.seedUpliftPct ?? 0) / 100;
      lines = lines.map((l) => ({ ...l, months: l.months.map((m) => r2(m * k)) })).filter((l) => l.months.some((m) => m !== 0));
    }
    const code = await this.store.nextCode(user.tenantId, Number(fy!.startDate.slice(0, 4)));
    const scope = input.budgetType === 'DEPARTMENT' ? input.department ?? o.costCentres.find((c) => c.id === input.costCentreId)?.name ?? null
      : input.budgetType === 'PROJECT' ? o.projects.find((p) => p.id === input.projectId)?.name ?? null : 'Company';
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.create(user.tenantId, {
      code, name: input.name, fiscalYearId: input.fiscalYearId, budgetType: input.budgetType, scopeLabel: scope, department: input.department ?? null,
      costCentreId: input.costCentreId ?? null, projectId: input.projectId ?? null, branchId: input.branchId ?? null, ownerUserId: input.ownerUserId ?? user.id,
      seedFrom, seedUpliftPct: seedFrom === 'BLANK' ? null : input.seedUpliftPct === null || input.seedUpliftPct === undefined ? null : Number(input.seedUpliftPct), requiresCeoApproval: input.requiresCeoApproval ?? false, status: 'DRAFT',
    }, lines));
    return this.get(user, id, null);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const b = await this.get(user, id, null);
    if (b.status === 'APPROVED' || b.versions.some((v) => v.status === 'APPROVED' || v.status === 'SUPERSEDED')) throw new ConflictError('An approved budget stays on record.', undefined, { code: 'BUDGET_VERSION_NOT_EDITABLE' });
    if (b.rowVersion !== rowVersion) throw new ConcurrencyError('This budget was changed. Reload and try again.');
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.remove(user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This budget was changed. Reload and try again.');
  }

  /** Replaces a draft version's lines (one per account and cost centre; 12 months each). */
  async saveLines(user: SessionUser, meta: RequestMeta, versionId: string, input: BudgetLinesInput) {
    const v = await this.store.version(user.tenantId, versionId);
    if (!v) throw new NotFoundError('Budget version not found');
    if (v.status !== 'DRAFT') throw notEditable();
    if (input.rowVersion !== undefined && Number(input.rowVersion) !== v.rowVersion) throw new ConcurrencyError('This budget version was changed. Reload and try again.');
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    const seen = new Set<string>();
    const lines = input.lines.map((l, i) => {
      if (!o.accounts.some((a) => a.id === l.accountId)) e[`lines.${i}.accountId`] = 'Choose a postable account';
      if (l.costCentreId && !o.costCentres.some((c) => c.id === l.costCentreId)) e[`lines.${i}.costCentreId`] = 'Choose an active cost centre';
      const key = `${l.accountId}|${l.costCentreId ?? ''}`;
      if (seen.has(key)) e[`lines.${i}.accountId`] = 'This account is already on the budget';
      seen.add(key);
      return { accountId: l.accountId, costCentreId: l.costCentreId ?? null, months: l.months.map(Number) };
    });
    if (Object.keys(e).length) throw invalid(e);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.replaceLines(user.tenantId, versionId, lines));
    return this.get(user, v.budgetId, versionId);
  }

  async newVersion(user: SessionUser, meta: RequestMeta, id: string) {
    const b = await this.get(user, id, null);
    if (b.versions.some((v) => v.status === 'DRAFT' || v.status === 'IN_REVIEW')) throw new ConflictError('Finish the open version (draft or in review) first.', undefined, { code: 'BUDGET_VERSION_NOT_EDITABLE' });
    const vId = await this.unitOfWork.run(actorContext(user, meta), () => this.store.newVersion(user.tenantId, id));
    return this.get(user, id, vId);
  }

  async submit(user: SessionUser, meta: RequestMeta, versionId: string) {
    const v = await this.store.version(user.tenantId, versionId);
    if (!v) throw new NotFoundError('Budget version not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.submit(versionId));
    return this.get(user, v.budgetId, versionId);
  }

  async approve(user: SessionUser, meta: RequestMeta, versionId: string) {
    const v = await this.store.version(user.tenantId, versionId);
    if (!v) throw new NotFoundError('Budget version not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.approve(versionId));
    return this.get(user, v.budgetId, versionId);
  }

  /** Budget vs actual of a version (the current one by default) over fiscal months [from..to]. */
  async variance(user: SessionUser, id: string, versionId: string | null, from: number, to: number): Promise<BudgetVariance> {
    const b = await this.get(user, id, versionId);
    const rows = b.version ? (await this.store.variance(user.tenantId, b.version.id)).filter((r) => r.monthNo >= from && r.monthNo <= to) : [];
    const start = new Date(`${b.fiscalYear.startDate}T00:00:00Z`);
    const label = (n: number) => { const d = new Date(start); d.setUTCMonth(d.getUTCMonth() + n - 1); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
    const isRev = (c: number) => c === 4;
    const months = Array.from({ length: to - from + 1 }, (_, i) => from + i).map((m) => {
      const mine = rows.filter((r) => r.monthNo === m);
      const s = (f: (r: (typeof rows)[number]) => boolean, k: 'budget' | 'actual') => r2(mine.filter(f).reduce((a, r) => a + r[k], 0));
      return { monthNo: m, label: label(m), budgetRevenue: s((r) => isRev(r.accountClass), 'budget'), actualRevenue: s((r) => isRev(r.accountClass), 'actual'), budgetCost: s((r) => !isRev(r.accountClass), 'budget'), actualCost: s((r) => !isRev(r.accountClass), 'actual') };
    });
    const byAccount = new Map<string, BudgetVariance['accounts'][number]>();
    const byCc = new Map<string, BudgetVariance['costCentres'][number]>();
    for (const r of rows) {
      const a = byAccount.get(r.accountId) ?? { account: { id: r.accountId, code: r.accountCode, name: r.accountName, accountClass: r.accountClass }, kind: isRev(r.accountClass) ? 'REVENUE' as const : 'COST' as const, budget: 0, actual: 0, variance: 0, variancePct: null, utilisationPct: null };
      a.budget = r2(a.budget + r.budget); a.actual = r2(a.actual + r.actual);
      byAccount.set(r.accountId, a);
      const ck = r.costCentreId ?? '';
      const c = byCc.get(ck) ?? { costCentre: r.costCentreId ? { id: r.costCentreId, code: r.costCentreCode ?? '?', name: r.costCentreName ?? '?' } : null, budget: 0, actual: 0 };
      if (!isRev(r.accountClass)) { c.budget = r2(c.budget + r.budget); c.actual = r2(c.actual + r.actual); }
      byCc.set(ck, c);
    }
    const accounts = [...byAccount.values()].map((a) => {
      const variance = r2(a.kind === 'REVENUE' ? a.actual - a.budget : a.budget - a.actual);
      return { ...a, variance, variancePct: a.budget ? Math.round((variance / Math.abs(a.budget)) * 1000) / 10 : null, utilisationPct: a.budget ? Math.round((a.actual / a.budget) * 1000) / 10 : null };
    }).sort((x, y) => x.account.code.localeCompare(y.account.code));
    const sum = (f: (a: (typeof accounts)[number]) => boolean, k: 'budget' | 'actual') => r2(accounts.filter(f).reduce((s, a) => s + a[k], 0));
    const bR = sum((a) => a.kind === 'REVENUE', 'budget'), aR = sum((a) => a.kind === 'REVENUE', 'actual'), bC = sum((a) => a.kind === 'COST', 'budget'), aC = sum((a) => a.kind === 'COST', 'actual');
    return {
      budget: { id: b.id, code: b.code, name: b.name, fiscalYear: b.fiscalYear.code }, version: b.version && { id: b.version.id, versionNo: b.version.versionNo, status: b.version.status },
      fromMonth: from, toMonth: to, months, accounts, costCentres: [...byCc.values()].filter((c) => c.budget || c.actual),
      totals: { budgetRevenue: bR, actualRevenue: aR, budgetCost: bC, actualCost: aC, budgetResult: r2(bR - bC), actualResult: r2(aR - aC), linesOver: accounts.filter((a) => a.variance < 0).length, linesTotal: accounts.length },
    };
  }
}
