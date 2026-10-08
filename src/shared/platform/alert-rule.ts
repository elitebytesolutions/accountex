import { z } from 'zod';
import { issues, optId, optText, rowVersion } from './fields.ts';

/**
 * Phase 39: usage alert rules (Platform.UsageAlertRules, Usage & Quotas) and audit alert rules
 * (Platform.AuditAlertRules, Platform Audit Log). Rules are stored only: usage evaluation comes with metering
 * (Phase 40), audit alert sending with email delivery (Phase 29).
 */
export const USAGE_ALERT_ACTIONS = ['NOTIFY_ACCOUNT_MANAGER', 'EMAIL_OWNER', 'THROTTLE', 'BLOCK', 'OFFER_ADDON'] as const;
export const AUDIT_ALERT_CHANNELS = ['EMAIL', 'SLACK'] as const;
export const AUDIT_RESULT_FILTERS = ['SUCCESS', 'FAILED', 'BLOCKED', 'RECORDED'] as const;

export type UsageAlertRule = {
  id: string; usageMeterId: string | null; usageMeterName: string | null; thresholdPct: number; planId: string | null; planName: string | null;
  action: string; actionDetail: string | null; throttleRps: number | null; offerAddonId: string | null; offerAddonName: string | null;
  isEnabled: boolean; evalIntervalMinutes: number; lastEvaluatedAt: string | null; updatedAt: string; rowVersion: number;
};
export type UsageAlertRuleOptions = {
  meters: { id: string; name: string }[];
  plans: { id: string; code: string; name: string }[];
  addons: { id: string; name: string }[];
};

type UsageShape = { action?: string; throttleRps?: number | null; offerAddonId?: string | null };
/** THROTTLE needs a request rate, OFFER_ADDON an add-on (the DB checks the same: usageRuleThrottleChk / usageRuleOfferChk). */
export function usageAlertRuleErrors(r: UsageShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (r.action === 'THROTTLE' && !r.throttleRps) e.throttleRps = 'Set the request rate to throttle to';
  if (r.action === 'OFFER_ADDON' && !r.offerAddonId) e.offerAddonId = 'Choose the add-on to offer';
  return e;
}

const UsageFields = {
  usageMeterId: optId,
  thresholdPct: z.coerce.number('50 to 150').int().min(50, '50 to 150').max(150, '50 to 150'),
  planId: optId,
  action: z.enum(USAGE_ALERT_ACTIONS),
  actionDetail: optText(300),
  throttleRps: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number('Requests per second').int().min(1, 'At least 1').max(100000).nullable()),
  offerAddonId: optId,
  isEnabled: z.boolean().default(true),
  evalIntervalMinutes: z.coerce.number().int().min(1).max(1440).default(15),
};
export const UsageAlertRuleCreateSchema = z.object(UsageFields).superRefine(issues(usageAlertRuleErrors));
export type UsageAlertRuleCreate = z.infer<typeof UsageAlertRuleCreateSchema>;
/** PATCH sends the whole rule (the action-detail rules depend on several fields). */
export const UsageAlertRuleUpdateSchema = z.object({ ...UsageFields, rowVersion }).superRefine(issues(usageAlertRuleErrors));
export type UsageAlertRuleUpdate = z.infer<typeof UsageAlertRuleUpdateSchema>;

export type AuditAlertRule = {
  id: string; name: string; actionPattern: string; resultFilter: string | null; thresholdCount: number; windowMinutes: number | null;
  channels: string[]; recipients: string; isActive: boolean; updatedAt: string; rowVersion: number;
};

type AuditShape = { thresholdCount?: number; windowMinutes?: number | null };
export function auditAlertRuleErrors(r: AuditShape): Record<string, string> {
  return (r.thresholdCount ?? 1) > 1 && !r.windowMinutes ? { windowMinutes: 'Set the time window for a count above 1' } : {};
}

const AuditFields = {
  name: z.string().trim().min(2, 'Name the rule').max(120),
  /** Platform audit action, `*` as a wildcard: "auth.login", "impersonation.*", "FeatureFlags.*". */
  actionPattern: z.string().trim().min(1, 'Which action?').max(120).regex(/^[A-Za-z0-9_.*:-]+$/, 'Letters, digits, . _ - : and * only'),
  resultFilter: z.enum(AUDIT_RESULT_FILTERS).optional().nullable().transform((v) => v ?? null),
  thresholdCount: z.coerce.number('At least 1').int().min(1, 'At least 1').max(10000).default(1),
  windowMinutes: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number('Minutes').int().min(1, 'At least 1 minute').max(43200).nullable()),
  channels: z.array(z.enum(AUDIT_ALERT_CHANNELS)).min(1, 'Pick email, Slack or both').max(2),
  recipients: z.string().trim().min(2, 'Who gets the alert?').max(300),
  isActive: z.boolean().default(true),
};
export const AuditAlertRuleCreateSchema = z.object(AuditFields).superRefine(issues(auditAlertRuleErrors));
export type AuditAlertRuleCreate = z.infer<typeof AuditAlertRuleCreateSchema>;
export const AuditAlertRuleUpdateSchema = z.object({ ...AuditFields, rowVersion }).superRefine(issues(auditAlertRuleErrors));
export type AuditAlertRuleUpdate = z.infer<typeof AuditAlertRuleUpdateSchema>;

export const AlertRuleVersionSchema = z.object({ rowVersion });
export type AlertRuleVersion = z.infer<typeof AlertRuleVersionSchema>;

/** The platform audit log (read-only history, Platform.PlatformAuditLogs). */
export type PlatformAuditLogRow = {
  id: string; occurredAt: string; actorLabel: string; actorDetail: string | null; action: string; tenantCode: string | null;
  details: string | null; ipAddress: string | null; result: string;
};
export const PlatformAuditLogQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  result: z.enum(AUDIT_RESULT_FILTERS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PlatformAuditLogQuery = z.infer<typeof PlatformAuditLogQuerySchema>;
