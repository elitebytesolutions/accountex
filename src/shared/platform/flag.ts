import { z } from 'zod';
import { issues, optDate, optText, rowVersion } from './fields.ts';

/**
 * Phase 39: feature flags (Platform.FeatureFlags + FlagEnvironments / FlagVariations / FlagRules / FlagTargets /
 * FlagPrerequisites / FlagDefaultRules), SDK keys (FlagSdkKeys) and the flag audit log (FlagAuditLogs).
 * Codes are the Lookups values (FlagType, FeatureFlagStage, FlagRuleAttribute, …).
 */
export const FLAG_ENVIRONMENTS = ['DEV', 'STAGING', 'PRODUCTION'] as const;
export type FlagEnvironment = (typeof FLAG_ENVIRONMENTS)[number];
export const FLAG_TYPES = ['RELEASE', 'KILL', 'OPS', 'EXPERIMENT', 'ENTITLEMENT'] as const;
export type FlagType = (typeof FLAG_TYPES)[number];
/** Lifecycle, in order. */
export const FLAG_STAGES = ['DEFINE', 'DEVELOP', 'PRODUCTION', 'CLEANUP', 'ARCHIVED'] as const;
export type FlagStage = (typeof FLAG_STAGES)[number];
export const FLAG_CATEGORIES = ['COMPLIANCE', 'SALES', 'INVENTORY', 'FINANCE', 'HRMS', 'COMMUNICATION', 'PLATFORM'] as const;
export const FLAG_RULE_ATTRIBUTES = ['SEGMENT', 'PLAN', 'REGION', 'CITY', 'INDUSTRY', 'AGE_DAYS', 'USER_ROLE', 'APP_VERSION', 'PLATFORM'] as const;
export type FlagRuleAttribute = (typeof FLAG_RULE_ATTRIBUTES)[number];
export const FLAG_RULE_OPERATORS = ['IN', 'NOT_IN', 'GT', 'LT'] as const;
export type FlagRuleOperator = (typeof FLAG_RULE_OPERATORS)[number];
/** Attributes compared as numbers / versions: the only ones that take GT / LT (DB flagRuleNumericOpChk). */
export const FLAG_NUMERIC_ATTRIBUTES: readonly string[] = ['AGE_DAYS', 'APP_VERSION'];
export const FLAG_SDK_KINDS = ['SERVER', 'CLIENT', 'MOBILE'] as const;
export const FLAG_BUCKET_BY = ['TENANT_CODE', 'TENANT_ID'] as const;
export const FLAG_VARIATION_KINDS = ['BOOLEAN', 'MULTIVARIATE'] as const;
/** The two fixed variations of a BOOLEAN flag. */
export const BOOLEAN_VARIATIONS = [{ name: 'On', value: 'true' }, { name: 'Off', value: 'false' }] as const;

const FLAG_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
export const flagKeyError = (k: string) =>
  !k ? 'Key is required'
  : !/^[a-z]/.test(k) ? 'Start with a lowercase letter'
  : /[^a-z0-9_]/.test(k) ? 'Use snake_case: a–z, 0–9 and _ only'
  : /__/.test(k) || /_$/.test(k) ? 'No double or trailing underscores'
  : k.length < 3 ? 'At least 3 characters'
  : k.length > 60 ? 'At most 60 characters'
  : '';

// ---------------------------------------------------------------------------------------------------- read models
export type FlagVariation = { idx: number; name: string; value: string };
export type FlagRule = { attribute: string; operator: string; ruleValues: string[]; serveVariationIdx: number };
export type FlagTarget = { tenantId: string; tenantCode: string; tenantName: string; variationIdx: number };
export type FlagPrerequisite = {
  prerequisiteFlagId: string | null; prerequisiteFlagKey: string | null; requiredVariationIdx: number | null;
  prerequisiteModuleId: string | null; prerequisiteModuleKey: string | null;
};
export type FlagDefaultRule = {
  defaultRule: 'ROLLOUT' | 'VARIATION'; defaultVariationIdx: number | null; rolloutPct: number | null;
  rolloutVariationIdx: number; rolloutRestVariationIdx: number; offVariationIdx: number; bucketBy: string;
};
/** One environment's targeting, in evaluation order: prerequisites, on/off, targets, rules, default rule. */
export type FlagEnvironmentState = {
  id: string; environment: FlagEnvironment; isOn: boolean; rowVersion: number; lastEvaluatedAt: string | null;
  prerequisites: FlagPrerequisite[]; targets: FlagTarget[]; rules: FlagRule[]; defaultRule: FlagDefaultRule | null;
};
export type FlagListItem = {
  id: string; key: string; name: string; description: string | null; flagType: string; secondaryType: string | null;
  category: string; stage: string; ownerStaffId: string; ownerName: string | null; tags: string[]; variationKind: string;
  isTemporary: boolean; expiresOn: string | null; staleReason: string | null; staleSince: string | null; archivedAt: string | null;
  createdAt: string; updatedAt: string; rowVersion: number; variations: FlagVariation[];
  /** Per environment: on / off, the rollout % when the default rule is a rollout, the prerequisite flag / module keys. */
  envs: Record<FlagEnvironment, { isOn: boolean; rolloutPct: number | null; defaultRule: string | null; rules: number; targets: number; prerequisites: string[] }>;
  lastEvaluatedAt: string | null;
};
export type FlagDetail = FlagListItem & { environments: FlagEnvironmentState[] };

