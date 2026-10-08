import { Injectable } from '@nestjs/common';
import {
  cleanComponent, componentErrors, dependsOnItself, formulaRefs,
  type ComponentCreate, type ComponentUpdate, type SalaryComponent, type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertCodeFree, details } from '../../domain/codes.js';
import { ComponentStore } from './component-store.js';

type Shape = Partial<SalaryComponent> & { id: string; code: string; baseComponentId?: string | null; formula?: string | null };

/** Salary components: earnings, deductions and employer contributions with their calculation, GL accounts and tax treatment. */
@Injectable()
export class ComponentsService {
  constructor(
    private readonly store: ComponentStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: ComponentCreate): Promise<SalaryComponent> {
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'component');
    await this.check(user, { ...input, id: '(new)' });
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, status: 'ACTIVE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ComponentUpdate): Promise<SalaryComponent> {
    const c = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== c.code) assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'component');
    const merged = cleanComponent({
      ...c, baseComponentId: c.baseComponent?.id ?? null, debitAccountId: c.debitAccount?.id ?? null, creditAccountId: c.creditAccount?.id ?? null,
      ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    });
    await this.check(user, merged);
    const { rowVersion, ...rest } = merged as typeof merged & { rowVersion: number };
    const keys = ['code', 'name', 'componentType', 'calcMethod', 'baseBasis', 'baseComponentId', 'percent', 'fixedAmount', 'wageCeiling', 'formula', 'calcDescription', 'debitAccountId',
      'creditAccountId', 'taxTreatment', 'exemptLimitPercentOfBasic', 'exemptLimitAnnualAmount', 'prorateOnPaidDays', 'showOnPayslip', 'includeInGratuityBase', 'includeInEobiWage', 'systemRole', 'sortOrder'];
    const data = Object.fromEntries(keys.map((k) => [k, (rest as Record<string, unknown>)[k] ?? null]));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, id, rowVersion }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<SalaryComponent> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Salary structures, other components or payroll lines use this component. Deactivate it instead.', undefined, { code: 'COMPONENT_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  /** Field rules, GL accounts that can be posted to, and no loop through percent-of bases or formula references. */
  private async check(user: SessionUser, c: Shape & Parameters<typeof componentErrors>[0]) {
    const e = componentErrors(c);
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, details(e));
    const [all, opts] = await Promise.all([this.store.list(user.tenantId), this.store.options(user.tenantId)]);
    for (const k of ['debitAccountId', 'creditAccountId'] as const) {
      const a = c[k];
      if (a && !opts.accounts.some((x) => x.id === a)) throw new ValidationError('Choose an active postable account', { [k]: ['Not a postable account'] });
    }
    if (c.baseComponentId && !all.some((x) => x.id === c.baseComponentId)) throw new ValidationError('Choose an existing component', { baseComponentId: ['Unknown component'] });
    const unknown = formulaRefs(c.formula).filter((r) => r === c.code || all.some((x) => x.code === r));
    const deps = new Map<string, string[]>(all.map((x) => [x.id, [...(x.baseComponent ? [x.baseComponent.id] : []), ...formulaRefs(x.formula).map((r) => all.find((y) => y.code === r)?.id).filter((y): y is string => !!y)]]));
    deps.set(c.id, [...(c.baseComponentId ? [c.baseComponentId] : []), ...unknown.map((r) => (r === c.code ? c.id : all.find((y) => y.code === r)!.id))]);
    if (c.baseComponentId === c.id || unknown.includes(c.code) || dependsOnItself(deps, c.id)) {
      throw new ValidationError('This calculation refers back to itself through other components.', { [c.formula ? 'formula' : 'baseComponentId']: ['Loop'] }, { code: 'COMPONENT_CYCLE' });
    }
  }

  private async get(user: SessionUser, id: string) {
    const c = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!c) throw new NotFoundError('Component not found');
    return c;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this component. Reload and try again.');
    return c;
  }
}
