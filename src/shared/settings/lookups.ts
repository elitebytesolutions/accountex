import { z } from 'zod';

/** One value of a fixed list (Lookups.Lookups). */
export const LookupItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  tone: z.string(),
  /** Parent lookup codes this item belongs to (e.g. AccountSubType → account class); empty = any. */
  parentCodes: z.array(z.string()).optional(),
});
export type LookupItem = z.infer<typeof LookupItemSchema>;

/** GET /api/lookups?types=A,B → { A: [...], B: [...] } */
export const LookupsResponseSchema = z.record(z.string(), z.array(LookupItemSchema));
export type LookupsResponse = z.infer<typeof LookupsResponseSchema>;

export const LookupsQuerySchema = z.object({
  types: z
    .string()
    .regex(/^[A-Za-z]+(,[A-Za-z]+)*$/, 'Comma-separated lookup types')
    .transform((s) => [...new Set(s.split(','))])
    .refine((t) => t.length <= 30, 'At most 30 types'),
});