export type FlagSummary = {
  totalFlags: number; temporaryFlags: number; permanentFlags: number; activeInProduction: number; staleFlags: number;
  pendingApprovals: number; killSwitches: number; expiredTemporaryFlags: number; evaluations7d: number;
};

export type FlagAuditEntry = {
  id: string; occurredAt: string; environment: string; eventKind: string; summary: string; staffName: string | null;
  beforeState: unknown; afterState: unknown; isEmergency: boolean;
};

/** Why a tenant got a variation (template evaluate(): prerequisite / off / target / rule n / rollout bucket / default). */
export const FLAG_REASONS = ['ARCHIVED', 'PREREQUISITE_FAILED', 'OFF', 'TARGET', 'RULE', 'ROLLOUT', 'DEFAULT'] as const;
export type FlagReason = {
  kind: (typeof FLAG_REASONS)[number];
  /** Human text, e.g. "Rule 2", "Rollout · bucket 37", "Prerequisite fbr_api_killswitch". */
  label: string;
  ruleNumber?: number;
  bucket?: number;
  prerequisite?: string;
};
export type FlagEvaluation = {
  flagId: string; flagKey: string; environment: FlagEnvironment;
  tenant: { id: string; code: string; name: string };
  variationIdx: number; variationName: string | null; variationValue: string | null; reason: FlagReason;
};
export type FlagServedRow = { tenantId: string; code: string; name: string; planCode: string | null; city: string | null; variationIdx: number; reason: FlagReason; bucket: number };
export type FlagServed = { environment: FlagEnvironment; total: number; rows: FlagServedRow[] };

/** Select values for the flag pages (wizard, rule builder, targets, prerequisites). */
export type FlagOptions = {
  plans: { id: string; code: string; name: string }[];
  segments: { key: string; name: string }[];
  tenants: { id: string; code: string; name: string; planCode: string | null; city: string | null }[];
  modules: { id: string; key: string; name: string }[];
  flags: { id: string; key: string; name: string; flagType: string; stage: string; variations: FlagVariation[] }[];
  staff: { id: string; name: string }[];
};

export type FlagSdkKey = {
  id: string; environment: FlagEnvironment; kind: string; keyPrefix: string; keyLast4: string; clientId: string | null;
  status: string; validUntil: string | null; rotatedFromId: string | null; createdAt: string; updatedAt: string; rowVersion: number;
};
/** A created / rotated key: `secret` is shown once and never stored (only its hash). Client IDs are not secret. */
export type FlagSdkKeyIssued = { key: FlagSdkKey; secret: string };

/** Workspace: the signed-in tenant's evaluated PRODUCTION flags (key → variation value). */
export type MyFlags = { environment: 'PRODUCTION'; flags: Record<string, { value: string; variationIdx: number; reason: string }> };

// ---------------------------------------------------------------------------------------------------- inputs
export const FlagVariationInputSchema = z.object({ name: z.string().trim().min(1, 'Name it').max(60), value: z.string().trim().min(1, 'Give a value').max(120) });

type VariationShape = { variationKind?: string; variations?: { name: string; value: string }[] };
/** BOOLEAN = exactly On/true and Off/false; MULTIVARIATE = 2–20 named variations with unique values. */
export function variationErrors(f: VariationShape): Record<string, string> {
  const v = f.variations;
  if (!v) return {};
  if (f.variationKind === 'BOOLEAN') {
    const ok = v.length === 2 && v[0]!.value === 'true' && v[1]!.value === 'false';
    return ok ? {} : { variations: 'A boolean flag has exactly two variations: On (true) and Off (false)' };
  }
  if (v.length < 2 || v.length > 20) return { variations: 'Two to twenty variations' };
  if (new Set(v.map((x) => x.value)).size !== v.length) return { variations: 'Variation values must be unique' };
  return {};
}

