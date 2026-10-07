import { z } from 'zod';
import { ListQuerySchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

/** A batch / lot of a product (Inventory.ProductBatches). Created by GRNs from Phase 20; by hand for now. */
export const BatchSchema = z.object({
  id: z.string(),
  product: z.object({ id: z.string(), sku: z.string(), name: z.string() }),
  batchNo: z.string(),
  expiryDate: z.string().nullable(),
  mfgDate: z.string().nullable(),
  unitCost: z.number().nullable(),
  disposition: z.string(),
  dispositionAt: z.string().nullable(),
  notes: z.string().nullable(),
  /** On hand / value from stock balances (0 until the stock phases). */
  onHand: z.number(),
  value: z.number(),
  rowVersion: z.number().int(),
});
export type Batch = z.infer<typeof BatchSchema>;

export const BATCH_WINDOWS = ['expired', '30', '90', '180', 'later', 'none'] as const;
export type BatchWindow = (typeof BATCH_WINDOWS)[number];
export const BatchListQuerySchema = ListQuerySchema.extend({
  product: z.uuid().optional(),
  window: z.enum(BATCH_WINDOWS).optional(),
  disposition: z.string().trim().max(30).optional(),
});
export type BatchListQuery = z.infer<typeof BatchListQuerySchema>;

const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
export const BatchCreateSchema = z.object({
  itemId: z.uuid('Choose the product'),
  batchNo: z.string().trim().min(1, 'Enter the batch number').max(40),
  expiryDate: optionalDate,
  mfgDate: optionalDate,
  unitCost: z.coerce.number().min(0).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  notes: optionalText(500),
}).refine((b) => !b.mfgDate || !b.expiryDate || b.mfgDate <= b.expiryDate, { path: ['expiryDate'], message: 'Expiry is before manufacture' });
export type BatchCreate = z.infer<typeof BatchCreateSchema>;
export const BatchUpdateSchema = z.object({
  expiryDate: optionalDate, mfgDate: optionalDate,
  unitCost: z.coerce.number().min(0).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  notes: optionalText(500), rowVersion: z.coerce.number().int().min(0),
}).partial({ expiryDate: true, mfgDate: true, unitCost: true, notes: true });
export type BatchUpdate = z.infer<typeof BatchUpdateSchema>;

export const BATCH_DISPOSITIONS = ['SALEABLE', 'PRIORITY', 'QUARANTINE', 'CLEARANCE', 'RETURN_TO_PRINCIPAL', 'WRITTEN_OFF'] as const;
export const BatchDispositionSchema = z.object({ disposition: z.enum(BATCH_DISPOSITIONS), notes: optionalText(500), rowVersion: z.coerce.number().int().min(0) });
export type BatchDispositionChange = z.infer<typeof BatchDispositionSchema>;

/** Which expiry window a batch is in, from today (YYYY-MM-DD). */
export function expiryWindow(expiry: string | null, today: string): BatchWindow {
  if (!expiry) return 'none';
  const days = Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 30) return '30';
  if (days <= 90) return '90';
  if (days <= 180) return '180';
  return 'later';
}
