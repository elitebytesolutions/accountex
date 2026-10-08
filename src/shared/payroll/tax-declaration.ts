import { z } from 'zod';
import type { EmpRef } from '../hr/attendance.ts';
import { optionalText } from '../treasury/common.ts';
import { taxOn } from './setup.ts';

/**
 * Phase 32: tax declarations that reduce salary withholding u/s 149 — Zakat (s.60, deductible allowance), donations
 * (s.61), health insurance (s.62A) and VPS pension (s.63) (tax credits at the average rate). A declaration needs a
 * proof file before payroll reviews it; only approved declarations reduce the tax deducted.
 */
type UserRef = { id: string; name: string };
type Slab = { incomeFrom: number; incomeTo: number | null; fixedTax: number; ratePercent: number };

export const DECLARATION_TYPES = {
  ZAKAT: { label: 'Zakat', section: '60', reliefKind: 'DEDUCTIBLE_ALLOWANCE', how: 'Reduces taxable income' },
  VPS_PENSION: { label: 'Pension fund (VPS)', section: '63', reliefKind: 'TAX_CREDIT', how: 'Credit at average rate, max 20% of income' },
  DONATION: { label: 'Donations', section: '61', reliefKind: 'TAX_CREDIT', how: 'Credit at average rate, max 30% of income' },
  HEALTH_INSURANCE: { label: 'Health insurance', section: '62A', reliefKind: 'TAX_CREDIT', how: 'Credit at average rate, premium up to Rs 150,000' },
} as const;
export type DeclarationType = keyof typeof DECLARATION_TYPES;

/** Allowed proof files (the upload service enforces the same list and size). */
export const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export type TaxDeclaration = {
  id: string; employee: EmpRef; taxYear: string; declarationType: string; itoSection: string; reliefKind: string; amount: number; paidTo: string | null;
  proof: { id: string; fileName: string; sizeBytes: number; contentType: string } | null; estimatedTaxSaving: number | null; status: string;
  submittedAt: string | null; verifiedBy: UserRef | null; verifiedAt: string | null; rejectionReason: string | null; effectiveFromMonth: string | null;
  createdAt: string; rowVersion: number;
};

/** The annual tax under the slabs after Zakat, less the credits (at the average rate, capped as the Ordinance does). */
export type PayrollTaxComputation = {
  taxableIncome: number; slabTax: number; averageRate: number; credits: { VPS_PENSION: number; DONATION: number; HEALTH_INSURANCE: number };
  zakat: number; liability: number; slab: Slab | null;
};
export function payrollAnnualTax(projected: number, slabs: Slab[], d: { ZAKAT?: number; VPS_PENSION?: number; DONATION?: number; HEALTH_INSURANCE?: number }): PayrollTaxComputation {
  const zakat = Math.min(Math.max(0, d.ZAKAT ?? 0), Math.max(0, projected));
  const taxable = Math.max(0, Math.round(projected - zakat));
  const slabTax = taxOn(taxable, slabs);
  const avg = taxable ? slabTax / taxable : 0;
  const credits = {
    VPS_PENSION: Math.round(avg * Math.min(d.VPS_PENSION ?? 0, taxable * 0.2)),
    DONATION: Math.round(avg * Math.min(d.DONATION ?? 0, taxable * 0.3)),
    HEALTH_INSURANCE: Math.round(avg * Math.min(d.HEALTH_INSURANCE ?? 0, 150_000)),
  };
  const liability = Math.max(0, slabTax - credits.VPS_PENSION - credits.DONATION - credits.HEALTH_INSURANCE);
  const slab = slabs.find((x) => taxable >= x.incomeFrom && (x.incomeTo === null || taxable < x.incomeTo)) ?? null;
  return { taxableIncome: taxable, slabTax, averageRate: avg, credits, zakat, liability, slab };
}

/** Pakistan's tax year runs July to June: 2026-10-01 → "2026-27"; months left including this one (July = 12, June = 1). */
export function payrollTaxYearOf(iso: string) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const s = m >= 7 ? y : y - 1;
  return { taxYear: `${s}-${String((s + 1) % 100).padStart(2, '0')}`, start: `${s}-07-01`, end: `${s + 1}-06-30`, monthsLeft: m >= 7 ? 19 - m : 7 - m };
}

/** My Profile › Tax: the projection for the current tax year and the employee's declarations. */
export type TaxProjection = {
  taxYear: string; monthsLeft: number; monthlyTaxable: number; ytdTaxable: number; ytdTax: number; projectedTaxable: number; exemptAnnual: number;
  slabs: Slab[]; withoutDeclarations: PayrollTaxComputation; withApproved: PayrollTaxComputation; withDeclared: PayrollTaxComputation;
  monthlyTax: number; monthlyTaxIfApproved: number; hasSalary: boolean;
};
export type MyTaxView = { projection: TaxProjection | null; declarations: TaxDeclaration[]; employee: EmpRef };
export type TaxDeclarationList = { items: TaxDeclaration[]; total: number; counts: Record<string, number> };

export const TaxDeclarationInputSchema = z.object({
  declarationType: z.enum(['ZAKAT', 'VPS_PENSION', 'DONATION', 'HEALTH_INSURANCE']),
  amount: z.coerce.number('0 or more').min(1, 'More than 0').max(100_000_000),
  paidTo: optionalText(160),
  taxYear: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
export type TaxDeclarationInput = z.infer<typeof TaxDeclarationInputSchema>;
export const TaxDeclarationRejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });
