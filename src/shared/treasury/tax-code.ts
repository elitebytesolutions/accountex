import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { GlRefSchema, optionalText } from './common.ts';

export const TaxCodeRateSchema = z.object({
  id: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  rate: z.number().nullable(),
  nonAtlRate: z.number().nullable(),
  financeAct: z.string().nullable(),
  remarks: z.string().nullable(),
});
export type TaxCodeRate = z.infer<typeof TaxCodeRateSchema>;

/** One tax code with its dated rates (Tax.TaxCodes + TaxCodeRates). */
export const TaxCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  description: z.string(),
  taxType: z.string(),
  appliesTo: z.string(),
  rateBasis: z.string(),
  salesTaxKind: z.string().nullable(),
  whtSection: z.string().nullable(),
  whtNature: z.string().nullable(),
  account: GlRefSchema.nullable(),
  inputAccount: GlRefSchema.nullable(),
  fbrReference: z.string().nullable(),
  calcOnExclSalesTax: z.boolean(),
  checkAtl: z.boolean(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  /** Rate in force today (null for slab / not-taxed codes or when no rate covers today). */
  currentRate: TaxCodeRateSchema.nullable(),
  rates: z.array(TaxCodeRateSchema),
  rowVersion: z.number().int(),
});
export type TaxCode = z.infer<typeof TaxCodeSchema>;

const pct = z.coerce.number().min(0, '0–100').max(100, '0–100');
export const TaxCodeRateSaveSchema = z
  .object({
    id: z.uuid().optional(),
    effectiveFrom: z.iso.date('Choose the start date'),
    effectiveTo: z.iso.date().optional().nullable().transform((v) => v ?? null),
    rate: pct.optional().nullable().transform((v) => v ?? null),
    nonAtlRate: pct.optional().nullable().transform((v) => v ?? null),
    financeAct: optionalText(80),
    remarks: optionalText(200),
  })
  .refine((r) => !r.effectiveTo || r.effectiveTo >= r.effectiveFrom, { path: ['effectiveTo'], message: 'End on or after the start' });
export type TaxCodeRateSave = z.infer<typeof TaxCodeRateSaveSchema>;

/** Same rules as the database checks on Tax.TaxCodes. */
const TaxCodeFields = {
  code: z.string().trim().toUpperCase().max(20).regex(/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/, 'Like GST-18 or WHT-153A'),
  description: z.string().trim().min(2, 'Describe the tax code').max(200),
  taxType: z.string().min(1),
  appliesTo: z.string().min(1),
  rateBasis: z.string().min(1).default('PERCENT'),
  salesTaxKind: z.string().optional().nullable().transform((v) => (v ? v : null)),
  whtSection: optionalText(40),
  whtNature: optionalText(120),
  accountId: z.uuid().optional().nullable().transform((v) => v ?? null),
  inputAccountId: z.uuid().optional().nullable().transform((v) => v ?? null),
  fbrReference: optionalText(120),
  calcOnExclSalesTax: z.boolean().default(true),
  checkAtl: z.boolean().default(false),
  rates: z.array(TaxCodeRateSaveSchema).default([]),
};

export type TaxShape = { taxType: string; rateBasis: string; salesTaxKind: string | null; whtSection: string | null; accountId: string | null; rates: { effectiveFrom: string; effectiveTo: string | null; rate: number | null }[] };

/** Rate periods may not overlap (an open end means "until further notice"). */
export function ratesOverlap(rates: { effectiveFrom: string; effectiveTo: string | null }[]): boolean {
  const sorted = [...rates].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  return sorted.some((r, i) => i > 0 && (sorted[i - 1]!.effectiveTo === null || sorted[i - 1]!.effectiveTo! >= r.effectiveFrom));
}

/** Cross-field rules of Tax.TaxCodes (same as its checks), as field errors. Used on create and on the merged record on update. */
export function taxCodeErrors(t: TaxShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (t.taxType === 'SALES_TAX' && !t.salesTaxKind) e.salesTaxKind = 'Choose the sales tax kind';
  if (t.taxType !== 'SALES_TAX' && !t.whtSection) e.whtSection = 'Enter the section, e.g. 153(1)(a)';
  if (t.rateBasis === 'NONE' && t.salesTaxKind !== 'EXEMPT') e.rateBasis = '"Not taxed" is only for exempt sales tax';
  if (t.rateBasis !== 'NONE' && !t.accountId) e.accountId = 'Choose the tax account';
  if (t.rateBasis === 'PERCENT' && t.rates.some((r) => r.rate === null)) e.rates = 'Enter the rate for each period';
  return e;
}
const withTaxRules = <T extends z.ZodType<TaxShape>>(s: T) =>
  s.superRefine((t, ctx) => {
    for (const [path, message] of Object.entries(taxCodeErrors(t))) ctx.addIssue({ code: 'custom', path: [path], message });
  });

export const TaxCodeCreateSchema = withTaxRules(z.object(TaxCodeFields));
export type TaxCodeCreate = z.infer<typeof TaxCodeCreateSchema>;
export type TaxCodeCreateFields = z.input<typeof TaxCodeCreateSchema>;
/** Cross-field rules are checked by the server on the merged record. */
export const TaxCodeUpdateSchema = patchFields(TaxCodeFields).extend(RowVersionSchema.shape);
export type TaxCodeUpdate = z.infer<typeof TaxCodeUpdateSchema>;
