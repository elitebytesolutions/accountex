import { z } from 'zod';
import { ListQuerySchema, patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const ref = z.object({ id: z.string(), name: z.string() });

/** A price list (Sales.PriceLists) with its assignment counts and average margin on cost. */
export const PriceListSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  markupPct: z.number().nullable(),
  roundingTo: z.number(),
  isDefault: z.boolean(),
  currencyCode: z.string(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: z.string(),
  remarks: z.string().nullable(),
  groups: z.array(ref),
  customerCount: z.number().int(),
  itemCount: z.number().int(),
  /** Average margin on cost of the list's current prices; null when the list has no prices yet. */
  avgMargin: z.number().nullable(),
  /** Prices below a 10% margin. */
  lowCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type PriceList = z.infer<typeof PriceListSchema>;

const ListFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Like PL-WHS (2–20 letters, digits, -)'),
  name: z.string().trim().min(2, 'Name the price list').max(80),
  markupPct: z.coerce.number().min(0, 'Not negative').max(1000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  roundingTo: z.coerce.number().gt(0, 'More than 0').max(10_000).default(1),
  isDefault: z.boolean().default(false),
  currencyCode: z.string().trim().toUpperCase().length(3).default('PKR'),
  validFrom: optionalDate,
  validTo: optionalDate,
  remarks: optionalText(300),
};
const datesOk = (p: { validFrom?: string | null; validTo?: string | null }) => !p.validFrom || !p.validTo || p.validFrom <= p.validTo;
export const PriceListCreateSchema = z.object({
  ...ListFields,
  /** Start empty, copy another list's current prices, or price every product at cost + markup. */
  fill: z.enum(['EMPTY', 'COPY', 'MARKUP']).default('EMPTY'),
  copyFromId: z.uuid().optional().nullable(),
}).refine(datesOk, { path: ['validTo'], message: 'Ends before it starts' })
  .refine((p) => p.fill !== 'COPY' || !!p.copyFromId, { path: ['copyFromId'], message: 'Choose the list to copy' })
  .refine((p) => p.fill !== 'MARKUP' || p.markupPct !== null, { path: ['markupPct'], message: 'Enter the markup to price from cost' });
export type PriceListCreate = z.infer<typeof PriceListCreateSchema>;
export const PriceListUpdateSchema = patchFields(ListFields).extend(RowVersionSchema.shape).refine(datesOk, { path: ['validTo'], message: 'Ends before it starts' });
export type PriceListUpdate = z.infer<typeof PriceListUpdateSchema>;

/** One product row of a list's price grid. `price` is the list price in force on `date` (null: not on the list). */
export const PriceListRowSchema = z.object({
  product: z.object({ id: z.string(), sku: z.string(), name: z.string(), uomCode: z.string(), className: z.string().nullable(), companyName: z.string().nullable() }),
  cost: z.number(),
  retail: z.number(),
  price: z.number().nullable(),
  effectiveFrom: z.string().nullable(),
  /** The next dated price after `date`, if one is scheduled. */
  next: z.object({ price: z.number(), effectiveFrom: z.string() }).nullable(),
});
export type PriceListRow = z.infer<typeof PriceListRowSchema>;
export const PriceListRowsQuerySchema = ListQuerySchema.extend({
  class: z.uuid().optional(),
  date: z.iso.date().optional(),
});
export type PriceListRowsQuery = z.infer<typeof PriceListRowsQuerySchema>;

/** Save changed prices, or reprice every product at cost + markup (rounded to the list's rounding), from a date. */
export const PriceListBulkSchema = z.object({
  effectiveFrom: z.iso.date('Use a date').optional(),
  items: z.array(z.object({ itemId: z.uuid(), price: z.coerce.number().min(0, 'Not negative').max(1_000_000_000) })).max(500).optional(),
  markupPct: z.coerce.number().min(0, 'Not negative').max(1000).optional(),
}).refine((b) => (b.items?.length ?? 0) > 0 || b.markupPct !== undefined, { path: ['items'], message: 'Nothing to save' })
  .refine((b) => !b.items?.length || new Set(b.items.map((i) => i.itemId)).size === b.items.length, { path: ['items'], message: 'A product appears twice' });
export type PriceListBulk = z.infer<typeof PriceListBulkSchema>;

export const PriceListCopySchema = z.object({ code: ListFields.code, name: ListFields.name });
export type PriceListCopy = z.infer<typeof PriceListCopySchema>;

/** The price a customer pays for a product on a date: their list → their group's → the default list → the product price; then a quantity break. */
export const PriceResolveQuerySchema = z.object({
  customer: z.uuid().optional(),
  product: z.uuid(),
  qty: z.coerce.number().gt(0).default(1),
  date: z.iso.date().optional(),
});
export type PriceResolveQuery = z.infer<typeof PriceResolveQuerySchema>;
export const PriceResolutionSchema = z.object({
  priceList: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  /** CUSTOMER / GROUP / DEFAULT: where the list came from; NONE when no list applies. */
  listFrom: z.enum(['CUSTOMER', 'GROUP', 'DEFAULT', 'NONE']),
  basePrice: z.number(),
  price: z.number(),
  source: z.enum(['LIST', 'PRODUCT', 'BREAK']),
  tierNo: z.number().int().nullable(),
});
export type PriceResolution = z.infer<typeof PriceResolutionSchema>;

// ---------------------------------------------------------------- quantity breaks
export const QuantitySlabSchema = z.object({
  minQty: z.coerce.number().gt(0, 'More than 0'),
  maxQty: z.coerce.number().gt(0).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  unitPrice: z.coerce.number().min(0, 'Not negative').max(1_000_000_000),
});
export type QuantitySlab = z.infer<typeof QuantitySlabSchema>;

/** Why a slab set is invalid (null when fine): starts at 1, ascends, no gaps or overlaps, only the last is open-ended. */
export function slabError(slabs: { minQty: number; maxQty: number | null }[]): string | null {
  if (!slabs.length) return null;
  if (slabs[0]!.minQty !== 1) return 'The first slab starts at 1';
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i]!, next = slabs[i + 1];
    if (s.maxQty !== null && s.maxQty < s.minQty) return `T${i + 1}: max is below min`;
    if (!next) break;
    if (s.maxQty === null) return `T${i + 1}: only the last slab can be open-ended`;
    if (next.minQty <= s.maxQty) return `T${i + 2} overlaps T${i + 1}`;
    if (next.minQty - s.maxQty > 1) return `Gap between T${i + 1} and T${i + 2}`;
  }
  return null;
}

