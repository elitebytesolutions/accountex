import { z } from 'zod';
import { optDate, optText, rowVersion } from './fields.ts';

/**
 * Phase 38: platform security (Platform.PlatformSecuritySettings, the single row id = 1), the console IP allow-list
 * (PlatformAllowedIps), per-tenant API keys (PlatformApiKeys), webhooks (WebhookEndpoints / WebhookDeliveries) and
 * backups (BackupRuns). Enforced now on the Super Admin sign-in: IP allow-list, failed-sign-in lockout, password
 * policy. SSO and MFA are stored only; they switch on with Phase 29's MFA work.
 */
export const SSO_PROVIDERS = ['NONE', 'SAML', 'GOOGLE'] as const;
export const SAML_NAME_ID_FORMATS = ['EMAIL', 'PERSISTENT'] as const;
export const MFA_ENFORCEMENTS = ['OPTIONAL', 'ADMINS', 'EVERYONE'] as const;
export const LOCKOUT_ATTEMPTS = [3, 5, 10] as const;
export const LOCKOUT_MINUTES = [15, 30, 60] as const;
export const PW_ROTATION_DAYS = [90, 180] as const;

export type SecuritySettings = {
  ssoProvider: string;
  samlIdpSsoUrl: string | null;
  samlIdpEntityId: string | null;
  samlNameIdFormat: string;
  samlCertFilename: string | null;
  samlCertExpiresOn: string | null;
  samlAcsUrl: string | null;
  googleDomain: string | null;
  googleClientId: string | null;
  googleAllowedGroups: string | null;
  requireSso: boolean;
  breakGlassSuperAdmin: boolean;
  mfaEnforcement: string;
  mfaAllowWebauthn: boolean;
  mfaAllowTotp: boolean;
  mfaAllowSms: boolean;
  ipAllowlistEnforced: boolean;
  pwMinLength: number;
  pwRequireMixedCase: boolean;
  pwRequireNumber: boolean;
  pwRequireSymbol: boolean;
  pwBlockBreached: boolean;
  pwBlockReuse: boolean;
  pwRotationDays: number | null;
  lockoutAttempts: number;
  lockoutMinutes: number;
  updatedAt: string;
  rowVersion: number;
  /** The IP of the request that read the settings, and whether the active allow-list contains it. */
  callerIp: string | null;
  callerIpAllowed: boolean;
  /** The active range that matched the caller, if any. */
  callerMatch: string | null;
};

type SsoShape = { ssoProvider?: string; samlIdpSsoUrl?: string | null; samlIdpEntityId?: string | null; googleDomain?: string | null; googleClientId?: string | null };
/** The provider's required pair (DB checks securitySettingSamlChk / securitySettingGoogleChk). */
export function ssoErrors(s: SsoShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (s.ssoProvider === 'SAML') {
    if (!s.samlIdpSsoUrl) e.samlIdpSsoUrl = 'Required for SAML';
    if (!s.samlIdpEntityId) e.samlIdpEntityId = 'Required for SAML';
  }
  if (s.ssoProvider === 'GOOGLE') {
    if (!s.googleDomain) e.googleDomain = 'Required for Google Workspace';
    if (!s.googleClientId) e.googleClientId = 'Required for Google Workspace';
  }
  return e;
}

const httpsUrl = z.preprocess((v) => (v === '' ? null : v), z.url({ protocol: /^https$/, error: 'An https:// URL' }).max(500).nullable().optional());
export const SecuritySettingsUpdateSchema = z.object({
  ssoProvider: z.enum(SSO_PROVIDERS),
  samlIdpSsoUrl: httpsUrl,
  samlIdpEntityId: optText(300),
  samlNameIdFormat: z.enum(SAML_NAME_ID_FORMATS),
  samlCertFilename: optText(200),
  /** PEM text of the IdP certificate; omitted = keep the stored one. */
  samlCertPem: z.string().trim().max(20_000).regex(/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/, 'A PEM certificate').optional(),
  samlCertExpiresOn: optDate,
  samlAcsUrl: httpsUrl,
  googleDomain: z.preprocess((v) => (v === '' ? null : v), z.string().trim().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'A domain like example.com').max(120).nullable().optional()),
  googleClientId: optText(200),
  googleAllowedGroups: optText(300),
  requireSso: z.boolean(),
  breakGlassSuperAdmin: z.boolean(),
  mfaEnforcement: z.enum(MFA_ENFORCEMENTS),
  mfaAllowWebauthn: z.boolean(),
  mfaAllowTotp: z.boolean(),
  mfaAllowSms: z.boolean(),
  ipAllowlistEnforced: z.boolean(),
  pwMinLength: z.coerce.number().int().min(8, '8 to 24').max(24, '8 to 24'),
  pwRequireMixedCase: z.boolean(),
  pwRequireNumber: z.boolean(),
  pwRequireSymbol: z.boolean(),
  pwBlockBreached: z.boolean(),
  pwBlockReuse: z.boolean(),
  pwRotationDays: z.union([z.literal(90), z.literal(180)]).nullable(),
  lockoutAttempts: z.union([z.literal(3), z.literal(5), z.literal(10)]),
  lockoutMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  rowVersion,
}).superRefine((s, ctx) => {
  for (const [path, message] of Object.entries(ssoErrors(s))) ctx.addIssue({ code: 'custom', path: [path], message });
  if (!s.mfaAllowWebauthn && !s.mfaAllowTotp && !s.mfaAllowSms) ctx.addIssue({ code: 'custom', path: ['mfaAllowTotp'], message: 'Allow at least one method' });
});
export type SecuritySettingsUpdate = z.infer<typeof SecuritySettingsUpdateSchema>;

