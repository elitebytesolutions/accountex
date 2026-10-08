import { z } from 'zod';
import { optId, optText, rowVersion } from './fields.ts';

/**
 * Phase 40: tenants (Platform.Tenants + TenantContacts, TenantModules, TenantNotes). A company is created only by
 * onboarding, which calls Platform.provisionTenant (tenant → system roles → default user holding every role) and then
 * sets the company up (status, contacts, modules, subscription, seed lists) in the same transaction.
 */
export const TENANT_STATUSES = ['PROVISIONING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'SUSPENDED', 'CHURNED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
/** Statuses whose users may sign in (READ_ONLY: sign-in allowed, writes refused). */
export const TENANT_SIGN_IN_STATUSES: readonly string[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'READ_ONLY'];
export const TENANT_MODULE_KEYS = ['ACC', 'SAL', 'PUR', 'INV', 'FA', 'PAY', 'ATT', 'REC', 'ESS', 'FBR', 'DIST', 'POS'] as const;
export const CHURN_REASONS = ['PRICE', 'COMPETITOR', 'BUSINESS_CLOSED', 'MISSING_FEATURE', 'POOR_ONBOARDING', 'OTHER'] as const;
export const CONTACT_ROLES = ['OWNER', 'BILLING', 'TECHNICAL', 'OTHER'] as const;
export const FISCAL_START_MONTHS = [7, 1, 4] as const;

/** The status lifecycle the Super Admin drives by hand (dunning moves PAST_DUE / READ_ONLY in Phase 41). */
export type TenantAction = 'suspend' | 'reactivate' | 'churn';
export function tenantActionError(status: string, action: TenantAction): string | null {
  switch (action) {
    case 'suspend': return ['TRIAL', 'ACTIVE', 'PAST_DUE', 'READ_ONLY'].includes(status) ? null : 'Only a live company can be suspended.';
    case 'reactivate': return ['SUSPENDED', 'READ_ONLY'].includes(status) ? null : 'Only a suspended or read-only company can be reactivated.';
    case 'churn': return status === 'CHURNED' ? 'This company has already churned.' : status === 'PROVISIONING' ? 'Finish provisioning first.' : null;
  }
}

/** One row of All Tenants (Platform.getAllTenants). */
export type TenantListItem = {
  id: string; code: string; displayName: string; legalName: string; city: string | null; province: string | null; industry: string | null;
  status: string; isInternal: boolean; healthScore: number | null; healthBucket: string | null; isAtRisk: boolean;
  subscriptionId: string | null; planId: string | null; planCode: string | null; planName: string | null; billingCycle: string | null;
  subscriptionStatus: string | null; mrr: number; seats: number | null; seatsInUse: number | null; modulesEnabled: number; moduleKeys: string[];
  renewalOn: string | null; trialEndsOn: string | null; pastDueAmount: number; ownerContactName: string | null; ownerContactEmail: string | null;
  lastActiveAt: string | null; createdAt: string;
};
export type TenantKpis = { live: number; trial: number; atRisk: number; pastDue: number; seats: number; seatsInUse: number; mrr: number };
export type TenantList = { items: TenantListItem[]; total: number; kpis: TenantKpis; regions: { province: string | null; count: number }[] };

export type TenantContact = {
  id: string; contactRole: string; fullName: string; designation: string | null; email: string; mobile: string | null; cnic: string | null;
  language: string; isPrimary: boolean; rowVersion: number;
};
export type TenantModule = { id: string; moduleKey: string; enabled: boolean; source: string; enabledAt: string };
export type TenantNote = { id: string; body: string; author: string | null; createdAt: string };
export type TenantUser = { id: string; fullName: string; email: string; status: string; roles: string[]; lastLoginAt: string | null; isDefault: boolean };

export type TenantDetail = {
  id: string; code: string; subdomain: string; displayName: string; legalName: string; ntn: string | null; strn: string | null; secpRegNo: string | null;
  industry: string | null; country: string; city: string | null; province: string | null; address: string | null; phone: string | null; email: string | null;
  fiscalYearStartMonth: number; baseCurrency: string; timezone: string; numberFormat: string; dateFormat: string; dataResidency: string;
  coaTemplateId: string | null; coaTemplateName: string | null; requireMfa: boolean; allowSso: boolean; defaultLanguage: string;
  status: string; healthScore: number | null; trialEndsOn: string | null; activatedAt: string | null; lastActiveAt: string | null;
  suspendedAt: string | null; suspensionReason: string | null; churnedAt: string | null; churnReason: string | null;
  isBeta: boolean; isInternal: boolean; salesTaxRegistered: boolean; createdAt: string; updatedAt: string; rowVersion: number;
  defaultUserId: string | null;
  contacts: TenantContact[]; modules: TenantModule[]; notes: TenantNote[]; users: TenantUser[];
};

// ---------------------------------------------------------------------------------------------------- onboarding
const CODE = /^[A-Za-z][A-Za-z0-9]{3,9}$/;
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')).pipe(z.string().max(160));
const password = z.string().min(10, 'At least 10 characters').max(72)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and numbers');

export const TenantOnboardSchema = z.object({
  // 1. Company & legal
  displayName: z.string().trim().min(2, 'Name the company').max(120),
  legalName: z.string().trim().min(2, 'Give the registered name').max(200),
  ntn: z.preprocess((v) => (v === '' ? null : v), z.string().trim().regex(/^\d{7}-?\d$/, 'NTN like 1234567-8').nullable().optional()),
  strn: optText(20),
  secpRegNo: optText(30),
  industry: optText(40),
  city: optText(60),
  province: optText(40),
  address: optText(300),
  phone: optText(30),
  email: z.preprocess((v) => (v === '' ? null : v), email.nullable().optional()),
  code: z.string().trim().toLowerCase().regex(CODE, '4–10 letters or digits, starting with a letter'),
  // 2. Plan & modules
  planId: z.uuid('Choose a plan'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  startTrial: z.boolean().default(true),
  modules: z.array(z.enum(TENANT_MODULE_KEYS)).max(TENANT_MODULE_KEYS.length).default([]),
  // 3. Admin user (the company's default user: every role, always active)
  adminName: z.string().trim().min(2, 'Name the admin').max(120),
  adminEmail: email,
  adminPassword: password,
  adminPasswordConfirm: z.string(),
  adminDesignation: optText(80),
  adminMobile: optText(30),
  adminCnic: z.preprocess((v) => (v === '' ? null : v), z.string().trim().regex(/^\d{5}-?\d{7}-?\d$/, 'CNIC like 35202-1234567-1').nullable().optional()),
  adminLanguage: z.enum(['EN', 'UR']).default('EN'),
  // 4. Configuration
  fiscalYearStartMonth: z.union([z.literal(7), z.literal(1), z.literal(4)]).default(7),
  timezone: z.string().trim().min(1).max(60).default('Asia/Karachi'),
  numberFormat: z.enum(['SOUTH_ASIAN', 'WESTERN']).default('SOUTH_ASIAN'),
  dateFormat: z.string().trim().min(1).max(20).default('DD MMM YYYY'),
  dataResidency: z.enum(['PK_LAHORE', 'AE_DUBAI']).default('PK_LAHORE'),
  defaultLanguage: z.enum(['EN', 'UR']).default('EN'),
  coaTemplateId: optId,
  seedTaxCodes: z.boolean().default(true),
  seedHrLists: z.boolean().default(true),
}).refine((t) => t.adminPassword === t.adminPasswordConfirm, { path: ['adminPasswordConfirm'], message: "Passwords don't match" });
export type TenantOnboard = z.infer<typeof TenantOnboardSchema>;

export type SeedReport = { seedVersion: string | null; leaveTypes: number; salaryComponents: number; taxCodes: number; skipped: { list: string; name: string; reason: string }[] };
export type TenantOnboardResult = { tenant: TenantDetail; seeds: SeedReport; steps: string[] };

// ---------------------------------------------------------------------------------------------------- edits
export const TenantUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().min(2).max(200).optional(),
  ntn: z.preprocess((v) => (v === '' ? null : v), z.string().trim().regex(/^\d{7}-?\d$/, 'NTN like 1234567-8').nullable().optional()),
  strn: optText(20),
  secpRegNo: optText(30),
  industry: optText(40),
  city: optText(60),
  province: optText(40),
  address: optText(300),
  phone: optText(30),
  email: z.preprocess((v) => (v === '' ? null : v), email.nullable().optional()),
  isBeta: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  requireMfa: z.boolean().optional(),
  rowVersion,
});
export type TenantUpdate = z.infer<typeof TenantUpdateSchema>;

