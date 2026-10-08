import { Injectable } from '@nestjs/common';
import type { AdminSession, ModuleCreate, ModulePlansInput, ModuleUpdate, PlatformModule } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { disablesCore } from '../domain/core-module.js';
import { ModuleStore } from './module-store.js';

const coreLocked = () => new ValidationError("Core modules are always on and can't be disabled.", { isEnabled: ['Core modules are always on'] }, { code: 'MODULE_CORE_LOCKED' });
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Platform modules (Super Admin › Feature Management › Plan Entitlements, "Modules by plan"): which plans include each
 * module and whether it is switched on platform-wide. Core modules stay on.
 */
@Injectable()
export class ModulesService {
  constructor(
    private readonly store: ModuleStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  async get(id: string): Promise<PlatformModule> {
    const m = await this.store.get(id);
    if (!m) throw new NotFoundError('Module not found');
    return m;
  }

  async create(admin: AdminSession, meta: RequestMeta, input: ModuleCreate): Promise<PlatformModule> {
    await this.assertKeyFree(input.key, null);
    await this.checkPlans(input.minPlanId, input.plans?.map((p) => p.planId));
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save(defined(input)));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: ModuleUpdate): Promise<PlatformModule> {
    const m = await this.current(id, input.rowVersion);
    const { rowVersion, ...rest } = input;
    const patch = defined(rest) as Partial<ModuleUpdate>;
    if (disablesCore(m, patch)) throw coreLocked();
    if (patch.key && patch.key !== m.key) await this.assertKeyFree(patch.key, id);
    if (patch.minPlanId) await this.checkPlans(patch.minPlanId);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...patch, id, rowVersion }));
    return this.get(id);
  }

  /** Per-plan inclusion (the matrix cells); rows keep their id per plan. */
  async setPlans(admin: AdminSession, meta: RequestMeta, id: string, input: ModulePlansInput): Promise<PlatformModule> {
    const m = await this.current(id, input.rowVersion);
    await this.checkPlans(null, input.plans.map((p) => p.planId));
    const plans = input.plans.map((p) => {
      const existing = m.plans.find((x) => x.planId === p.planId);
      return { ...(existing && { id: existing.id }), planId: p.planId, isIncluded: p.isIncluded };
    });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, plans }));
    return this.get(id);
  }

  async setEnabled(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number, isEnabled: boolean): Promise<PlatformModule> {
    const m = await this.current(id, rowVersion);
    if (m.isEnabled === isEnabled) return m;
    if (disablesCore(m, { isEnabled })) throw coreLocked();
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, isEnabled }));
    return this.get(id);
  }

  /** Soft delete of an unused, non-core module; one in use is disabled instead. */
  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const m = await this.current(id, rowVersion);
    if (m.isCore) throw new ValidationError("Core modules can't be deleted.", undefined, { code: 'MODULE_CORE_LOCKED' });
    if (await this.store.inUse(id)) throw new ConflictError('Add-ons, feature flags or entitlement history use this module. Disable it instead.', undefined, { code: 'MODULE_IN_USE' });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.softDelete(id, rowVersion));
  }

  private async checkPlans(minPlanId?: string | null, planIds: string[] = []) {
    for (const p of [minPlanId, ...planIds].filter((x): x is string => !!x)) {
      if (!(await this.store.planExists(p))) throw new ValidationError('Choose an existing plan', { minPlanId: ['Unknown plan'] });
    }
  }

  private async assertKeyFree(key: string, id: string | null) {
    const hit = (await this.store.allKeys()).find((k) => k.id !== id && k.key === key);
    if (hit) {
      throw new ConflictError(hit.deleted ? `${key} belonged to a deleted module and can't be reused.` : `A module with key ${key} already exists.`,
        { key: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const m = await this.get(id);
    if (m.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this module. Reload and try again.');
    return m;
  }
}
