import { Injectable } from '@nestjs/common';
import { addonErrors, type Addon, type AddonCreate, type AddonPlansInput, type AdminSession, type AddonUpdate } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { AddonStore } from './addon-store.js';

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Add-ons sold on top of a plan (Plan Entitlements › Add-ons): price, billing unit and availability per plan. */
@Injectable()
export class AddonsService {
  constructor(
    private readonly store: AddonStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  async get(id: string): Promise<Addon> {
    const a = await this.store.get(id);
    if (!a) throw new NotFoundError('Add-on not found');
    return a;
  }

  async create(admin: AdminSession, meta: RequestMeta, input: AddonCreate): Promise<Addon> {
    await this.assertCodeFree(input.code, null);
    await this.checkLinks(input.platformModuleId, input.plans?.map((p) => p.planId));
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save(defined(input)));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: AddonUpdate): Promise<Addon> {
    const a = await this.current(id, input.rowVersion);
    const { rowVersion, ...rest } = input;
    const patch = defined(rest) as Partial<AddonUpdate>;
    const e = addonErrors({ ...a, ...patch });
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    if (patch.code && patch.code !== a.code) await this.assertCodeFree(patch.code, id);
    if (patch.platformModuleId) await this.checkLinks(patch.platformModuleId);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...patch, id, rowVersion }));
    return this.get(id);
  }

  /** Availability per plan (AVAILABLE / INCLUDED / NOT_AVAILABLE); rows keep their id per plan. */
  async setPlans(admin: AdminSession, meta: RequestMeta, id: string, input: AddonPlansInput): Promise<Addon> {
    const a = await this.current(id, input.rowVersion);
    await this.checkLinks(null, input.plans.map((p) => p.planId));
    const plans = input.plans.map((p) => {
      const existing = a.plans.find((x) => x.planId === p.planId);
      return { ...(existing && { id: existing.id }), planId: p.planId, availability: p.availability };
    });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, plans }));
    return this.get(id);
  }

  async setActive(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number, isActive: boolean): Promise<Addon> {
    const a = await this.current(id, rowVersion);
    if (a.isActive === isActive) return a;
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, isActive }));
    return this.get(id);
  }

  /** Soft delete of an add-on no tenant, invoice or alert rule uses; otherwise deactivate it. */
  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Tenants, invoices or alert rules use this add-on. Deactivate it instead.', undefined, { code: 'ADDON_IN_USE' });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.softDelete(id, rowVersion));
  }

  private async checkLinks(moduleId?: string | null, planIds: string[] = []) {
    if (moduleId && !(await this.store.moduleExists(moduleId))) throw new ValidationError('Choose an existing module', { platformModuleId: ['Unknown module'] });
    for (const p of planIds) if (!(await this.store.planExists(p))) throw new ValidationError('Choose an existing plan', { plans: ['Unknown plan'] });
  }

  private async assertCodeFree(code: string, id: string | null) {
    const hit = (await this.store.allCodes()).find((c) => c.id !== id && c.code === code);
    if (hit) {
      throw new ConflictError(hit.deleted ? `${code} belonged to a deleted add-on and can't be reused.` : `An add-on with code ${code} already exists.`,
        { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const a = await this.get(id);
    if (a.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this add-on. Reload and try again.');
    return a;
  }
}
