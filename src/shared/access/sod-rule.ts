import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** One segregation-of-duties rule (Company.SegregationOfDutiesRules). */
export const SodRuleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: z.string(),
  permissionA: z.string(),
  permissionB: z.string(),
  description: z.string().nullable(),
  severity: z.string(),
  ownerExempt: z.boolean(),
  isActive: z.boolean(),
  /** One of the standard rules every company starts with: can be changed or deactivated, not deleted. */
  isStandard: z.boolean(),
  rowVersion: z.number().int(),
});
export type SodRule = z.infer<typeof SodRuleSchema>;

const permission = z.string().regex(/^[a-z]+:[a-z]+$/, 'Choose a permission');
const SodRuleFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,40}$/, 'Capital letters, digits and _ (3–41)'),
  name: z.string().trim().min(3, 'Name the rule').max(120),
  kind: z.string().min(1).default('CUSTOM'),
  permissionA: permission,
  permissionB: permission,
  description: z.string().trim().max(300).optional().nullable().transform((v) => (v ? v : null)),
  severity: z.enum(['WARN', 'BLOCK']).default('WARN'),
  ownerExempt: z.boolean().default(true),
};
export const SodRuleCreateSchema = z.object(SodRuleFields).refine((r) => r.permissionA !== r.permissionB, { path: ['permissionB'], message: 'Choose two different permissions' });
export type SodRuleCreate = z.infer<typeof SodRuleCreateSchema>;
export type SodRuleCreateFields = z.input<typeof SodRuleCreateSchema>;
export const SodRuleUpdateSchema = patchFields(SodRuleFields).extend(RowVersionSchema.shape);
export type SodRuleUpdate = z.infer<typeof SodRuleUpdateSchema>;
