import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { issues, uniqueBy, lookup, optId, optText, rowVersion } from './fields.ts';

/**
 * Phase 36: platform modules (Platform.PlatformModules) and their per-plan inclusion (PlatformModulePlans): the rows of
 * the Plan Entitlements matrix and of the "Modules by plan" table. Core modules always stay enabled.
 */
export const MODULE_KINDS = ['MODULE', 'FEATURE'] as const;

export type ModulePlan = { id: string; planId: string; isIncluded: boolean };
export type PlatformModule = {
  id: string; key: string; name: string; icon: string | null; kind: string; entGroup: string; moduleKey: string | null;
  featureFlagId: string | null; minPlanId: string | null; isCore: boolean; isEnabled: boolean; sortOrder: number;
  plans: ModulePlan[];
  /** Add-ons sold for this module. */
  addonCount: number;
  rowVersion: number;
};

export const ModulePlanInputSchema = z.object({ planId: z.uuid(), isIncluded: z.boolean() });
export type ModulePlanInput = z.infer<typeof ModulePlanInputSchema>;

type ModuleShape = { isCore?: boolean; isEnabled?: boolean };
/** A core module must stay enabled (the DB checks the same: platformModuleCoreOnChk). */
export function moduleErrors(m: ModuleShape): Record<string, string> {
  return m.isCore && m.isEnabled === false ? { isEnabled: 'Core modules are always on' } : {};
}

const ModuleFields = {
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_.]{2,59}$/, '3–60 lower-case letters, digits, _ or . (start with a letter)'),
  name: z.string().trim().min(2, 'Name the module').max(80),
  icon: optText(40),
  kind: z.enum(MODULE_KINDS).default('MODULE'),
  /** Lookup EntGroup: the matrix group. */
  entGroup: lookup('CORE_MODULES'),
  /** Lookup ModuleKey: the workspace module this gates (plan features use the same keys). */
  moduleKey: optText(20),
  /** Set by Phase 39 (feature flags). */
  featureFlagId: optId,
  minPlanId: optId,
  isCore: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(32000).default(0),
};
export const ModuleCreateSchema = z.object({ ...ModuleFields, plans: z.array(ModulePlanInputSchema).max(50).optional() }).superRefine(issues(moduleErrors));
export type ModuleCreate = z.infer<typeof ModuleCreateSchema>;
export const ModuleUpdateSchema = patchFields(ModuleFields).extend({ rowVersion });
export type ModuleUpdate = z.infer<typeof ModuleUpdateSchema>;
export const ModulePlansInputSchema = z.object({ rowVersion, plans: z.array(ModulePlanInputSchema).max(50) })
  .superRefine(uniqueBy('plans', (p: { planId: string }) => p.planId, 'Each plan once'));
export type ModulePlansInput = z.infer<typeof ModulePlansInputSchema>;
export const CatalogueStatusInputSchema = z.object({ rowVersion });
export type CatalogueStatusInput = z.infer<typeof CatalogueStatusInputSchema>;
