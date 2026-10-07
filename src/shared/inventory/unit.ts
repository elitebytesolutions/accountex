import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

/** One unit of measure (Inventory.UnitsOfMeasure). System units are seeded per company and can't be deleted. */
export const UnitSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameUrdu: z.string().nullable(),
  kind: z.string(),
  decimals: z.number().int(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  productCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type Unit = z.infer<typeof UnitSchema>;

export const UNIT_KINDS = ['COUNT', 'WEIGHT', 'VOLUME', 'LENGTH'] as const;

const UnitFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{0,9}$/, 'Like PCS or KG (capital letters, digits, _)'),
  name: z.string().trim().min(1, 'Name the unit').max(40),
  nameUrdu: optionalText(40),
  kind: z.enum(UNIT_KINDS).default('COUNT'),
  decimals: z.coerce.number().int('Whole number').min(0, '0 to 3').max(3, '0 to 3').default(0),
};

export const UnitCreateSchema = z.object(UnitFields);
export type UnitCreate = z.infer<typeof UnitCreateSchema>;
export const UnitUpdateSchema = patchFields(UnitFields).extend(RowVersionSchema.shape);
export type UnitUpdate = z.infer<typeof UnitUpdateSchema>;
