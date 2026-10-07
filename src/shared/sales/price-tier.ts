import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';

/** A wholesale price tier (Distribution.PriceTiers): shops on the tier pay the wholesale price × the rate factor. */
export const PriceTierSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  rateFactor: z.number(),
  allocationRank: z.number().int(),
  isActive: z.boolean(),
  updatedAt: z.string(),
  rowVersion: z.number().int(),
});
export type PriceTier = z.infer<typeof PriceTierSchema>;

/** The three tier codes are fixed (lookup PriceTierCode), so tiers are edited, never added or deleted. */
export const PriceTierUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name the tier').max(40).optional(),
  rateFactor: z.coerce.number().gt(0, 'More than 0').max(2, 'At most 2 (200%)').optional(),
  allocationRank: z.coerce.number().int().min(0, 'Not negative').max(100).optional(),
  isActive: z.boolean().optional(),
}).extend(RowVersionSchema.shape);
export type PriceTierUpdate = z.infer<typeof PriceTierUpdateSchema>;
