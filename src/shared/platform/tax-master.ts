import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { issues, lookup, optNum, optText, rowVersion } from './fields.ts';

/**
 * Phase 37: the Pakistan tax master (Platform.TaxMasterAuthorities, TaxMasterSalesTaxRates, TaxMasterWithholdingRates,
 * TaxMasterSalarySlabs). Rates are effective-dated: "Change rate" schedules a new row and closes the current one the
 * day before (Platform.taxMaster*Schedule). Published rows are immutable; an unpublished scheduled row can still be
 * edited or cancelled. Tenants import published rates into their tax codes and payroll slabs.
 */
export const TAX_RATE_STATUSES = ['SCHEDULED', 'ACTIVE', 'SUPERSEDED'] as const;
export const TAX_TIMEOUTS = [10, 20, 30] as const;

/** The status rule at read time: before its start a row is SCHEDULED, after its end SUPERSEDED, otherwise ACTIVE. */
export function effectiveStatus(effectiveFrom: string, effectiveTo: string | null, today: string): (typeof TAX_RATE_STATUSES)[number] {
  if (effectiveFrom > today) return 'SCHEDULED';
  if (effectiveTo !== null && effectiveTo < today) return 'SUPERSEDED';
  return 'ACTIVE';
}
/** Tax year of the master (Pakistan: tax year 2027 = FY 1 Jul 2026 – 30 Jun 2027) ↔ payroll year "2026-27". */
export const payrollYearOf = (taxYear: number) => `${taxYear - 1}-${String(taxYear % 100).padStart(2, '0')}`;
export const masterTaxYearOf = (payrollYear: string) => Number(payrollYear.slice(0, 4)) + 1;

export type TaxAuthority = {
  id: string; code: string; name: string; jurisdiction: string; levyScope: string;
  sandboxEndpoint: string | null; productionEndpoint: string | null; activeEnvironment: string;
  /** The API token is write-only: only whether one is saved and its last 4 characters are returned. */
  hasToken: boolean; tokenLast4: string | null;
  platformPosId: string | null; timeoutSeconds: number; onFailure: string;
  lastTestAt: string | null; lastTestOk: boolean | null; lastTestMs: number | null;
  rowVersion: number;
};
type Dated = { effectiveFrom: string; effectiveTo: string | null; status: string; legalReference: string | null; masterVersion: string | null; publishedAt: string | null; rowVersion: number };
export type SalesTaxRate = Dated & {
  id: string; taxAuthorityId: string; authorityCode: string; jurisdiction: string; appliesTo: string; rate: number; reducedRatesNote: string | null;
};
export type WithholdingRate = Dated & {
  id: string; sectionCode: string; nature: string; atlRateCompany: number | null; atlRateOther: number | null;
  nonAtlRateCompany: number | null; nonAtlRateOther: number | null; rateNote: string | null;
  thresholdAmount: number | null; thresholdNote: string | null; usesSalarySlabs: boolean;
};
export type SalarySlab = {
  id: string; taxYear: number; slabNo: number; incomeFrom: number; incomeTo: number | null; fixedTax: number; ratePct: number;
  excessOver: number; legalReference: string | null; rowVersion: number;
};
export type SalarySlabYear = { taxYear: number; slabs: SalarySlab[]; /** Tenants imported this year's slabs (it can no longer be replaced). */ importedByTenants: number };
export type TaxMaster = {
  authorities: TaxAuthority[];
  salesTax: SalesTaxRate[];
  withholding: WithholdingRate[];
  slabYears: SalarySlabYear[];
  /** Rows not yet published to tenants. */
  unpublished: number;
  /** The last published master version (e.g. v2026.10), null before the first publish. */
  masterVersion: string | null;
};

const pct = (msg = '0 to 100') => z.coerce.number(msg).min(0, msg).max(100, msg);
const startDate = z.iso.date('Choose the effective date');
const legalReference = z.string().trim().min(3, 'Cite the Finance Act, SRO or section').max(200);

// ---------------------------------------------------------------- sales tax
const SalesTaxFields = {
  taxAuthorityId: z.uuid('Choose the authority'),
  appliesTo: z.string().trim().min(2, 'Describe what the rate applies to').max(160),
  rate: pct(),
  reducedRatesNote: optText(200),
  effectiveFrom: startDate,
  legalReference,
};
/** POST /api/admin/tax-master/sales-tax: schedule a new rate (supersedes the one in force on that date). */
export const SalesTaxScheduleSchema = z.object(SalesTaxFields);
export type SalesTaxSchedule = z.infer<typeof SalesTaxScheduleSchema>;
/** PATCH of an unpublished row (authority and "applies to" are its identity and stay). */
export const SalesTaxRateUpdateSchema = patchFields({ rate: SalesTaxFields.rate, reducedRatesNote: SalesTaxFields.reducedRatesNote, legalReference }).extend({ rowVersion });
export type SalesTaxRateUpdate = z.infer<typeof SalesTaxRateUpdateSchema>;

