import { z } from 'zod';
import { ListQuerySchema, patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

const Ref = z.object({ id: z.string(), name: z.string() });

/** A pack size of a product (Inventory.ProductUnits): `factor` base units per pack. */
export const ProductUnitSchema = z.object({
  id: z.string(), uom: z.object({ id: z.string(), code: z.string(), name: z.string(), decimals: z.number().int() }), factor: z.number(),
  isBase: z.boolean(), isPurchaseDefault: z.boolean(), isSalesDefault: z.boolean(), rowVersion: z.number().int(),
});
export type ProductUnit = z.infer<typeof ProductUnitSchema>;

export const ProductBarcodeSchema = z.object({
  id: z.string(), barcode: z.string(), kind: z.string(), qtyPerScan: z.number(), isPrimary: z.boolean(), rowVersion: z.number().int(),
});
export type ProductBarcode = z.infer<typeof ProductBarcodeSchema>;

export const ProductSupplierSchema = z.object({
  id: z.string(), vendor: z.object({ id: z.string(), code: z.string(), name: z.string() }), vendorItemCode: z.string().nullable(), lastPrice: z.number().nullable(),
  lastPurchaseDate: z.string().nullable(), leadDays: z.number().int().nullable(), sharePct: z.number().nullable(), isPreferred: z.boolean(), rowVersion: z.number().int(),
});
export type ProductSupplier = z.infer<typeof ProductSupplierSchema>;

export const PriceLogSchema = z.object({
  id: z.string(), priceField: z.string(), oldValue: z.number().nullable(), newValue: z.number(), changedAt: z.string(), changedBy: z.string().nullable(), source: z.string(),
});
export type PriceLog = z.infer<typeof PriceLogSchema>;

/** One product (Inventory.Products). On hand and stock value come from stock balances (0 until the stock phases). */
export const ProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  upc: z.string().nullable(),
  name: z.string(),
  nameUrdu: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  company: z.object({ id: z.string(), code: z.string(), name: z.string(), brandColour: z.string() }).nullable(),
  distributor: Ref.nullable(),
  productClass: z.object({ id: z.string(), code: z.string(), name: z.string(), icon: z.string() }).nullable(),
  subclass: Ref.nullable(),
  uom: z.object({ id: z.string(), code: z.string(), name: z.string(), decimals: z.number().int() }),
  ctn: z.number().int(),
  defaultShelf: z.string().nullable(),
  cost: z.number(),
  avgCost: z.number(),
  price: z.number(),
  wprice: z.number().nullable(),
  gstRate: z.number(),
  taxCode: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  finDiscPct: z.number(),
  lowLevel: z.number(),
  highLevel: z.number(),
  isShort: z.boolean(),
  trackExpiry: z.boolean(),
  isControlled: z.boolean(),
  isPrecious: z.boolean(),
  hsCode: z.string().nullable(),
  weightKg: z.number().nullable(),
  leadDays: z.number().int().nullable(),
  isKit: z.boolean(),
  onHand: z.number(),
  stockValue: z.number(),
  rowVersion: z.number().int(),
});
export type Product = z.infer<typeof ProductSchema>;
export const ProductDetailSchema = ProductSchema.extend({
  units: z.array(ProductUnitSchema), barcodes: z.array(ProductBarcodeSchema), suppliers: z.array(ProductSupplierSchema),
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

/** Catalogue chips: special attributes a product can carry. */
export const PRODUCT_ATTRS = ['short', 'expiry', 'precious', 'controlled'] as const;
export const ProductListQuerySchema = ListQuerySchema.extend({
  company: z.uuid().optional(),
  class: z.uuid().optional(),
  subclass: z.uuid().optional(),
  shelf: z.string().trim().max(10).optional(),
  attr: z.enum(PRODUCT_ATTRS).optional(),
  /** Stock on hand range (all warehouses). */
  minStock: z.coerce.number().min(0).optional(),
  maxStock: z.coerce.number().min(0).optional(),
  /** Scope "low": on hand at or below the product's low level. */
  low: z.coerce.boolean().optional(),
});
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

const money = (max = 1_000_000_000) => z.coerce.number().min(0, 'Not negative').max(max);
const optionalMoney = money().optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const ProductFields = {
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,11}$/, 'Like FD-5001 (2–12 letters, digits, -)'),
  upc: z.string().trim().regex(/^(\d{8}|\d{12}|\d{13})$/, '8, 12 or 13 digits').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  name: z.string().trim().min(2, 'Enter the product name').max(150),
  nameUrdu: optionalText(150),
  description: optionalText(1000),
  status: z.enum(['ACTIVE', 'DRAFT', 'INACTIVE']).default('ACTIVE'),
  manufacturerId: optionalId,
  distributorVendorId: optionalId,
  productClassId: optionalId,
  productSubclassId: optionalId,
  uomId: z.uuid('Choose the base unit'),
  ctn: z.coerce.number().int('Whole number').min(1, 'At least 1').max(100_000).default(1),
  defaultShelf: z.string().trim().toUpperCase().regex(/^[A-Z]{1,2}\d{1,3}$/, 'Like A1 or BC12').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  cost: money().default(0),
  price: money().default(0),
  wprice: optionalMoney,
  gstRate: z.coerce.number().min(0, '0 to 100').max(100, '0 to 100').default(18),
  taxCodeId: optionalId,
  finDiscPct: z.coerce.number().min(0, '0 to 100').max(100, '0 to 100').default(0),
  lowLevel: z.coerce.number().min(0, 'Not negative').default(0),
  highLevel: z.coerce.number().min(0, 'Not negative').default(0),
  isShort: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
  isControlled: z.boolean().default(false),
  isPrecious: z.boolean().default(false),
  hsCode: z.string().trim().regex(/^\d{4}(\.?\d{2,4}){0,2}$/, 'Like 0910.9100').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  weightKg: optionalMoney,
  leadDays: z.coerce.number().int().min(0, '0 to 365').max(365, '0 to 365').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
};

