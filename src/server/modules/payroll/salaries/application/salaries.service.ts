import { Injectable } from '@nestjs/common';
import { computeLines, taxOn, type ComputedLine, type SalaryInput, type SalaryStructure, type SalaryView, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ComponentStore } from '../../components/application/component-store.js';
import { PayGroupStore, TaxSlabStore } from '../../pay-groups/application/pay-group-store.js';
import { StructureStore } from '../../structures/application/structure-store.js';
import { SalaryStore } from './salary-store.js';

const dayBefore = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
/** Pakistan's tax year runs July to June: 15 Oct 2026 → "2026-27". */
const taxYearOf = (iso: string) => { const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7)); const s = m >= 7 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; };

/**
 * Each employee's effective-dated salary. Past salaries are never overwritten: a revision starts after the current one
 * and closes it the day before. Saved by approvers (prun:approve) and recorded as approved by them.
 */
@Injectable()
export class SalariesService {
  constructor(
    private readonly store: SalaryStore,
    private readonly structures: StructureStore,
    private readonly components: ComponentStore,
    private readonly payGroups: PayGroupStore,
    private readonly slabs: TaxSlabStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** History plus the current salary's lines (structure + add-on) and an estimate of the monthly income tax. */
  async view(user: SessionUser, employeeId: string): Promise<SalaryView> {
    if (!(await this.store.employee(user.tenantId, employeeId))) throw new NotFoundError('Employee not found');
    const history = await this.store.history(user.tenantId, employeeId);
    const cur = history.find((h) => h.isCurrent) ?? history[0] ?? null;
    if (!cur) return { history, current: null };
    const [structures, comps, years] = await Promise.all([this.structures.list(user.tenantId), this.components.list(user.tenantId), this.slabs.years(user.tenantId)]);
    const s = structures.find((x) => x.id === cur.structure.id);
    const a = cur.addon ? structures.find((x) => x.id === cur.addon!.id) : undefined;
    const lines = [...(s?.lines ?? []), ...(a?.lines ?? [])].map((l) => ({ componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText }));
    const calc = computeLines(lines, comps.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null })), cur.basicAmount);
    const taxYear = taxYearOf(new Date().toISOString().slice(0, 10));
    const yearSlabs = years.find((y) => y.taxYear === taxYear)?.slabs;
    const incomeTaxMonthly = yearSlabs ? Math.round(taxOn(this.taxableAnnual(calc.lines, comps, cur.basicAmount, cur.grossAmount - calc.gross), yearSlabs) / 12) : null;
    return { history, current: { ...cur, lines: calc.lines, computedGross: calc.gross, incomeTaxMonthly, taxYear: yearSlabs ? taxYear : null } };
  }

  async create(user: SessionUser, meta: RequestMeta, employeeId: string, input: SalaryInput) {
    const e = await this.employee(user, employeeId);
    if ((await this.store.history(user.tenantId, employeeId)).length) throw new ConflictError('This employee already has a salary. Revise it instead.');
    if (input.effectiveFrom < e.joiningDate) throw new ValidationError('The salary can’t start before the joining date', { effectiveFrom: ['Before joining'] });
    const data = await this.prepare(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, employeeId, approvedByUserId: user.id, approvedAt: new Date().toISOString() }));
    return this.view(user, employeeId);
  }

  async revise(user: SessionUser, meta: RequestMeta, employeeId: string, input: SalaryInput & { rowVersion: number }) {
    await this.employee(user, employeeId);
    const latest = (await this.store.history(user.tenantId, employeeId))[0];
    if (!latest) throw new ConflictError('This employee has no salary yet. Add the first salary instead.');
    if (latest.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this salary. Reload and try again.');
    if (input.effectiveFrom <= latest.effectiveFrom) {
      throw new ConflictError('A revision must start after the current salary started. Past salaries are never overwritten.', { effectiveFrom: [`After ${latest.effectiveFrom}`] }, { code: 'SALARY_REVISION_BACKDATED' });
    }
    const data = await this.prepare(user, input);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ id: latest.id, rowVersion: latest.rowVersion, effectiveTo: dayBefore(input.effectiveFrom) });
      await this.store.save({ ...data, employeeId, approvedByUserId: user.id, approvedAt: new Date().toISOString() });
    });
    return this.view(user, employeeId);
  }

  /** Only the latest revision, and only while no payroll run uses it; the previous salary is re-opened. */
  async deleteLatest(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const employeeId = await this.store.employeeOfSalary(user.tenantId, id);
    if (!employeeId) throw new NotFoundError('Salary not found');
    const [latest, previous] = await this.store.history(user.tenantId, employeeId);
    if (!latest || latest.id !== id) throw new ConflictError('Only the latest salary revision can be removed.');
    if (await this.store.inUse(id)) throw new ConflictError('Payroll runs already use this salary.', undefined, { code: 'DB_FOREIGN_KEY_VIOLATION' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.remove(user.tenantId, id, rowVersion);
      if (previous) await this.store.save({ id: previous.id, rowVersion: previous.rowVersion, effectiveTo: null });
    });
    return this.view(user, latest.employeeId);
  }

  /** Structure (active grade structure), add-on (active add-on), pay group, and gross: given, or the structure's computed gross. */
  private async prepare(user: SessionUser, input: SalaryInput) {
    const [structures, groups, comps] = await Promise.all([this.structures.list(user.tenantId), this.payGroups.list(user.tenantId), this.components.list(user.tenantId)]);
    const pick = (id: string | null, kind: string, field: string): SalaryStructure | undefined => {
      if (!id) return undefined;
      const s = structures.find((x) => x.id === id);
      if (!s || s.structureKind !== kind || s.status !== 'ACTIVE') throw new ValidationError(`Choose an active ${kind === 'GRADE' ? 'grade' : 'add-on'} structure`, { [field]: ['Not an active structure'] });
      return s;
    };
    const s = pick(input.structureId, 'GRADE', 'structureId')!;
    const a = pick(input.addonStructureId, 'ADDON', 'addonStructureId');
    if (input.payGroupId && !groups.some((g) => g.id === input.payGroupId && g.status === 'ACTIVE')) throw new ValidationError('Choose an active pay group', { payGroupId: ['Not an active pay group'] });
    const lines = [...s.lines, ...(a?.lines ?? [])].map((l) => ({ componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText }));
    const gross = input.grossAmount ?? computeLines(lines, comps.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null })), input.basicAmount).gross;
    if (gross < input.basicAmount) throw new ValidationError('Gross can’t be less than basic', { grossAmount: ['Less than basic'] });
    return {
      structureId: s.id, addonStructureId: a?.id ?? null, payGroupId: input.payGroupId, effectiveFrom: input.effectiveFrom, basicAmount: input.basicAmount, grossAmount: gross,
      payMode: input.payMode, revisionType: input.revisionType, revisionReason: input.revisionReason,
    };
  }

  /** Annual taxable income: earnings less exempt parts (exempt, or exempt up to % of basic / an annual amount), plus any negotiated gross above the lines. */
  private taxableAnnual(lines: ComputedLine[], comps: Awaited<ReturnType<ComponentStore['list']>>, basic: number, extra: number) {
    let monthly = Math.max(0, extra);
    for (const l of lines) {
      const c = comps.find((x) => x.id === l.componentId);
      if (!c || c.componentType !== 'EARNING' || l.monthly === null) continue;
      if (c.taxTreatment === 'EXEMPT') continue;
      let exempt = 0;
      if (c.taxTreatment === 'EXEMPT_UPTO_LIMIT') exempt = Math.min(l.monthly, c.exemptLimitPercentOfBasic != null ? (basic * c.exemptLimitPercentOfBasic) / 100 : (c.exemptLimitAnnualAmount ?? 0) / 12);
      monthly += l.monthly - exempt;
    }
    return monthly * 12;
  }

  private async employee(user: SessionUser, id: string) {
    const e = await this.store.employee(user.tenantId, id);
    if (!e) throw new NotFoundError('Employee not found');
    if (e.status === 'EXITED') throw new ConflictError('This employee has exited. Rejoin them first.', undefined, { code: 'EMPLOYEE_EXITED' });
    return e;
  }
}