type FlagShape = VariationShape & { flagType?: string; secondaryType?: string | null; isTemporary?: boolean; expiresOn?: string | null };
export function flagErrors(f: FlagShape): Record<string, string> {
  const e: Record<string, string> = { ...variationErrors(f) };
  if (f.secondaryType && f.secondaryType === f.flagType) e.secondaryType = 'Pick a different secondary type';
  if (f.isTemporary && !f.expiresOn) e.expiresOn = 'Temporary flags need an expiry date';
  return e;
}

const tags = z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{0,29}$/, 'Tags: a–z, 0–9, - or _')).max(20, 'At most 20 tags');

export const FlagCreateSchema = z.object({
  key: z.string().trim().refine((k) => FLAG_KEY.test(k) && k.length >= 3 && k.length <= 60, { message: 'snake_case, 3–60 characters, starting with a letter' }),
  name: z.string().trim().min(2, 'Name the flag').max(120),
  description: optText(1000),
  flagType: z.enum(FLAG_TYPES),
  secondaryType: z.enum(FLAG_TYPES).optional().nullable().transform((v) => v ?? null),
  category: z.string().trim().min(1, 'Choose one').max(40),
  tags: tags.default([]),
  variationKind: z.enum(FLAG_VARIATION_KINDS).default('BOOLEAN'),
  variations: z.array(FlagVariationInputSchema).min(2).max(20),
  /** Defaults to the signed-in Super Admin (PlatformStaff mirror). */
  ownerStaffId: z.uuid().optional(),
  isTemporary: z.boolean().default(true),
  expiresOn: optDate,
}).superRefine(issues(flagErrors));
export type FlagCreate = z.infer<typeof FlagCreateSchema>;

export const FlagUpdateSchema = z.object({
  /** Never changeable: sending a different key is refused with FLAG_KEY_IMMUTABLE. */
  key: z.string().optional(),
  name: z.string().trim().min(2, 'Name the flag').max(120).optional(),
  description: optText(1000),
  secondaryType: z.enum(FLAG_TYPES).optional().nullable(),
  category: z.string().trim().min(1).max(40).optional(),
  tags: tags.optional(),
  ownerStaffId: z.uuid().optional(),
  isTemporary: z.boolean().optional(),
  expiresOn: optDate.optional(),
  staleReason: optText(500),
  /** Rename variations or add new ones at the end (indexes in use can't be removed). */
  variations: z.array(FlagVariationInputSchema).min(2).max(20).optional(),
  rowVersion,
});
export type FlagUpdate = z.infer<typeof FlagUpdateSchema>;

export const FlagStageInputSchema = z.object({ stage: z.enum(FLAG_STAGES), rowVersion });
export type FlagStageInput = z.infer<typeof FlagStageInputSchema>;
export const FlagVersionInputSchema = z.object({ rowVersion });
export type FlagVersionInput = z.infer<typeof FlagVersionInputSchema>;
export const FlagDuplicateSchema = z.object({ key: z.string().trim().optional(), name: z.string().trim().max(120).optional() });
export type FlagDuplicate = z.infer<typeof FlagDuplicateSchema>;

export const FlagEnvQuerySchema = z.object({ env: z.enum(FLAG_ENVIRONMENTS).default('PRODUCTION') });
export const FlagToggleInputSchema = z.object({ isOn: z.boolean(), confirmKey: z.string().trim().optional() });
export type FlagToggleInput = z.infer<typeof FlagToggleInputSchema>;