// ---------------------------------------------------------------- withholding
type WhtShape = { usesSalarySlabs?: boolean; atlRateCompany?: number | null; atlRateOther?: number | null };
/** Same rule as the taxMasterWhtRateChk check: an ATL rate unless the section uses the salary slabs. */
export function withholdingErrors(w: WhtShape): Record<string, string> {
  return !w.usesSalarySlabs && (w.atlRateCompany === null || w.atlRateCompany === undefined) && (w.atlRateOther === null || w.atlRateOther === undefined)
    ? { atlRateCompany: 'Enter an ATL rate (or use the salary slabs)' } : {};
}
const WithholdingFields = {
  sectionCode: z.string().trim().min(2, 'Enter the section, e.g. 153(1)(a)').max(40),
  nature: z.string().trim().min(2, 'Describe the payment').max(160),
  atlRateCompany: optNum(0, 100, '0 to 100'),
  atlRateOther: optNum(0, 100, '0 to 100'),
  nonAtlRateCompany: optNum(0, 100, '0 to 100'),
  nonAtlRateOther: optNum(0, 100, '0 to 100'),
  rateNote: optText(120),
  thresholdAmount: optNum(0, 100_000_000_000, 'Not negative'),
  thresholdNote: optText(120),
  usesSalarySlabs: z.boolean().default(false),
  effectiveFrom: startDate,
  legalReference,
};
export const WithholdingScheduleSchema = z.object(WithholdingFields).superRefine(issues(withholdingErrors));
export type WithholdingSchedule = z.infer<typeof WithholdingScheduleSchema>;
const WithholdingEditable = Object.fromEntries(Object.entries(WithholdingFields).filter(([k]) => k !== 'sectionCode' && k !== 'effectiveFrom')) as Omit<typeof WithholdingFields, 'sectionCode' | 'effectiveFrom'>;
export const WithholdingRateUpdateSchema = patchFields(WithholdingEditable).extend({ rowVersion });
export type WithholdingRateUpdate = z.infer<typeof WithholdingRateUpdateSchema>;

// ---------------------------------------------------------------- salary slabs (section 149)
export const SalarySlabInputSchema = z.object({
  incomeFrom: z.coerce.number('Not negative').min(0, 'Not negative'),
  incomeTo: optNum(0, 100_000_000_000, 'Not negative'),
  fixedTax: z.coerce.number('Not negative').min(0, 'Not negative').default(0),
  ratePct: pct(),
  /** Tax is fixedTax + ratePct % of the income above this amount; defaults to the slab start. */
  excessOver: optNum(0, 100_000_000_000, 'Not negative'),
});
export type SalarySlabInput = z.infer<typeof SalarySlabInputSchema>;
/** PUT /api/admin/tax-master/salary-slabs/:taxYear: the whole year (contiguous from 0, last slab open-ended). */
export const SalarySlabsSaveSchema = z.object({
  slabs: z.array(SalarySlabInputSchema).min(1, 'Add at least one slab').max(30),
  legalReference: optText(200),
});
export type SalarySlabsSave = z.infer<typeof SalarySlabsSaveSchema>;
export const TaxYearParamSchema = z.coerce.number().int().min(2000).max(2100);

// ---------------------------------------------------------------- authorities
export const TaxAuthorityUpdateSchema = z.object({
  rowVersion,
  sandboxEndpoint: z.url('Use an https:// URL').max(300).optional().nullable().or(z.literal('').transform(() => null)),
  productionEndpoint: z.url('Use an https:// URL').max(300).optional().nullable().or(z.literal('').transform(() => null)),
  /** Lookup ActiveEnvironment. */
  activeEnvironment: lookup().optional(),
  /** Write-only: a new token replaces the saved one; never returned. */
  apiToken: z.string().trim().min(8, 'At least 8 characters').max(500).optional(),
  clearToken: z.boolean().optional(),
  platformPosId: optText(40),
  timeoutSeconds: z.coerce.number().refine((n) => (TAX_TIMEOUTS as readonly number[]).includes(n), '10, 20 or 30 seconds').optional(),
  /** Lookup OnFailure. */
  onFailure: lookup().optional(),
});
export type TaxAuthorityUpdate = z.infer<typeof TaxAuthorityUpdateSchema>;
export type ConnectionTestResult = { ok: boolean; ms: number; httpStatus: number | null; message: string; endpoint: string; testedAt: string };

// ---------------------------------------------------------------- publish
export const TaxMasterPublishSchema = z.object({
  masterVersion: z.string().trim().regex(/^v\d{4}\.\d{1,2}[a-z]?$/, 'Like v2026.10').optional(),
});
export type TaxMasterPublish = z.infer<typeof TaxMasterPublishSchema>;
export type TaxMasterPublishResult = { masterVersion: string; published: number };

// ---------------------------------------------------------------- workspace import (Tax › Tax Codes, Payroll › Tax slabs)
export type TaxMasterImportResult = { created: string[]; ratesAdded: string[]; skipped: string[] };
export const TaxSlabImportSchema = z.object({ taxYear: z.string().regex(/^\d{4}-\d{2}$/, 'Like 2026-27') });
export type TaxSlabImport = z.infer<typeof TaxSlabImportSchema>;
