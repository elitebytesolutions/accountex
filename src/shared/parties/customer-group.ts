import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalId, PartyRefSchema } from './common.ts';
import { optionalText } from '../treasury/common.ts';

/** One customer group (Sales.CustomerGroups) and the price list its customers buy at (Phase 9). */
export const CustomerGroupSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  remarks: z.string().nullable(),
  priceList: PartyRefSchema.nullable(),
  isActive: z.boolean(),
  customerCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type CustomerGroup = z.infer<typeof CustomerGroupSchema>;

const GroupFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, 'Like CORP or RETAIL-CHAIN'),
  name: z.string().trim().min(2, 'Name the group').max(80),
  remarks: optionalText(300),
  priceListId: optionalId,
};
export const CustomerGroupCreateSchema = z.object(GroupFields);
export type CustomerGroupCreate = z.infer<typeof CustomerGroupCreateSchema>;
export const CustomerGroupUpdateSchema = patchFields(GroupFields).extend(RowVersionSchema.shape);
export type CustomerGroupUpdate = z.infer<typeof CustomerGroupUpdateSchema>;