export const FlagRuleInputSchema = z.object({
  attribute: z.enum(FLAG_RULE_ATTRIBUTES),
  operator: z.enum(FLAG_RULE_OPERATORS),
  ruleValues: z.array(z.string().trim().min(1).max(120)).min(1, 'Add at least one value').max(200),
  serveVariationIdx: z.number().int().min(0).max(19),
}).superRefine(issues((r: { attribute: string; operator: string; ruleValues: string[] }) => {
  const e: Record<string, string> = {};
  const scalar = r.operator === 'GT' || r.operator === 'LT';
  if (scalar && !FLAG_NUMERIC_ATTRIBUTES.includes(r.attribute)) e.operator = 'Greater / less than only for tenant age and app version';
  if (scalar && r.ruleValues.length !== 1) e.ruleValues = 'One value for greater / less than';
  if (r.attribute === 'AGE_DAYS' && r.ruleValues.some((v) => !/^\d+$/.test(v))) e.ruleValues = 'Whole days';
  if (r.attribute === 'APP_VERSION' && r.ruleValues.some((v) => !/^\d+(\.\d+){0,3}$/.test(v))) e.ruleValues = 'Versions like 4.11.0';
  return e;
}));
export type FlagRuleInput = z.infer<typeof FlagRuleInputSchema>;

export const FlagTargetInputSchema = z.object({ tenantId: z.uuid(), variationIdx: z.number().int().min(0).max(19) });
export const FlagPrerequisiteInputSchema = z.union([
  z.object({ prerequisiteFlagId: z.uuid(), requiredVariationIdx: z.number().int().min(0).max(19) }),
  z.object({ prerequisiteModuleId: z.uuid() }),
]);
export type FlagPrerequisiteInput = z.infer<typeof FlagPrerequisiteInputSchema>;

export const FlagDefaultRuleInputSchema = z.object({
  defaultRule: z.enum(['ROLLOUT', 'VARIATION']),
  defaultVariationIdx: z.number().int().min(0).max(19).nullable().default(null),
  rolloutPct: z.number().int().min(0, '0 to 100').max(100, '0 to 100').nullable().default(null),
  rolloutVariationIdx: z.number().int().min(0).max(19).default(0),
  rolloutRestVariationIdx: z.number().int().min(0).max(19).default(1),
  offVariationIdx: z.number().int().min(0).max(19),
  bucketBy: z.enum(FLAG_BUCKET_BY).default('TENANT_CODE'),
}).superRefine(issues((d: { defaultRule: string; defaultVariationIdx: number | null; rolloutPct: number | null; rolloutVariationIdx: number; rolloutRestVariationIdx: number }) => {
  const e: Record<string, string> = {};
  if (d.defaultRule === 'ROLLOUT' && d.rolloutPct === null) e.rolloutPct = 'Set the rollout percentage';
  if (d.defaultRule === 'VARIATION' && d.defaultVariationIdx === null) e.defaultVariationIdx = 'Choose the variation to serve';
  if (d.rolloutVariationIdx === d.rolloutRestVariationIdx) e.rolloutRestVariationIdx = 'The rest must get a different variation';
  return e;
}));
export type FlagDefaultRuleInput = z.infer<typeof FlagDefaultRuleInputSchema>;

/** PUT /api/admin/flags/:id/environments/:env: the whole targeting of one environment. */
export const FlagEnvironmentInputSchema = z.object({
  /** FlagEnvironments.rowVersion as read (stale → 409). */
  envRowVersion: rowVersion,
  isOn: z.boolean().optional(),
  /** Required when a kill switch's on/off changes. */
  confirmKey: z.string().trim().optional(),
  targets: z.array(FlagTargetInputSchema).max(500),
  rules: z.array(FlagRuleInputSchema).max(50),
  defaultRule: FlagDefaultRuleInputSchema,
  prerequisites: z.array(FlagPrerequisiteInputSchema).max(20),
});
export type FlagEnvironmentInput = z.infer<typeof FlagEnvironmentInputSchema>;

export const FlagListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  /** Stage filter; omitted = every stage except ARCHIVED ("Live"). */
  stage: z.enum(FLAG_STAGES).optional(),
  category: z.string().trim().max(40).optional(),
  type: z.enum(FLAG_TYPES).optional(),
  owner: z.uuid().optional(),
  stale: z.enum(['true', 'false']).optional(),
});
export type FlagListQuery = z.infer<typeof FlagListQuerySchema>;

export const FlagEvaluateQuerySchema = z.object({
  /** Tenant id or tenant code. */
  tenant: z.string().trim().min(1).max(80),
  env: z.enum(FLAG_ENVIRONMENTS).default('PRODUCTION'),
});
export type FlagEvaluateQuery = z.infer<typeof FlagEvaluateQuerySchema>;

export const FlagSdkKeyCreateSchema = z.object({ environment: z.enum(FLAG_ENVIRONMENTS), kind: z.enum(FLAG_SDK_KINDS) });
export type FlagSdkKeyCreate = z.infer<typeof FlagSdkKeyCreateSchema>;
