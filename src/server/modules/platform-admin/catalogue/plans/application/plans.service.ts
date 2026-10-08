import { Injectable } from '@nestjs/common';
import {
  PLAN_PRICE_FIELDS,
  type AdminSession, type PlanCreate, type PlanFeaturesInput, type PlanLimitsInput, type PlanSaveResult, type PlanUpdate, type SubscriptionPlan,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../../core/domain/errors.js';
import { nextVersionCode, priceChanged, sameFamily, versionOf } from '../domain/plan-versioning.js';
import { PlanStore } from './plan-store.js';

/** The plan fields a new version copies (everything but identity, status and stamps). */
const COPIED = [
  'name', 'tagline', 'priceMonthly', 'priceAnnual', 'extraSeatPrice', 'isCustomPrice', 'userSeats', 'storageGb', 'trialDays',
  'sortOrder', 'isPublic', 'supportChannel', 'supportResponseHours', 'slaUptimePct',
] as const;
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Subscription plans (Super Admin › Billing › Plans & Pricing). Writes run in the admin's audit context, so history
 * names the Super Admin. A price change on a plan with subscriptions creates <CODE>_V<n> and retires the old plan in
 * one transaction; otherwise the plan is edited in place.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly store: PlanStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  async get(id: string): Promise<SubscriptionPlan> {
    const plan = await this.store.get(id);
    if (!plan) throw new NotFoundError('Plan not found');
    return plan;
  }

  usageMeters() {
    return this.store.usageMeters();
  }

  /** The plan's family: every version of its code, newest first ("Price history"). */
  async versions(id: string): Promise<SubscriptionPlan[]> {
    const plan = await this.get(id);
    const family = (await this.store.list()).filter((p) => sameFamily(p.code, plan.code));
    return family.sort((a, b) => versionOf(b.code) - versionOf(a.code) || b.createdAt.localeCompare(a.createdAt));
  }

  async create(admin: AdminSession, meta: RequestMeta, input: PlanCreate): Promise<SubscriptionPlan> {
    await this.assertCodeFree(input.code, null);
    const { features, ...fields } = input;
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.save({ ...fields, status: 'ACTIVE', ...(features && { features }) }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: PlanUpdate): Promise<PlanSaveResult> {
    const plan = await this.current(id, input.rowVersion);
    const { rowVersion, ...rest } = input;
    const patch = defined(rest);
    if (patch.code && patch.code !== plan.code) await this.assertCodeFree(String(patch.code), id);

    if (plan.hasSubscriptions && priceChanged(plan, patch, PLAN_PRICE_FIELDS)) {
      // Grandfathering: subscribers keep the old plan (retired); new sign-ups get the new version.
      const code = nextVersionCode(String(patch.code ?? plan.code), (await this.store.allCodes()).map((c) => c.code));
      const newId = await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
        const copy = Object.fromEntries(COPIED.map((k) => [k, plan[k]]));
        const created = await this.store.save({
          ...copy, ...patch, code, status: 'ACTIVE',
          features: plan.features.map(({ moduleKey, inclusion, addonPrice }) => ({ moduleKey, inclusion, addonPrice })),
          limits: plan.limits.map(({ usageMeterId, limitValue, overagePrice }) => ({ usageMeterId, limitValue, overagePrice })),
        });
        await this.store.save({ id, rowVersion, status: 'RETIRED' });
        await this.store.copyLinks(id, created);
        return created;
      });
      return { plan: await this.get(newId), versioned: true, retiredPlanId: id };
    }

    if (patch.isPublic === false) await this.assertNotLastPublic(plan);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...patch, id, rowVersion }));
    return { plan: await this.get(id), versioned: false, retiredPlanId: null };
  }

  /** Replaces the plan's module features (Plans & Pricing matrix); rows keep their id per module key. */
  async setFeatures(admin: AdminSession, meta: RequestMeta, id: string, input: PlanFeaturesInput): Promise<SubscriptionPlan> {
    const plan = await this.current(id, input.rowVersion);
    const features = input.features.map((f) => {
      const existing = plan.features.find((x) => x.moduleKey === f.moduleKey);
      return { ...(existing && { id: existing.id }), moduleKey: f.moduleKey, inclusion: f.inclusion, addonPrice: f.inclusion === 'ADDON' ? f.addonPrice : null };
    });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, features }));
    return this.get(id);
  }

  /** Replaces the plan's usage limits (one per meter; blank limit = unlimited). */
  async setLimits(admin: AdminSession, meta: RequestMeta, id: string, input: PlanLimitsInput): Promise<SubscriptionPlan> {
    const plan = await this.current(id, input.rowVersion);
    const limits = input.limits.map((l) => {
      const existing = plan.limits.find((x) => x.usageMeterId === l.usageMeterId);
      return { ...(existing && { id: existing.id }), ...l };
    });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: input.rowVersion, limits }));
    return this.get(id);
  }

  /** Retired plans take no new sign-ups; existing subscriptions keep running. The last public plan can't be retired. */
  async retire(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<SubscriptionPlan> {
    const plan = await this.current(id, rowVersion);
    if (plan.status === 'RETIRED') return plan;
    await this.assertNotLastPublic(plan);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, status: 'RETIRED' }));
    return this.get(id);
  }

  async reactivate(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<SubscriptionPlan> {
    const plan = await this.current(id, rowVersion);
    if (plan.status === 'ACTIVE') return plan;
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, status: 'ACTIVE' }));
    return this.get(id);
  }

  /** Only a plan nothing uses (no subscriptions, invoices, leads, module minimums, …) can be deleted; retire it instead. */
  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const plan = await this.current(id, rowVersion);
    if (plan.hasSubscriptions || (await this.store.inUse(id))) {
      throw new ConflictError('Subscriptions, invoices or other records use this plan. Retire it instead.', undefined, { code: 'PLAN_IN_USE' });
    }
    await this.assertNotLastPublic(plan);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.remove(id, rowVersion));
  }

  private async assertNotLastPublic(plan: SubscriptionPlan) {
    if (plan.status === 'ACTIVE' && plan.isPublic && (await this.store.activePublicCount(plan.id)) === 0) {
      throw new ConflictError('This is the last public plan: new customers would have nothing to sign up for.', undefined, { code: 'PLAN_IN_USE' });
    }
  }

  private async assertCodeFree(code: string, id: string | null) {
    if ((await this.store.allCodes()).some((c) => c.id !== id && c.code === code)) {
      throw new ConflictError(`A plan with code ${code} already exists.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const plan = await this.get(id);
    if (plan.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this plan. Reload and try again.');
    return plan;
  }
}
