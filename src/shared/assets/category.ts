import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { GlRefSchema } from '../treasury/common.ts';

/** One fixed asset category (FixedAssets.FixedAssetCategories): depreciation defaults and GL accounts. */
export const AssetCategorySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  defaultMethod: z.string(),
  defaultRatePct: z.number().nullable(),
  costAccount: GlRefSchema,
  accumDepAccount: GlRefSchema.nullable(),
  depExpenseAccount: GlRefSchema.nullable(),
  tagPrefix: z.string().nullable(),
  status: z.string(),
  rowVersion: z.number().int(),
});
export type AssetCategory = z.infer<typeof AssetCategorySchema>;

const optionalId = z.uuid().optional().nullable().transform((v) => v ?? null);
const CategoryFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{1,19}$/, 'Like VEH or IT-EQ'),
  name: z.string().trim().min(2, 'Name the category').max(80),
  defaultMethod: z.enum(['WDV', 'SLM', 'NONE']).default('WDV'),
  defaultRatePct: z.coerce.number().gt(0, 'More than 0').max(100, 'At most 100').optional().nullable().transform((v) => v ?? null),
  costAccountId: z.uuid('Choose the asset (cost) account'),
  accumDepAccountId: optionalId,
  depExpenseAccountId: optionalId,
  tagPrefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9-]{0,9}$/, 'Like VEH-').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
};

type MethodShape = { defaultMethod: string; defaultRatePct: number | null; accumDepAccountId: string | null; depExpenseAccountId: string | null };
/** Same as assetCategoryMethodChk: depreciated categories need a rate and both depreciation accounts; "None" has neither rate. */
export function assetCategoryErrors(c: MethodShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.defaultMethod === 'NONE') {
    if (c.defaultRatePct !== null) e.defaultRatePct = 'No rate when the category is not depreciated';
  } else {
    if (c.defaultRatePct === null) e.defaultRatePct = 'Enter the yearly rate';
    if (!c.accumDepAccountId) e.accumDepAccountId = 'Choose the accumulated depreciation account';
    if (!c.depExpenseAccountId) e.depExpenseAccountId = 'Choose the depreciation expense account';
  }
  return e;
}

export const AssetCategoryCreateSchema = z.object(CategoryFields).superRefine((c, ctx) => {
  for (const [path, message] of Object.entries(assetCategoryErrors(c))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type AssetCategoryCreate = z.infer<typeof AssetCategoryCreateSchema>;
export type AssetCategoryCreateFields = z.input<typeof AssetCategoryCreateSchema>;
export const AssetCategoryUpdateSchema = patchFields(CategoryFields).extend(RowVersionSchema.shape);
export type AssetCategoryUpdate = z.infer<typeof AssetCategoryUpdateSchema>;
