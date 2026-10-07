import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { GlRefSchema, optionalText } from '../treasury/common.ts';

const RefSchema = z.object({ id: z.string(), name: z.string() });

/** A storage bin inside a warehouse (Inventory.WarehouseBins). */
export const WarehouseBinSchema = z.object({
  id: z.string(),
  code: z.string(),
  rack: z.string().nullable(),
  shelfRow: z.string().nullable(),
  position: z.string().nullable(),
  zone: z.string().nullable(),
  isActive: z.boolean(),
  rowVersion: z.number().int(),
});
export type WarehouseBin = z.infer<typeof WarehouseBinSchema>;

/** One warehouse / shop (Inventory.Warehouses) with its bins and stock figures (0 until the stock phases). */
export const WarehouseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  branch: RefSchema.nullable(),
  manager: RefSchema.nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  capacityPallets: z.number().int().nullable(),
  inventoryAccount: GlRefSchema.nullable(),
  blockNegativeStock: z.boolean(),
  isPrimary: z.boolean(),
  status: z.string(),
  bins: z.array(WarehouseBinSchema),
  rackCount: z.number().int(),
  stockValue: z.number(),
  skuCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type Warehouse = z.infer<typeof WarehouseSchema>;

/** VAN warehouses need a vehicle (Distribution vans, a later phase), so only these types can be chosen for now. */
export const WAREHOUSE_TYPES = ['WAREHOUSE', 'SHOP'] as const;

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const WarehouseFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}-[A-Z0-9]{2,6}$/, 'Like WH-LHR'),
  name: z.string().trim().min(2, 'Name the warehouse').max(80),
  description: optionalText(120),
  type: z.enum(WAREHOUSE_TYPES).default('WAREHOUSE'),
  branchId: z.uuid('Choose the branch'),
  managerUserId: optionalId,
  address: optionalText(200),
  city: optionalText(60),
  capacityPallets: z.coerce.number().int('Whole pallets').positive('More than 0').max(1_000_000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  inventoryAccountId: optionalId,
  blockNegativeStock: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
};
export const WarehouseCreateSchema = z.object(WarehouseFields);
export type WarehouseCreate = z.infer<typeof WarehouseCreateSchema>;
export const WarehouseUpdateSchema = patchFields(WarehouseFields).extend(RowVersionSchema.shape);
export type WarehouseUpdate = z.infer<typeof WarehouseUpdateSchema>;

/** A suggested warehouse code from its name: "Multan" → "WH-MUL". */
export function suggestWarehouseCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.length >= 2 ? `WH-${letters.slice(0, 3)}` : '';
}

const binPart = optionalText(20);
const BinFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, 'Like A-01 (letters, digits, -)'),
  rack: binPart,
  shelfRow: binPart,
  position: binPart,
  zone: binPart,
  isActive: z.boolean().default(true),
};
export const BinCreateSchema = z.object(BinFields);
export type BinCreate = z.infer<typeof BinCreateSchema>;
export const BinUpdateSchema = patchFields(BinFields).extend(RowVersionSchema.shape);
export type BinUpdate = z.infer<typeof BinUpdateSchema>;

/** "Generate A-01 … A-20": prefix + a zero-padded number range; rack / zone copied onto every bin. */
export const BinGenerateSchema = z
  .object({
    prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,9}$/, 'Like A-'),
    from: z.coerce.number().int().min(0).max(9999),
    to: z.coerce.number().int().min(0).max(9999),
    pad: z.coerce.number().int().min(1).max(4).default(2),
    rack: binPart,
    zone: binPart,
  })
  .refine((g) => g.to >= g.from, { path: ['to'], message: 'At least the "from" number' })
  .refine((g) => g.to - g.from < 200, { path: ['to'], message: 'At most 200 bins at a time' });
export type BinGenerate = z.infer<typeof BinGenerateSchema>;

/** The bin codes a generate request makes: A- 1..3 pad 2 → A-01, A-02, A-03. */
export function generateBinCodes(g: { prefix: string; from: number; to: number; pad: number }): string[] {
  const codes: string[] = [];
  for (let n = g.from; n <= g.to; n++) codes.push(`${g.prefix}${String(n).padStart(g.pad, '0')}`);
  return codes;
}