export const QuantityBreaksSaveSchema = z.object({
  priceListId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  itemId: z.uuid('Choose the product'),
  slabs: z.array(QuantitySlabSchema).max(20, 'At most 20 slabs'),
}).superRefine((b, ctx) => {
  const e = slabError(b.slabs);
  if (e) ctx.addIssue({ code: 'custom', path: ['slabs'], message: e });
});
export type QuantityBreaksSave = z.infer<typeof QuantityBreaksSaveSchema>;
export const QuantityBreaksQuerySchema = z.object({ priceList: z.uuid().optional().or(z.literal('')), product: z.uuid() });
export type QuantityBreaksQuery = z.infer<typeof QuantityBreaksQuerySchema>;
export const QuantityBreakSchema = z.object({ id: z.string(), tierNo: z.number().int(), minQty: z.number(), maxQty: z.number().nullable(), unitPrice: z.number() });
export type QuantityBreak = z.infer<typeof QuantityBreakSchema>;

/** The slab that applies to a quantity (the last one whose min the quantity reaches). */
export function breakFor<T extends { minQty: number }>(slabs: T[], qty: number): T | null {
  let hit: T | null = null;
  for (const s of [...slabs].sort((a, b) => a.minQty - b.minQty)) if (qty >= s.minQty) hit = s;
  return hit;
}

/** Rounds to the nearest multiple of `step` (a list's roundingTo). */
export const roundTo = (v: number, step: number) => (step > 0 ? Math.round(Math.round(v / step) * step * 10_000) / 10_000 : v);
