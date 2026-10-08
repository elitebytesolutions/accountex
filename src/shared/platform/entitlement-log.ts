import { z } from 'zod';
import { money, optId, rowVersion } from './fields.ts';
import { ModulePlanInputSchema } from './module.ts';
import { PlanLimitInputSchema } from './plan.ts';

/**
 * Phase 43: the entitlement change log (Platform.EntitlementChangeLogs, append-only). Saving Plan Entitlements is one
 * change set: the module / plan-limit / add-on price writes and one log row per change with its impact (tenants
 * affected, gain / loss) and the review drawer's three switches, in one transaction.
 */
export const ENTITLEMENT_CHANGE_KINDS = ['FEATURE', 'LIMIT', 'ADDON_PRICE'] as const;

export const EntitlementSaveSchema = z.object({
  grandfatherUntilRenewal: z.boolean().default(false),
  emailOwners: z.boolean().default(true),
  postChangelog: z.boolean().default(false),
  modules: z.array(z.object({
    moduleId: z.uuid(),
    rowVersion,
    /** Present only when the minimum plan changes ('' / null = no minimum). */
    minPlanId: optId.optional(),
    plans: z.array(ModulePlanInputSchema).max(50),
  })).max(300).default([]),
  limits: z.array(z.object({ planId: z.uuid(), rowVersion, limits: z.array(PlanLimitInputSchema).max(50) })).max(50).default([]),
  addons: z.array(z.object({ addonId: z.uuid(), rowVersion, price: money() })).max(100).default([]),
});
export type EntitlementSave = z.infer<typeof EntitlementSaveSchema>;

export type EntitlementChangeRow = {
  id: string; changeKind: string; planId: string | null; planName: string | null; moduleName: string | null; meterName: string | null; addonName: string | null;
  fromValue: unknown; toValue: unknown; tenantsAffected: number; impactTone: string | null;
};
export type EntitlementChangeSet = {
  changeSetId: string; savedAt: string; savedBy: string | null; grandfatherUntilRenewal: boolean; emailOwners: boolean; postChangelog: boolean;
  tenantsAffected: number; rows: EntitlementChangeRow[];
};
export type EntitlementSaveResult = { changeSetId: string | null; changes: number; tenantsAffected: number };
