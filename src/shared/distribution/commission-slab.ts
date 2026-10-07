import { z } from 'zod';

/** A commission band (Distribution.CommissionSlabs): achievement from–to % of target pays ratePct % of achieved sales. */
export const CommissionSlabSchema = z.object({
  id: z.string(),
  label: z.string(),
  fromPct: z.number(),
  /** null = open-ended (the top band). */
  toPct: z.number().nullable(),
  ratePct: z.number(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  rowVersion: z.number().int(),
});
export type CommissionSlab = z.infer<typeof CommissionSlabSchema>;

/** The bands of one effective period. */
export const CommissionPeriodSchema = z.object({
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  bands: z.array(CommissionSlabSchema),
});
export type CommissionPeriod = z.infer<typeof CommissionPeriodSchema>;

/** GET /commission-slabs?asOf: every period, newest first, and the one in force on asOf (null when none). */
export const CommissionSlabsResultSchema = z.object({ asOf: z.string(), current: z.string().nullable(), periods: z.array(CommissionPeriodSchema) });
export type CommissionSlabsResult = z.infer<typeof CommissionSlabsResultSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const CommissionSlabsQuerySchema = z.object({ asOf: isoDate.optional() });
export type CommissionSlabsQuery = z.infer<typeof CommissionSlabsQuerySchema>;

export const CommissionBandSchema = z.object({
  label: z.string().trim().min(1, 'Label the band').max(40),
  fromPct: z.coerce.number().min(0, 'Not negative').max(1000),
  toPct: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().max(1000).nullable()),
  ratePct: z.coerce.number().min(0, '0 to 100').max(100, '0 to 100'),
});
export type CommissionBand = z.infer<typeof CommissionBandSchema>;

/** PUT /commission-slabs: replace the bands of one effective period (`replaceFrom` = that period's current start, absent for a new period). */
export const CommissionSlabsSaveSchema = z.object({
  replaceFrom: isoDate.nullable().optional(),
  effectiveFrom: isoDate,
  effectiveTo: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable()).default(null),
  bands: z.array(CommissionBandSchema).min(1, 'Add at least one band').max(20),
}).refine((s) => !s.effectiveTo || s.effectiveTo >= s.effectiveFrom, { message: 'Ends before it starts', path: ['effectiveTo'] });
export type CommissionSlabsSave = z.infer<typeof CommissionSlabsSaveSchema>;

/**
 * Bands are contiguous when, sorted by fromPct, the first starts at 0, each starts where the previous one ends,
 * every band ends above its start, and only the last may be open-ended. Returns the problem, or null when fine.
 */
export function slabsContiguous(bands: { fromPct: number; toPct: number | null }[]): string | null {
  if (!bands.length) return null;
  const s = [...bands].sort((a, b) => a.fromPct - b.fromPct);
  if (s[0]!.fromPct !== 0) return 'The first band must start at 0%';
  for (let i = 0; i < s.length; i++) {
    const b = s[i]!, next = s[i + 1];
    if (b.toPct !== null && b.toPct <= b.fromPct) return `The band from ${b.fromPct}% must end above ${b.fromPct}%`;
    if (!next) break;
    if (b.toPct === null) return 'Only the top band can be open-ended';
    if (next.fromPct !== b.toPct) return next.fromPct > b.toPct ? `Gap between ${b.toPct}% and ${next.fromPct}%` : `Bands overlap at ${next.fromPct}%`;
  }
  return null;
}