type PriceShape = { status: string; cost: number; price: number; lowLevel: number; highLevel: number; manufacturerId?: string | null; productClassId?: string | null };
/**
 * Same as the DB checks (itemCompleteWhenLiveChk and the price checks): an active / inactive product has a company, a class,
 * cost and price above 0 and sells at or above cost (drafts may be incomplete); low ≤ high.
 */
export function productErrors(p: PriceShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (p.status !== 'DRAFT') {
    if (!p.manufacturerId) e.manufacturerId = 'Choose the company, or save as draft';
    if (!p.productClassId) e.productClassId = 'Choose the class, or save as draft';
    if (!(p.cost > 0)) e.cost = 'Enter the purchase price, or save as draft';
    if (!(p.price > 0)) e.price = 'Enter the retail price, or save as draft';
    else if (p.price < p.cost) e.price = 'Below the purchase price; save as draft or raise it';
  }
  if (p.lowLevel > p.highLevel) e.lowLevel = 'Low level is above the high level';
  return e;
}

const unitInput = z.object({ uomId: z.uuid(), factor: z.coerce.number().gt(0, 'More than 0'), isPurchaseDefault: z.boolean().default(false), isSalesDefault: z.boolean().default(false) });
const barcodeInput = z.object({ barcode: z.string().trim().regex(/^\d{8,14}$/, '8 to 14 digits'), kind: z.enum(['PIECE', 'CARTON']).default('PIECE'), qtyPerScan: z.coerce.number().gt(0).default(1), isPrimary: z.boolean().default(false) });
const supplierInput = z.object({
  vendorId: z.uuid('Choose the vendor'), vendorItemCode: optionalText(40), lastPrice: optionalMoney,
  leadDays: z.coerce.number().int().min(0).max(365).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  sharePct: z.coerce.number().min(0).max(100).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  isPreferred: z.boolean().default(false),
});

export const ProductCreateSchema = z.object({
  ...ProductFields,
  /** Extra pack sizes (the base unit row is added automatically). */
  units: z.array(unitInput).max(10).default([]),
  barcodes: z.array(barcodeInput).max(10).default([]),
  suppliers: z.array(supplierInput).max(10).default([]),
}).superRefine((p, ctx) => {
  for (const [path, message] of Object.entries(productErrors(p))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type ProductCreate = z.infer<typeof ProductCreateSchema>;
export type ProductCreateFields = z.input<typeof ProductCreateSchema>;
export const ProductUpdateSchema = patchFields(ProductFields).extend(RowVersionSchema.shape);
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;

export const PRICE_FIELDS = ['COST', 'PRICE', 'WPRICE'] as const;
/** Inline price edit from the catalogue (writes the price log). */
export const ProductPriceSchema = z.object({ field: z.enum(PRICE_FIELDS), value: money(), rowVersion: z.coerce.number().int().min(0) });
export type ProductPriceChange = z.infer<typeof ProductPriceSchema>;

export const ProductUnitCreateSchema = unitInput;
export type ProductUnitCreate = z.infer<typeof ProductUnitCreateSchema>;
export const ProductUnitUpdateSchema = patchFields({ factor: unitInput.shape.factor, isPurchaseDefault: z.boolean(), isSalesDefault: z.boolean() }).extend(RowVersionSchema.shape);
export type ProductUnitUpdate = z.infer<typeof ProductUnitUpdateSchema>;
export const ProductBarcodeCreateSchema = barcodeInput;
export type ProductBarcodeCreate = z.infer<typeof ProductBarcodeCreateSchema>;
export const ProductBarcodeUpdateSchema = patchFields(barcodeInput.shape).extend(RowVersionSchema.shape);
export type ProductBarcodeUpdate = z.infer<typeof ProductBarcodeUpdateSchema>;
export const ProductSupplierCreateSchema = supplierInput;
export type ProductSupplierCreate = z.infer<typeof ProductSupplierCreateSchema>;
export const ProductSupplierUpdateSchema = patchFields(supplierInput.shape).extend(RowVersionSchema.shape);
export type ProductSupplierUpdate = z.infer<typeof ProductSupplierUpdateSchema>;

/** Margin of a selling price over cost, % of the price (0 when there is no price). */
export const marginPct = (price: number, cost: number) => (price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0);

/** "44 CTN + 64 Pack" for a quantity in base units with `perCarton` base units in a carton. */
export function packSplit(qty: number, perCarton: number, cartonCode = 'CTN', baseCode = 'PCS'): string {
  if (perCarton <= 1) return `${qty.toLocaleString('en-US')} ${baseCode}`;
  const ctn = Math.floor(qty / perCarton), loose = qty - ctn * perCarton;
  return [ctn ? `${ctn.toLocaleString('en-US')} ${cartonCode}` : null, loose || !ctn ? `${loose.toLocaleString('en-US')} ${baseCode}` : null].filter(Boolean).join(' + ');
}

/** EAN-13 check digit for a 12-digit body (used when generating in-house barcodes). */
export function ean13CheckDigit(body12: string): number {
  const sum = [...body12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}
