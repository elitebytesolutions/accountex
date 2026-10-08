import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { issues, uniqueBy, money, optInt, optNum, optText, rowVersion } from './fields.ts';

/**
 * Phase 36: subscription plans (Platform.SubscriptionPlans) with their module features (SubscriptionPlanFeatures) and
 * usage limits (SubscriptionPlanLimits). A price change on a plan with subscriptions creates a new version
 * (<CODE>_V<n>) and retires the old one; an unused plan is edited in place.
 */
export const PLAN_STATUSES = ['ACTIVE', 'RETIRED'] as const;
export const PLAN_TRIAL_DAYS = [0, 14, 30] as const;
export const PLAN_INCLUSIONS = ['INCLUDED', 'ADDON', 'NOT_AVAILABLE'] as const;
/** The fields whose change versions a plan that has subscriptions. */
export const PLAN_PRICE_FIELDS = ['priceMonthly', 'priceAnnual', 'extraSeatPrice', 'isCustomPrice'] as const;

export type PlanFeature = { id: string; moduleKey: string; inclusion: string; addonPrice: number | null };
export type PlanLimit = { id: string; usageMeterId: string; limitValue: number | null; overagePrice: number | null };
export type SubscriptionPlan = {
  id: string; code: string; name: string; tagline: string | null;
  priceMonthly: number; priceAnnual: number | null; extraSeatPrice: number | null; isCustomPrice: boolean;
  userSeats: number | null; storageGb: number | null; trialDays: number; sortOrder: number; isPublic: boolean; status: string;
  supportChannel: string | null; supportResponseHours: number | null; slaUptimePct: number | null;
  features: PlanFeature[]; limits: PlanLimit[];
  /** Subscriptions on this plan that are live (trial, active, past due, suspended). */
  subscribers: number;
  /** Any subscription ever made on this plan (a price change then creates a new version). */
  hasSubscriptions: boolean;
  createdAt: string; updatedAt: string; rowVersion: number;
};
/** A usage meter a plan limit can be set on (Platform.UsageMeters, seeded in Phase 40). */
export type UsageMeterOption = { id: string; code: string; name: string; unit: string | null; icon: string | null };

/** An add-on feature needs its price (the DB checks the same: planFeatureAddonPriceChk). */
export function planFeatureErrors(f: { inclusion: string; addonPrice: number | null }): Record<string, string> {
  return f.inclusion === 'ADDON' && f.addonPrice === null ? { addonPrice: 'Price the add-on' } : {};
}

export const PlanFeatureInputSchema = z.object({
  moduleKey: z.string().trim().min(1).max(20),
  inclusion: z.enum(PLAN_INCLUSIONS),
  addonPrice: optNum(0, 100_000_000, 'Not negative'),
}).superRefine(issues(planFeatureErrors));
export type PlanFeatureInput = z.infer<typeof PlanFeatureInputSchema>;

export const PlanLimitInputSchema = z.object({
  usageMeterId: z.uuid(),
  /** Blank = unlimited. */
  limitValue: optNum(0, 1_000_000_000_000, 'Not negative'),
  overagePrice: optNum(0, 100_000_000, 'Not negative'),
});
export type PlanLimitInput = z.infer<typeof PlanLimitInputSchema>;

const PlanFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,19}$/, '2–20 capital letters, digits or _ (start with a letter)'),
  name: z.string().trim().min(2, 'Name the plan').max(80),
  tagline: optText(200),
  priceMonthly: money(),
  priceAnnual: optNum(0, 100_000_000_000, 'Not negative'),
  extraSeatPrice: optNum(0, 100_000_000, 'Not negative'),
  isCustomPrice: z.boolean().default(false),
  userSeats: optInt(1, 1_000_000, 'More than 0'),
  storageGb: optInt(1, 1_000_000, 'More than 0'),
  trialDays: z.coerce.number().int().refine((v) => (PLAN_TRIAL_DAYS as readonly number[]).includes(v), '0, 14 or 30 days').default(14),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isPublic: z.boolean().default(true),
  /** Lookup SupportChannel (validated by the DB). */
  supportChannel: optText(40),
  supportResponseHours: optInt(1, 720, 'More than 0'),
  slaUptimePct: optNum(90, 100, '90 to 100'),
};
export const PlanCreateSchema = z.object({ ...PlanFields, features: z.array(PlanFeatureInputSchema).max(50).optional() });
export type PlanCreate = z.infer<typeof PlanCreateSchema>;
export const PlanUpdateSchema = patchFields(PlanFields).extend({ rowVersion });
export type PlanUpdate = z.infer<typeof PlanUpdateSchema>;

export const PlanFeaturesInputSchema = z.object({ rowVersion, features: z.array(PlanFeatureInputSchema).max(50) })
  .superRefine(uniqueBy('features', (f: { moduleKey: string }) => f.moduleKey, 'Each module once'));
export type PlanFeaturesInput = z.infer<typeof PlanFeaturesInputSchema>;
export const PlanLimitsInputSchema = z.object({ rowVersion, limits: z.array(PlanLimitInputSchema).max(50) })
  .superRefine(uniqueBy('limits', (l: { usageMeterId: string }) => l.usageMeterId, 'Each meter once'));
export type PlanLimitsInput = z.infer<typeof PlanLimitsInputSchema>;
export const PlanStatusInputSchema = z.object({ rowVersion });
export type PlanStatusInput = z.infer<typeof PlanStatusInputSchema>;

/** PATCH result: the saved plan, or the new version when a price change on a plan with subscriptions versioned it. */
export type PlanSaveResult = { plan: SubscriptionPlan; versioned: boolean; retiredPlanId: string | null };
