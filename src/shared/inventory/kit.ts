import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** A kit component: a product and how many go into one kit. */
export const KitComponentSchema = z.object({
  id: z.string(),
  product: z.object({ id: z.string(), sku: z.string(), name: z.string(), cost: z.number(), price: z.number(), ctn: z.number().int(), uomCode: z.string(), classIcon: z.string().nullable() }),
  qtyPerKit: z.number(),
  sortOrder: z.number().int(),
  onHand: z.number(),
});
export type KitComponent = z.infer<typeof KitComponentSchema>;

/** A kit or bundle (Inventory.KitsAndBundles); `kitItem` is the product it sells as. */
export const KitSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  icon: z.string(),
  tone: z.string(),
  kitItem: z.object({ id: z.string(), sku: z.string() }),
  sellingPrice: z.number(),
  targetMarginPct: z.number(),
  status: z.string(),
  components: z.array(KitComponentSchema),
  /** Assembled kits in stock (0 until the stock phases). */
  inStock: z.number(),
  rowVersion: z.number().int(),
});
export type Kit = z.infer<typeof KitSchema>;

export const KIT_TONES = ['green', 'lime', 'blue', 'orange', 'violet', 'red'] as const;
export const KIT_ICONS = ['gift', 'package-plus', 'briefcase', 'hard-hat', 'box', 'shopping-basket', 'sparkles', 'baby'] as const;
const KitFields = {
  name: z.string().trim().min(2, 'Name the kit').max(120),
  icon: z.enum(KIT_ICONS).default('package-plus'),
  tone: z.enum(KIT_TONES).default('green'),
  sellingPrice: z.coerce.number().min(0, 'Not negative').max(1_000_000_000).default(0),
  targetMarginPct: z.coerce.number().min(5, '5 to 50').max(50, '5 to 50').default(25),
  components: z.array(z.object({ itemId: z.uuid(), qtyPerKit: z.coerce.number().gt(0, 'More than 0').max(100_000) }))
    .min(1, 'Add at least one component').max(50)
    .refine((c) => new Set(c.map((x) => x.itemId)).size === c.length, 'A product appears twice'),
};
export const KitCreateSchema = z.object(KitFields);
export type KitCreate = z.infer<typeof KitCreateSchema>;
export const KitUpdateSchema = patchFields(KitFields).extend(RowVersionSchema.shape);
export type KitUpdate = z.infer<typeof KitUpdateSchema>;

/** Live kit maths: component cost, bought-separately total, suggested price at the target margin, actual margin and saving. */
export function kitFigures(components: { cost: number; price: number; qty: number }[], sellingPrice: number, targetMarginPct: number) {
  const cost = components.reduce((s, c) => s + c.cost * c.qty, 0);
  const retail = components.reduce((s, c) => s + c.price * c.qty, 0);
  const suggested = targetMarginPct < 100 ? Math.ceil(cost / (1 - targetMarginPct / 100) / 10) * 10 : cost;
  const margin = sellingPrice > 0 ? Math.round(((sellingPrice - cost) / sellingPrice) * 1000) / 10 : 0;
  const saving = retail > 0 ? Math.round(((retail - sellingPrice) / retail) * 1000) / 10 : 0;
  return { cost, retail, suggested, margin, marginAmount: sellingPrice - cost, saving };
}

/** How many kits the components on hand can build (the scarcest component limits it). */
export const kitsBuildable = (components: { onHand: number; qty: number }[]) =>
  components.length ? Math.max(0, Math.min(...components.map((c) => Math.floor(c.onHand / c.qty)))) : 0;
