import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** A shop area (Distribution.ShopAreas): groups shops on the route board. `shops` = shop profiles in it. */
export const ShopAreaSchema = z.object({
  id: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  city: z.string().nullable(),
  branchId: z.string().nullable(),
  status: z.string(),
  shops: z.number().int(),
  rowVersion: z.number().int(),
});
export type ShopArea = z.infer<typeof ShopAreaSchema>;

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const ShopAreaFields = {
  code: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, '2–20 letters, digits or dashes').nullable()).default(null),
  name: z.string().trim().min(2, 'Name the area').max(80),
  city: z.preprocess(blankToNull, z.string().trim().max(60).nullable()).default(null),
  branchId: z.preprocess(blankToNull, z.uuid().nullable()).default(null),
};
export const ShopAreaCreateSchema = z.object(ShopAreaFields);
export type ShopAreaCreate = z.infer<typeof ShopAreaCreateSchema>;
export const ShopAreaUpdateSchema = patchFields(ShopAreaFields).extend(RowVersionSchema.shape);
export type ShopAreaUpdate = z.infer<typeof ShopAreaUpdateSchema>;
