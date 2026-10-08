import { z } from 'zod';
import { optText, rowVersion } from './fields.ts';

/**
 * Phase 38: tenant segments (Platform.TenantSegments) with membership rules (TenantSegmentRules) and manual
 * include / exclude overrides (SegmentTenants). Membership = not excluded AND (included OR every rule matches); the
 * matcher lives in src/server/modules/platform-admin/config/segments/domain/segment-matcher.ts.
 *
 * Rule values: PLAN = plan codes, REGION = Province codes, INDUSTRY = TenantIndustry codes, CITY = city names
 * (case-insensitive), PLATFORM = WEB / ANDROID / IOS / DESKTOP, SALES_TAX_REGISTERED / BETA / INTERNAL = 'true' | 'false',
 * AGE_DAYS = whole days, APP_VERSION = x.y.z.
 */
export const SEGMENT_ATTRIBUTES = ['PLAN', 'REGION', 'CITY', 'INDUSTRY', 'AGE_DAYS', 'SALES_TAX_REGISTERED', 'BETA', 'INTERNAL', 'APP_VERSION', 'PLATFORM'] as const;
export type SegmentAttribute = (typeof SEGMENT_ATTRIBUTES)[number];
export const SEGMENT_OPERATORS = ['IN', 'NOT_IN', 'GT', 'LT'] as const;
export type SegmentOperator = (typeof SEGMENT_OPERATORS)[number];
/** Attributes compared as numbers (GT / LT allowed, one value). */
export const NUMERIC_SEGMENT_ATTRIBUTES: readonly SegmentAttribute[] = ['AGE_DAYS', 'APP_VERSION'];
export const BOOLEAN_SEGMENT_ATTRIBUTES: readonly SegmentAttribute[] = ['SALES_TAX_REGISTERED', 'BETA', 'INTERNAL'];
export const SEGMENT_TONES = ['GREEN', 'BLUE', 'VIOLET', 'ORANGE', 'LIME', 'RED'] as const;
export const SEGMENT_MEMBERSHIPS = ['INCLUDE', 'EXCLUDE'] as const;
export const TENANT_PLATFORMS = ['WEB', 'ANDROID', 'IOS', 'DESKTOP'] as const;

/** "Karachi distributors" → "segment.karachi_distributors" (template snake()). */
export function segmentKeyFor(name: string): string {
  const snake = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '');
  return `segment.${snake || 'segment'}`.slice(0, 80);
}

const VERSION = /^\d+\.\d+\.\d+$/;
type RuleShape = { attribute?: string; operator?: string; values?: string[] };
/** Operator / value issues of one rule ({ field: message }); the DB checks the same (segmentRule*Chk). */
export function segmentRuleErrors(r: RuleShape): Record<string, string> {
  const e: Record<string, string> = {};
  const numeric = NUMERIC_SEGMENT_ATTRIBUTES.includes(r.attribute as SegmentAttribute);
  if ((r.operator === 'GT' || r.operator === 'LT') && !numeric) e.operator = 'Greater / less than only work with tenant age and app version';
  if ((r.operator === 'GT' || r.operator === 'LT') && (r.values?.length ?? 0) !== 1) e.values = 'Enter one value';
  if (r.attribute === 'AGE_DAYS' && r.values?.some((v) => !/^\d{1,5}$/.test(v))) e.values = 'Whole days, e.g. 30';
  if (r.attribute === 'APP_VERSION' && r.values?.some((v) => !VERSION.test(v))) e.values = 'Versions like 4.11.0';
  if (BOOLEAN_SEGMENT_ATTRIBUTES.includes(r.attribute as SegmentAttribute) && r.values?.some((v) => v !== 'true' && v !== 'false')) e.values = 'Yes or No';
  return e;
}

export const SegmentRuleSchema = z.object({
  attribute: z.enum(SEGMENT_ATTRIBUTES),
  operator: z.enum(SEGMENT_OPERATORS),
  values: z.array(z.string().trim().min(1).max(60)).min(1, 'Add at least one value').max(50).transform((a) => [...new Set(a)]),
}).superRefine((r, ctx) => {
  for (const [path, message] of Object.entries(segmentRuleErrors(r))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type SegmentRule = z.infer<typeof SegmentRuleSchema>;

export const SegmentOverrideSchema = z.object({ tenantId: z.uuid(), membership: z.enum(SEGMENT_MEMBERSHIPS) });
export type SegmentOverride = z.infer<typeof SegmentOverrideSchema>;

const overridesList = z.array(SegmentOverrideSchema).max(500).superRefine((a, ctx) => {
  if (new Set(a.map((o) => o.tenantId)).size !== a.length) ctx.addIssue({ code: 'custom', message: 'Each tenant once' });
});

export type Segment = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  tone: string;
  rules: SegmentRule[];
  overrides: (SegmentOverride & { tenantName: string; tenantCode: string })[];
  /** Tenants in the segment now. */
  memberCount: number;
  /** Feature flags whose rules target this segment's key (Phase 39). */
  flagsUsing: { key: string; name: string }[];
  /** Tenant broadcasts sent to it (Phase 42). */
  broadcastsUsing: number;
  updatedAt: string;
  rowVersion: number;
};

const SegmentFields = {
  name: z.string().trim().min(2, 'Name the segment').max(40),
  description: optText(300),
  icon: optText(40),
  tone: z.enum(SEGMENT_TONES).default('GREEN'),
};
export const SegmentCreateSchema = z.object({ ...SegmentFields, rules: z.array(SegmentRuleSchema).max(20).default([]) });
export type SegmentCreate = z.infer<typeof SegmentCreateSchema>;
/** Name and look only; the key is fixed at creation (flags link to it). */
export const SegmentUpdateSchema = z.object({
  name: SegmentFields.name.optional(), description: SegmentFields.description, icon: SegmentFields.icon, tone: z.enum(SEGMENT_TONES).optional(), rowVersion,
});
export type SegmentUpdate = z.infer<typeof SegmentUpdateSchema>;
export const SegmentRulesInputSchema = z.object({ rules: z.array(SegmentRuleSchema).max(20, 'At most 20 rules'), rowVersion });
export type SegmentRulesInput = z.infer<typeof SegmentRulesInputSchema>;
export const SegmentOverridesInputSchema = z.object({ overrides: overridesList, rowVersion });
export type SegmentOverridesInput = z.infer<typeof SegmentOverridesInputSchema>;
/** Unsaved rules (and overrides) evaluated live while editing. */
export const SegmentPreviewSchema = z.object({ rules: z.array(SegmentRuleSchema).max(20), overrides: overridesList.default([]) });
export type SegmentPreview = z.infer<typeof SegmentPreviewSchema>;

export type SegmentMemberRow = { id: string; code: string; name: string; city: string | null; industry: string | null; plan: string | null; matchedBy: 'INCLUDE' | 'RULES' };
export type SegmentEvaluation = {
  /** All tenants on the platform. */
  total: number;
  count: number;
  byPlan: { plan: string | null; label: string; count: number }[];
  tenants: SegmentMemberRow[];
  /** Per rule: how many tenants match that rule alone (template rule counter). */
  ruleCounts: number[];
};

/** Values the rule builder offers, from the live platform data. */
export type SegmentOptions = {
  plans: { code: string; name: string }[];
  regions: { code: string; label: string }[];
  industries: { code: string; label: string }[];
  cities: string[];
  platforms: { code: string; label: string }[];
  tenants: { id: string; code: string; name: string }[];
};