export type AllowedIp = { id: string; cidr: string; label: string; isActive: boolean; rowVersion: number };
export const AllowedIpCreateSchema = z.object({
  /** IPv4 CIDR (a bare address means /32). Host bits are cleared: 203.99.180.44/24 is stored as 203.99.180.0/24. */
  cidr: z.string().trim().min(7, 'Enter a CIDR range').max(18),
  label: optText(60),
});
export type AllowedIpCreate = z.infer<typeof AllowedIpCreateSchema>;

/* ---------------------------------------------------------------- API keys (per tenant) */
export const API_SCOPES = ['read:vouchers', 'write:vouchers', 'read:invoices', 'write:invoices', 'read:payroll', 'read:reports', 'webhooks:manage'] as const;
export const API_KEY_ENVIRONMENTS = ['LIVE', 'TEST'] as const;
export const API_KEY_EXPIRIES = ['NEVER', 'DAYS_90', 'YEAR_1'] as const;
/** How long the old key keeps working after a rotation. */
export const API_KEY_ROTATION_GRACE_HOURS = 24;

export type ApiKey = {
  id: string;
  tenantId: string;
  name: string;
  environment: string;
  /** fs_live_••••••••••••ab12 */
  masked: string;
  keyLast4: string;
  scopes: string[];
  allowedCidrs: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  status: string;
  previousValidUntil: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  rowVersion: number;
};
/** The full key is returned once, by create and rotate; only its sha-256 is stored. */
export type ApiKeyWithSecret = { key: ApiKey; secret: string };

export const ApiKeyCreateSchema = z.object({
  tenantId: z.uuid('Choose a tenant'),
  name: z.string().trim().min(2, 'Name the key').max(80),
  environment: z.enum(API_KEY_ENVIRONMENTS).default('LIVE'),
  scopes: z.array(z.enum(API_SCOPES)).min(1, 'Pick at least one scope').max(API_SCOPES.length).transform((a) => [...new Set(a)]),
  expiry: z.enum(API_KEY_EXPIRIES).default('NEVER'),
  /** Optional IPv4 CIDRs, comma separated in the form. */
  allowedCidrs: z.array(z.string().trim().min(7).max(18)).max(20).default([]),
});
export type ApiKeyCreate = z.infer<typeof ApiKeyCreateSchema>;
export const ApiKeyActionSchema = z.object({ rowVersion });
export type ApiKeyAction = z.infer<typeof ApiKeyActionSchema>;

/* ---------------------------------------------------------------- webhooks (per tenant) */
export const WEBHOOK_EVENTS = ['invoice.created', 'invoice.paid', 'payment.failed', 'voucher.posted', 'employee.created', 'payroll.posted', 'fbr.submitted', 'tenant.suspended'] as const;
/** Same rule as the DB check WebhookEndpoints_url_check. */
export const WEBHOOK_URL = /^https:\/\/[^\s/$.?#].[^\s]*$/;

export type WebhookEndpoint = {
  id: string;
  tenantId: string;
  url: string;
  isEnabled: boolean;
  events: string[];
  /** whsec_••••••••ab12 */
  secretMasked: string;
  pausedAt: string | null;
  /** Share of 2xx deliveries in the last 7 days (null when none). */
  successRate7d: number | null;
  deliveries7d: number;
  createdAt: string;
  rowVersion: number;
};
/** The signing secret is returned once, at creation; it is stored sealed (SecretBox). */
export type WebhookWithSecret = { endpoint: WebhookEndpoint; secret: string };

export const WebhookCreateSchema = z.object({
  tenantId: z.uuid('Choose a tenant'),
  url: z.string().trim().max(500).regex(WEBHOOK_URL, 'An https:// URL'),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Pick at least one event').transform((a) => [...new Set(a)]),
});
export type WebhookCreate = z.infer<typeof WebhookCreateSchema>;
export const WebhookUpdateSchema = z.object({
  url: z.string().trim().max(500).regex(WEBHOOK_URL, 'An https:// URL').optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Pick at least one event').transform((a) => [...new Set(a)]).optional(),
  isEnabled: z.boolean().optional(),
  rowVersion,
});
export type WebhookUpdate = z.infer<typeof WebhookUpdateSchema>;

export type WebhookDelivery = {
  id: string;
  webhookEndpointId: string;
  endpointUrl: string;
  eventId: string;
  eventType: string;
  requestPayload: unknown;
  responseCode: number | null;
  responseBody: string | null;
  latencyMs: number | null;
  attemptNo: number;
  status: string;
  replayOfId: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

/** Tenant picker of the API & Webhooks page. */
export type ConfigTenantOption = { id: string; code: string; name: string };

/* ---------------------------------------------------------------- backups */
export type BackupRun = {
  id: string;
  code: string;
  backupType: string;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  location: string;
  encryption: string;
  verification: string;
  status: string;
  failureMessage: string | null;
  requestedBy: string | null;
};
