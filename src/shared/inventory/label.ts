import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** A label template (Inventory.BarcodeLabelTemplates): roll labels or a sheet grid. System ones are seeded per company. */
export const LabelTemplateSchema = z.object({
  id: z.string(), code: z.string(), name: z.string(), media: z.string(), widthMm: z.number(), heightMm: z.number(),
  labelsPerSheet: z.number().int().nullable(), sheetColumns: z.number().int().nullable(), sheetRows: z.number().int().nullable(),
  isSystem: z.boolean(), isActive: z.boolean(), rowVersion: z.number().int(),
});
export type LabelTemplate = z.infer<typeof LabelTemplateSchema>;

const posInt = z.coerce.number().int().positive().max(500).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const TemplateFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, 'Like SHELF_50X30'),
  name: z.string().trim().min(2).max(60),
  media: z.enum(['ROLL', 'SHEET']).default('ROLL'),
  widthMm: z.coerce.number().gt(0, 'More than 0').max(300),
  heightMm: z.coerce.number().gt(0, 'More than 0').max(300),
  labelsPerSheet: posInt,
  sheetColumns: posInt,
  sheetRows: posInt,
};
export const LabelTemplateCreateSchema = z.object(TemplateFields).refine((t) => t.media === 'ROLL' || (t.sheetColumns && t.sheetRows), { path: ['sheetColumns'], message: 'A sheet needs columns and rows' });
export type LabelTemplateCreate = z.infer<typeof LabelTemplateCreateSchema>;
export const LabelTemplateUpdateSchema = patchFields(TemplateFields).extend({ isActive: z.boolean().optional() }).extend(RowVersionSchema.shape);
export type LabelTemplateUpdate = z.infer<typeof LabelTemplateUpdateSchema>;

/** A recorded print run (Inventory.BarcodeLabelJobs + lines). */
export const LabelJobSchema = z.object({
  id: z.string(), template: z.object({ id: z.string(), name: z.string() }), showPrice: z.boolean(), showUrduName: z.boolean(), showBatchExpiry: z.boolean(),
  showCompany: z.boolean(), useCartonBarcode: z.boolean(), productCount: z.number().int(), totalLabels: z.number().int(), pageCount: z.number().int().nullable(),
  source: z.string(), status: z.string(), printedAt: z.string().nullable(), printedBy: z.string().nullable(),
  lines: z.array(z.object({ product: z.object({ id: z.string(), sku: z.string(), name: z.string() }), copies: z.number().int(), barcode: z.string().nullable(), printedPrice: z.number().nullable() })),
});
export type LabelJob = z.infer<typeof LabelJobSchema>;

export const LabelJobCreateSchema = z.object({
  templateId: z.uuid('Choose a template'),
  showPrice: z.boolean().default(true),
  showUrduName: z.boolean().default(false),
  showBatchExpiry: z.boolean().default(false),
  showCompany: z.boolean().default(true),
  useCartonBarcode: z.boolean().default(false),
  source: z.enum(['LABELS', 'CATALOGUE', 'PRODUCT_DETAIL']).default('LABELS'),
  lines: z.array(z.object({ itemId: z.uuid(), copies: z.coerce.number().int().min(1, '1 to 500').max(500, '1 to 500'), batchId: z.uuid().optional().nullable() }))
    .min(1, 'Pick at least one product').max(200)
    .refine((l) => new Set(l.map((x) => x.itemId)).size === l.length, 'A product appears twice'),
});
export type LabelJobCreate = z.infer<typeof LabelJobCreateSchema>;

/** Pages a job needs: roll labels are one per "page"; sheets hold columns × rows. */
export function labelPages(t: { media: string; sheetColumns: number | null; sheetRows: number | null; labelsPerSheet: number | null }, total: number): number {
  if (t.media === 'ROLL') return total;
  const per = t.labelsPerSheet ?? (t.sheetColumns ?? 1) * (t.sheetRows ?? 1);
  return Math.ceil(total / Math.max(1, per));
}
