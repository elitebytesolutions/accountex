import { z } from 'zod';

/** Posting modules that can be closed per period (ModuleCode lookup). */
export const PERIOD_MODULES = ['GL', 'AR', 'AP', 'INV', 'PAY'] as const;
export type PeriodModule = (typeof PERIOD_MODULES)[number];

export const FiscalPeriodSchema = z.object({
  id: z.string(),
  periodNo: z.number().int(),
  code: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isAdjustment: z.boolean(),
  status: z.string(),
  /** Per-module state; modules without a row are OPEN. */
  modules: z.record(z.string(), z.string()),
  closedAt: z.string().nullable(),
  closedByName: z.string().nullable(),
  lockedAt: z.string().nullable(),
  /** Vouchers dated in the period (all / draft or pending); 0 until vouchers arrive (Phase 16). */
  voucherCount: z.number(),
  draftCount: z.number(),
  rowVersion: z.number().int(),
});
export type FiscalPeriod = z.infer<typeof FiscalPeriodSchema>;

export const FiscalYearSchema = z.object({
  id: z.string(),
  code: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.string(),
  isLocked: z.boolean(),
  hasAdjustmentPeriod: z.boolean(),
  closedAt: z.string().nullable(),
  netProfitTransferred: z.number().nullable(),
  auditorName: z.string().nullable(),
  periods: z.array(FiscalPeriodSchema),
  rowVersion: z.number().int(),
});
export type FiscalYear = z.infer<typeof FiscalYearSchema>;

/** POST /accounting/fiscal-years: the start defaults to the day after the latest year (or the current year). */
export const FiscalYearCreateSchema = z.object({
  startDate: z.iso.date().optional().nullable().transform((v) => v ?? null),
  hasAdjustmentPeriod: z.boolean().default(false),
});
export type FiscalYearCreate = z.infer<typeof FiscalYearCreateSchema>;

/** Close / lock / reopen a period; `modules` limits close and reopen to those modules (all when omitted). */
export const PeriodActionSchema = z.object({
  modules: z.array(z.enum(PERIOD_MODULES)).optional(),
  rowVersion: z.coerce.number().int().min(0),
});
export type PeriodAction = z.infer<typeof PeriodActionSchema>;
