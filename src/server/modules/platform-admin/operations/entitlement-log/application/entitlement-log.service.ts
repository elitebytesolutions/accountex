import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AddonUpdateSchema, ModuleUpdateSchema,
  type AdminSession, type EntitlementSave, type EntitlementSaveResult,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ForbiddenError } from '../../../../../core/domain/errors.js';
import { AddonsService } from '../../../catalogue/addons/application/addons.service.js';
import { ModulesService } from '../../../catalogue/modules/application/modules.service.js';
import { PlansService } from '../../../catalogue/plans/application/plans.service.js';
import { featureTone, limitTone, priceTone } from '../domain/entitlement-impact.js';
import { EntitlementLogStore, type EntitlementLogRow } from './entitlement-log-store.js';

const stale = (what: string) => new ConcurrencyError(`Someone else changed ${what}. Reload and try again.`);

/**
 * Plan Entitlements save (Phase 36 page; Phase 43 log): the module plan cells / minimum plans, plan limits and add-on
 * prices change through the Phase 36 services, and each change gets an EntitlementChangeLogs row (from / to, tenants
 * affected, gain / loss) under one change set with the review drawer's switches, all in one transaction.
 */
@Injectable()
export class EntitlementLogService {
  constructor(
    private readonly store: EntitlementLogStore,
    private readonly plans: PlansService,
    private readonly modules: ModulesService,
    private readonly addons: AddonsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  changeSets() {
    return this.store.changeSets(100);
  }

  async save(admin: AdminSession, meta: RequestMeta, input: EntitlementSave): Promise<EntitlementSaveResult> {
    if (!admin.staffId) throw new ForbiddenError('Your admin account has no platform staff record yet. Sign in again.');
    const staffId = admin.staffId;
    return this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const rows: EntitlementLogRow[] = [];
      const subscribers = new Map<string, number>();
      const tenantsOn = async (planId: string) => {
        if (!subscribers.has(planId)) subscribers.set(planId, (await this.plans.get(planId)).subscribers);
        return subscribers.get(planId)!;
      };

      for (const m of input.modules) {
        const mod = await this.modules.get(m.moduleId);
        if (mod.rowVersion !== m.rowVersion) throw stale(mod.name);
        let rowVersion = m.rowVersion;
        if (m.minPlanId !== undefined && (m.minPlanId ?? null) !== mod.minPlanId) {
          rowVersion = (await this.modules.update(admin, meta, m.moduleId, ModuleUpdateSchema.parse({ minPlanId: m.minPlanId ?? '', rowVersion }))).rowVersion;
        }
        for (const p of m.plans) {
          const from = mod.plans.find((x) => x.planId === p.planId)?.isIncluded ?? false;
          if (from === p.isIncluded) continue;
          rows.push({
            changeKind: 'FEATURE', planId: p.planId, platformModuleId: m.moduleId, usageMeterId: null, addonId: null,
            fromValue: { included: from }, toValue: { included: p.isIncluded }, tenantsAffected: await tenantsOn(p.planId), impactTone: featureTone(from, p.isIncluded),
          });
        }
        await this.modules.setPlans(admin, meta, m.moduleId, { rowVersion, plans: m.plans });
      }

      for (const l of input.limits) {
        const plan = await this.plans.get(l.planId);
        if (plan.rowVersion !== l.rowVersion) throw stale(plan.name);
        const meters = new Set([...plan.limits.map((x) => x.usageMeterId), ...l.limits.map((x) => x.usageMeterId)]);
        for (const meterId of meters) {
          const from = plan.limits.find((x) => x.usageMeterId === meterId)?.limitValue ?? null;
          const to = l.limits.find((x) => x.usageMeterId === meterId)?.limitValue ?? null;
          if (from === to) continue;
          rows.push({
            changeKind: 'LIMIT', planId: l.planId, platformModuleId: null, usageMeterId: meterId, addonId: null,
            fromValue: { limit: from }, toValue: { limit: to }, tenantsAffected: plan.subscribers, impactTone: limitTone(from, to),
          });
        }
        await this.plans.setLimits(admin, meta, l.planId, { rowVersion: l.rowVersion, limits: l.limits });
      }

      for (const a of input.addons) {
        const addon = await this.addons.get(a.addonId);
        if (addon.rowVersion !== a.rowVersion) throw stale(addon.name);
        if (addon.price === a.price) continue;
        rows.push({
          changeKind: 'ADDON_PRICE', planId: null, platformModuleId: null, usageMeterId: null, addonId: a.addonId,
          fromValue: { price: addon.price }, toValue: { price: a.price }, tenantsAffected: addon.activeTenants, impactTone: priceTone(addon.price, a.price),
        });
        await this.addons.update(admin, meta, a.addonId, AddonUpdateSchema.parse({ price: a.price, rowVersion: a.rowVersion }));
      }

      if (!rows.length) return { changeSetId: null, changes: 0, tenantsAffected: 0 };
      const changeSetId = randomUUID();
      await this.store.write(changeSetId, staffId, { grandfatherUntilRenewal: input.grandfatherUntilRenewal, emailOwners: input.emailOwners, postChangelog: input.postChangelog }, rows);
      return { changeSetId, changes: rows.length, tenantsAffected: rows.reduce((t, r) => t + r.tenantsAffected, 0) };
    });
  }
}
