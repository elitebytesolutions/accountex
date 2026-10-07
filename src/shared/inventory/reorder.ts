import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** A reorder rule (Inventory.ReorderRules) for a product in one warehouse, or in all of them (warehouse null). */
export const ReorderRuleSchema = z.object({
  id: z.string(),
  product: z.object({ id: z.string(), sku: z.string(), name: z.string() }),
  warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  lowLevel: z.number(),
  highLevel: z.number(),
  leadDays: z.number().int(),
  safetyDays: z.number().int(),
  coverAlertDays: z.number().int(),
  isActive: z.boolean(),
  rowVersion: z.number().int(),
});
export type ReorderRule = z.infer<typeof ReorderRuleSchema>;

const days = (d: number) => z.coerce.number().int().min(0, '0 to 365').max(365, '0 to 365').default(d);
const RuleFields = {
  warehouseId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  lowLevel: z.coerce.number().min(0, 'Not negative'),
  highLevel: z.coerce.number().min(0, 'Not negative'),
  leadDays: days(14),
  safetyDays: days(14),
  coverAlertDays: days(21),
  isActive: z.boolean().default(true),
};
export const ReorderRuleCreateSchema = z.object({ itemId: z.uuid('Choose the product'), ...RuleFields })
  .refine((r) => r.lowLevel <= r.highLevel, { path: ['lowLevel'], message: 'Low level is above the high level' });
export type ReorderRuleCreate = z.infer<typeof ReorderRuleCreateSchema>;
export const ReorderRuleUpdateSchema = patchFields(RuleFields).extend(RowVersionSchema.shape);
export type ReorderRuleUpdate = z.infer<typeof ReorderRuleUpdateSchema>;

/** One product needing reorder, grouped by its preferred supplier on the suggestions page. */
export const ReorderSuggestionSchema = z.object({
  product: z.object({ id: z.string(), sku: z.string(), name: z.string(), ctn: z.number().int(), uomCode: z.string(), cost: z.number() }),
  supplier: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  warehouse: z.object({ id: z.string(), name: z.string() }).nullable(),
  onHand: z.number(),
  lowLevel: z.number(),
  highLevel: z.number(),
  avgDaily: z.number(),
  coverDays: z.number().nullable(),
  suggestCartons: z.number().int(),
  suggestQty: z.number(),
  value: z.number(),
});
export type ReorderSuggestion = z.infer<typeof ReorderSuggestionSchema>;

/**
 * The suggestion maths (template note: below the low level, or less than the cover-alert days of cover at the current
 * sales rate; top up to the high level plus the lead + safety days of sales, in whole cartons).
 */
export function reorderSuggestion(r: { onHand: number; lowLevel: number; highLevel: number; avgDaily: number; leadDays: number; safetyDays: number; coverAlertDays: number; ctn: number }) {
  const coverDays = r.avgDaily > 0 ? Math.floor(r.onHand / r.avgDaily) : null;
  const needs = r.onHand < r.lowLevel || (coverDays !== null && coverDays < r.coverAlertDays);
  if (!needs) return null;
  const target = r.highLevel + r.avgDaily * (r.leadDays + r.safetyDays);
  const qty = Math.max(0, target - r.onHand);
  const per = Math.max(1, r.ctn);
  const cartons = Math.ceil(qty / per);
  return { coverDays, suggestCartons: cartons, suggestQty: cartons * per };
}
