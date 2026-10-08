import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import type { AdminHistoryPage } from './history.ts';
import type { PermissionModule } from '../access/role.ts';
import { issues, lookup, optInt, optNum, optText, rowVersion } from './fields.ts';

/**
 * Phase 37: the master seed lists new companies start from (Platform.TemplateLeaveTypes, TemplateSalaryComponents,
 * TemplateTaxCodes; copied into a company by tenant onboarding, Phase 40) and the default grants of each system role
 * (Platform.SystemRoleGrants, read by Platform.provisionTenant). Each list row belongs to a `seedVersion` (e.g. v2026.2).
 */
const seedVersion = z.string().trim().min(1, 'Give the seed version, e.g. v2026.2').max(20);
const sortOrder = z.coerce.number().int().min(0).max(999).default(0);

// ---------------------------------------------------------------- leave types
export type SeedLeaveType = {
  id: string; seedVersion: string; name: string; daysPerYear: number; accrualPerMonth: number | null; carryForwardMax: number | null;
  isPaid: boolean; genderRestriction: string; onceInService: boolean; medicalCertAfterDays: number | null; ruleNote: string | null;
  sortOrder: number; rowVersion: number;
};
const LeaveTypeFields = {
  seedVersion,
  name: z.string().trim().min(2, 'Name the leave type').max(60),
  daysPerYear: z.coerce.number('Days per year').min(0, 'Not negative').max(365, 'Up to 365'),
  accrualPerMonth: optNum(0, 31, 'Not negative'),
  carryForwardMax: optNum(0, 365, 'Not negative'),
  isPaid: z.boolean().default(true),
  /** Lookup GenderRestriction. */
  genderRestriction: lookup('ANY'),
  onceInService: z.boolean().default(false),
  medicalCertAfterDays: optInt(1, 365, '1 to 365 days'),
  ruleNote: optText(200),
  sortOrder,
};
export const SeedLeaveTypeCreateSchema = z.object(LeaveTypeFields);
export type SeedLeaveTypeCreate = z.infer<typeof SeedLeaveTypeCreateSchema>;
export const SeedLeaveTypeUpdateSchema = patchFields(LeaveTypeFields).extend({ rowVersion });
export type SeedLeaveTypeUpdate = z.infer<typeof SeedLeaveTypeUpdateSchema>;

// ---------------------------------------------------------------- salary components
export type SeedSalaryComponent = {
  id: string; seedVersion: string; name: string; componentKind: string; calcMethod: string; pctOfBasic: number | null;
  isTaxable: boolean; statutoryCode: string | null; ruleNote: string | null; sortOrder: number; rowVersion: number;
};
type SalaryShape = { calcMethod?: string; pctOfBasic?: number | null };
/** Same rule as the seedSalaryComponentPctChk check: "% of basic" needs its percentage. */
export function seedSalaryErrors(s: SalaryShape): Record<string, string> {
  return s.calcMethod === 'PCT_OF_BASIC' && (s.pctOfBasic === null || s.pctOfBasic === undefined) ? { pctOfBasic: 'Enter the % of basic' } : {};
}
const SalaryFields = {
  seedVersion,
  name: z.string().trim().min(2, 'Name the component').max(60),
  /** Lookup TemplateSalaryComponentKind (EARNING / DEDUCTION). */
  componentKind: lookup(),
  /** Lookup TemplateSalaryComponentCalcMethod. */
  calcMethod: lookup('FIXED'),
  pctOfBasic: optNum(0, 100, '0 to 100'),
  isTaxable: z.boolean().default(true),
  /** Lookup StatutoryCode. */
  statutoryCode: optText(40),
  ruleNote: optText(200),
  sortOrder,
};
export const SeedSalaryComponentCreateSchema = z.object(SalaryFields).superRefine(issues(seedSalaryErrors));
export type SeedSalaryComponentCreate = z.infer<typeof SeedSalaryComponentCreateSchema>;
/** Cross-field rules are checked by the server on the merged record. */
export const SeedSalaryComponentUpdateSchema = patchFields(SalaryFields).extend({ rowVersion });
export type SeedSalaryComponentUpdate = z.infer<typeof SeedSalaryComponentUpdateSchema>;

// ---------------------------------------------------------------- tax codes
export type SeedTaxCode = {
  id: string; seedVersion: string; code: string; description: string; taxKind: string; rate: number | null; rateNote: string | null;
  whtSection: string | null; sortOrder: number; isActive: boolean; rowVersion: number;
};
type TaxShape = { taxKind?: string; rate?: number | null; rateNote?: string | null };
/** Same rule as the seedTaxCodeRateChk check: a rate (or a rate note such as "0.5–1%") unless exempt. */
export function seedTaxCodeErrors(t: TaxShape): Record<string, string> {
  return t.taxKind !== 'EXEMPT' && (t.rate === null || t.rate === undefined) && !t.rateNote ? { rate: 'Enter the rate or a rate note' } : {};
}
const TaxCodeFields = {
  seedVersion,
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]*([-/][A-Z0-9]+)*$/, 'Like GST-18 or WHT-153A').max(20),
  description: z.string().trim().min(2, 'Describe the tax code').max(200),
  /** Lookup TaxKind. */
  taxKind: lookup(),
  rate: optNum(0, 100, '0 to 100'),
  rateNote: optText(40),
  whtSection: optText(40),
  sortOrder,
  isActive: z.boolean().default(true),
};
export const SeedTaxCodeCreateSchema = z.object(TaxCodeFields).superRefine(issues(seedTaxCodeErrors));
export type SeedTaxCodeCreate = z.infer<typeof SeedTaxCodeCreateSchema>;
export const SeedTaxCodeUpdateSchema = patchFields(TaxCodeFields).extend({ rowVersion });
export type SeedTaxCodeUpdate = z.infer<typeof SeedTaxCodeUpdateSchema>;

export const SeedListKindSchema = z.enum(['leave-types', 'salary-components', 'tax-codes']);
export type SeedListKind = z.infer<typeof SeedListKindSchema>;

// ---------------------------------------------------------------- default role grants
/** One system role (lookup SystemKey) with its default permission codes. ADMIN always holds every permission. */
export type RoleGrantRole = {
  systemKey: string; label: string; isActive: boolean; locked: boolean; permissions: string[];
  /** Last change to this role's grants (platform log), null when never edited since the seed. */
  updatedAt: string | null;
};
export type RoleGrantMatrix = { catalogue: PermissionModule[]; roles: RoleGrantRole[] };
/** PUT /api/admin/seed/role-grants/:systemKey: the role's full permission set (affects companies created afterwards). */
export const RoleGrantsSaveSchema = z.object({ permissions: z.array(z.string().trim().min(1).max(80)).max(2000) });
export type RoleGrantsSave = z.infer<typeof RoleGrantsSaveSchema>;
export type RoleGrantHistory = AdminHistoryPage;
