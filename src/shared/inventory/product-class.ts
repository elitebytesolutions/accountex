import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

/** A sub type inside a product class (Inventory.ProductSubclasses). */
export const ProductSubclassSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  isVisible: z.boolean(),
  sortOrder: z.number().int(),
  productCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type ProductSubclass = z.infer<typeof ProductSubclassSchema>;

/** A main product class with its sub types (Inventory.ProductClasses). */
export const ProductClassSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameUrdu: z.string().nullable(),
  icon: z.string(),
  isVisible: z.boolean(),
  sortOrder: z.number().int(),
  productCount: z.number().int(),
  subclasses: z.array(ProductSubclassSchema),
  rowVersion: z.number().int(),
});
export type ProductClass = z.infer<typeof ProductClassSchema>;

/** Icons a class can show (lucide names), as in the template's class cards. */
export const CLASS_ICONS = ['package', 'paperclip', 'hard-hat', 'lightbulb', 'shopping-basket', 'spray-can', 'cup-soda', 'cookie', 'shirt', 'pill', 'baby', 'wrench', 'sofa', 'smartphone'] as const;

const ClassFields = {
  name: z.string().trim().min(2, 'Name the class').max(80),
  nameUrdu: optionalText(80),
  icon: z.enum(CLASS_ICONS).default('package'),
  isVisible: z.boolean().default(true),
};
export const ProductClassCreateSchema = z.object(ClassFields);
export type ProductClassCreate = z.infer<typeof ProductClassCreateSchema>;
export const ProductClassUpdateSchema = patchFields(ClassFields).extend(RowVersionSchema.shape);
export type ProductClassUpdate = z.infer<typeof ProductClassUpdateSchema>;

const SubclassFields = {
  name: z.string().trim().min(2, 'Name the sub type').max(80),
  isVisible: z.boolean().default(true),
};
export const ProductSubclassCreateSchema = z.object(SubclassFields);
export type ProductSubclassCreate = z.infer<typeof ProductSubclassCreateSchema>;
export const ProductSubclassUpdateSchema = patchFields(SubclassFields).extend(RowVersionSchema.shape);
export type ProductSubclassUpdate = z.infer<typeof ProductSubclassUpdateSchema>;

/** Drag-to-reorder: the class's sub type ids in their new order. */
export const SubclassOrderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
export type SubclassOrder = z.infer<typeof SubclassOrderSchema>;
