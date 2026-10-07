import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** One vendor category (Purchases.VendorCategories). */
export const VendorCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  vendorCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type VendorCategory = z.infer<typeof VendorCategorySchema>;

const CategoryFields = {
  name: z.string().trim().min(2, 'Name the category').max(80),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
};
export const VendorCategoryCreateSchema = z.object(CategoryFields);
export type VendorCategoryCreate = z.infer<typeof VendorCategoryCreateSchema>;
export const VendorCategoryUpdateSchema = patchFields(CategoryFields).extend(RowVersionSchema.shape);
export type VendorCategoryUpdate = z.infer<typeof VendorCategoryUpdateSchema>;
