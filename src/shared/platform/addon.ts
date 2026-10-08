import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { issues, uniqueBy, lookup, money, optId, optNum, optText, rowVersion } from './fields.ts';

/** Phase 36: add-ons sold on top of a plan (Platform.Addons) and their availability per plan (AddonPlans). */
export const ADDON_AVAILABILITY = ['AVAILABLE', 'INCLUDED', 'NOT_AVAILABLE'] as const;

export type AddonPlan = { id: string; planId: string; availability: string };
export type Addon = {
  id: string; code: string; name: string; icon: string | null; price: number; billingUnit: string;
  usagePrice: number | null; usageUnit: string | null; note: string | null; platformModuleId: string | null; isActive: boolean;
  plans: AddonPlan[];
  /** Tenants with this add-on running (TenantAddons, Phase 40). */
  activeTenants: number;
  rowVersion: number;
};

export const AddonPlanInputSchema = z.object({ planId: z.uuid(), availability: z.enum(ADDON_AVAILABILITY) });
export type AddonPlanInput = z.infer<typeof AddonPlanInputSchema>;

type AddonShape = { usagePrice?: number | null; usageUnit?: string | null };
/** A usage price needs its unit (the DB checks the same: addonUsageUnitChk). */
export function addonErrors(a: AddonShape): Record<string, string> {
  return a.usagePrice !== null && a.usagePrice !== undefined && !a.usageUnit ? { usageUnit: 'Name the usage unit, e.g. message' } : {};
}

const AddonFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, '2–40 capital letters, digits or _ (start with a letter)'),
  name: z.string().trim().min(2, 'Name the add-on').max(80),
  icon: optText(40),
  price: money(),
  /** Lookup BillingUnit. */
  billingUnit: lookup('MONTH'),
  usagePrice: optNum(0, 100_000_000, 'Not negative'),
  usageUnit: optText(40),
  note: optText(200),
  platformModuleId: optId,
  isActive: z.boolean().default(true),
};
export const AddonCreateSchema = z.object({ ...AddonFields, plans: z.array(AddonPlanInputSchema).max(50).optional() }).superRefine(issues(addonErrors));
export type AddonCreate = z.infer<typeof AddonCreateSchema>;
export const AddonUpdateSchema = patchFields(AddonFields).extend({ rowVersion });
export type AddonUpdate = z.infer<typeof AddonUpdateSchema>;
export const AddonPlansInputSchema = z.object({ rowVersion, plans: z.array(AddonPlanInputSchema).max(50) })
  .superRefine(uniqueBy('plans', (p: { planId: string }) => p.planId, 'Each plan once'));
export type AddonPlansInput = z.infer<typeof AddonPlansInputSchema>;
