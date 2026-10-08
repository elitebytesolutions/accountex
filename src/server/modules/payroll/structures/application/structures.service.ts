import { Injectable } from '@nestjs/common';
import {
  computeLines, structureErrors,
  type CommissionTierInput, type SalaryStructure, type SessionUser, type StructureCreate, type StructureLineInput, type StructureUpdate,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ComponentStore } from '../../components/application/component-store.js';
import { assertCodeFree, details } from '../../domain/codes.js';
import { StructureStore } from './structure-store.js';

/**
 * Salary structures: a grade's components (with per-line overrides) or an add-on with sales-commission tiers. Draft →
 * Active → Retired. The gross at mid basic is computed from the lines.
 */
@Injectable()
export class StructuresService {
  constructor(
    private readonly store: StructureStore,
    private readonly components: ComponentStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: StructureCreate): Promise<SalaryStructure> {
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'structure');
    const data = await this.prepare(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, status: 'DRAFT' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: StructureUpdate): Promise<SalaryStructure> {
    const s = await this.current(user, id, input.rowVersion);
    if (s.status === 'RETIRED') throw new ConflictError('A retired structure can’t be edited. Duplicate it instead.');
    if (input.code && input.code !== s.code) assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'structure');
    const merged = {
      code: s.code, name: s.name, structureKind: s.structureKind as 'GRADE' | 'ADDON', gradeId: s.grade?.id ?? null, basicMin: s.basicMin, basicMax: s.basicMax,
      commissionCapPercentOfBasic: s.commissionCapPercentOfBasic, description: s.description, effectiveFrom: s.effectiveFrom,
      lines: s.lines.map((l) => ({ id: l.id, componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText })),
      tiers: s.tiers,
      ...Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== undefined && k !== 'rowVersion')),
    } as StructureCreate;
    const data = await this.prepare(user, merged, s);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  /** activate (needs lines, and Basic for a grade structure) · retire · draft (back to draft while nobody is paid on it). */
  async setStatus(user: SessionUser, meta: RequestMeta, id: string, action: 'activate' | 'retire' | 'draft', rowVersion: number): Promise<SalaryStructure> {
    const s = await this.current(user, id, rowVersion);
    if (action === 'activate') {
      if (!s.lines.length) throw new ValidationError('Add the components before activating', { lines: ['No components'] });
      const comps = await this.components.list(user.tenantId);
      if (s.structureKind === 'GRADE' && !s.lines.some((l) => comps.find((c) => c.id === l.component.id)?.systemRole === 'BASIC')) throw new ValidationError('A grade structure needs the Basic component', { lines: ['Add Basic'] });
    }
    if (action === 'draft' && s.staff > 0) throw new ConflictError('Employees are paid on this structure. Retire it instead.', undefined, { code: 'STRUCTURE_IN_USE' });
    const status = { activate: 'ACTIVE', retire: 'RETIRED', draft: 'DRAFT' }[action];
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status }));
    return this.get(user, id);
  }

  /** A draft copy with a new code (the template's "Duplicate structure"). */
  async duplicate(user: SessionUser, meta: RequestMeta, id: string, input: { code: string; name: string }): Promise<SalaryStructure> {
    const s = await this.get(user, id);
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'structure');
    const newId = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      code: input.code, name: input.name, structureKind: s.structureKind, gradeId: s.grade?.id ?? null, basicMin: s.basicMin, basicMax: s.basicMax, grossMid: s.grossMid,
      commissionCapPercentOfBasic: s.commissionCapPercentOfBasic, description: s.description, copiedFromStructureId: s.id, status: 'DRAFT',
      components: s.lines.map((l, i) => ({ componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText, sortOrder: i })),
      commissionTiers: s.tiers.map((t) => ({ achievementFromPct: t.achievementFromPct, achievementToPct: t.achievementToPct, commissionRatePct: t.commissionRatePct })),
    }));
    return this.get(user, newId);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Employee salaries use this structure. Retire it instead.', undefined, { code: 'STRUCTURE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  /** Validates the structure and builds the save payload: lines in order (ids kept), tiers, and the gross at mid basic. */
  private async prepare(user: SessionUser, s: StructureCreate, existing?: SalaryStructure) {
    const e = structureErrors(s);
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, details(e));
    const comps = await this.components.list(user.tenantId);
    s.lines.forEach((l, i) => {
      const c = comps.find((x) => x.id === l.componentId);
      if (!c) throw new ValidationError('Choose an existing component', { [`lines.${i}.componentId`]: ['Unknown component'] });
      if (c.status !== 'ACTIVE' && !existing?.lines.some((x) => x.component.id === c.id)) throw new ValidationError(`${c.code} is inactive`, { [`lines.${i}.componentId`]: ['Inactive component'] });
    });
    const known = new Set(existing?.lines.map((l) => l.id) ?? []);
    const knownTiers = new Set(existing?.tiers.map((t) => t.id) ?? []);
    const lines = s.lines.map((l: StructureLineInput, i) => ({ ...(l.id && known.has(l.id) ? { id: l.id } : {}), componentId: l.componentId, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText, sortOrder: i }));
    const tiers = s.tiers.map((t: CommissionTierInput) => ({ ...(t.id && knownTiers.has(t.id) ? { id: t.id } : {}), achievementFromPct: t.achievementFromPct, achievementToPct: t.achievementToPct, commissionRatePct: t.commissionRatePct }));
    const mid = s.basicMin != null && s.basicMax != null ? (s.basicMin + s.basicMax) / 2 : s.basicMin ?? s.basicMax;
    const calcComps = comps.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null }));
    const grossMid = s.structureKind === 'GRADE' && mid ? computeLines(lines.map((l) => ({ ...l, calcMethod: l.calcMethod ?? null })), calcComps, mid).gross : null;
    return {
      code: s.code, name: s.name, structureKind: s.structureKind, gradeId: s.structureKind === 'ADDON' ? s.gradeId ?? null : s.gradeId, basicMin: s.basicMin, basicMax: s.basicMax, grossMid,
      commissionCapPercentOfBasic: s.commissionCapPercentOfBasic, description: s.description, ...(s.effectiveFrom && { effectiveFrom: s.effectiveFrom }),
      components: lines, commissionTiers: tiers,
    };
  }

  private async get(user: SessionUser, id: string) {
    const s = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!s) throw new NotFoundError('Structure not found');
    return s;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this structure. Reload and try again.');
    return s;
  }
}