export const TenantStatusInputSchema = z.object({
  rowVersion,
  reason: z.string().trim().min(3, 'Give the reason').max(300).optional(),
  churnReason: z.enum(CHURN_REASONS).optional(),
});
export type TenantStatusInput = z.infer<typeof TenantStatusInputSchema>;

export const TenantModulesInputSchema = z.object({
  rowVersion,
  modules: z.array(z.object({ moduleKey: z.enum(TENANT_MODULE_KEYS), enabled: z.boolean() })).max(TENANT_MODULE_KEYS.length),
});
export type TenantModulesInput = z.infer<typeof TenantModulesInputSchema>;

export const TenantContactInputSchema = z.object({
  contactRole: z.enum(CONTACT_ROLES).default('OTHER'),
  fullName: z.string().trim().min(2).max(120),
  designation: optText(80),
  email,
  mobile: optText(30),
  language: z.enum(['EN', 'UR']).default('EN'),
});
export type TenantContactInput = z.infer<typeof TenantContactInputSchema>;

export const TenantNoteInputSchema = z.object({ body: z.string().trim().min(2, 'Write the note').max(2000) });
export type TenantNoteInput = z.infer<typeof TenantNoteInputSchema>;

export const TenantListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().max(20).optional(),
  plan: z.string().trim().max(20).optional(),
  province: z.string().trim().max(40).optional(),
  city: z.string().trim().max(60).optional(),
  view: z.enum(['all', 'trial', 'risk', 'pastdue', 'suspended']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type TenantListQuery = z.infer<typeof TenantListQuerySchema>;
