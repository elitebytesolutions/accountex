import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

export const VAN_STATUSES = ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] as const;
export const VanStatusSchema = z.enum(VAN_STATUSES);

/** A delivery van (Distribution.Vans). Its stock lives in a VAN-type warehouse (one van per warehouse). */
export const VanSchema = z.object({
  id: z.string(),
  regNo: z.string(),
  model: z.string(),
  capacityCtn: z.number(),
  capacityKg: z.number(),
  warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  /** An employee (after Phase 11). */
  defaultDriver: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  branchId: z.string().nullable(),
  status: z.string(),
  remarks: z.string().nullable(),
  /** Codes of the routes this van runs. */
  routes: z.array(z.string()),
  rowVersion: z.number().int(),
});
export type Van = z.infer<typeof VanSchema>;

/** A VAN-type warehouse a van can be linked to; `vanId` = the van already on it. */
export const VanWarehouseSchema = z.object({ id: z.string(), code: z.string(), name: z.string(), status: z.string(), vanId: z.string().nullable() });
export type VanWarehouse = z.infer<typeof VanWarehouseSchema>;

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const VanFields = {
  regNo: z.string().trim().toUpperCase().min(3, '3 to 20 characters').max(20, '3 to 20 characters'),
  model: z.string().trim().min(2, 'Enter the model').max(80),
  capacityCtn: z.coerce.number().gt(0, 'More than 0').max(99_999_999),
  capacityKg: z.coerce.number().gt(0, 'More than 0').max(99_999_999),
  warehouseId: z.preprocess(blankToNull, z.uuid().nullable()).default(null),
  defaultDriverEmployeeId: z.preprocess(blankToNull, z.uuid().nullable()).default(null),
  branchId: z.preprocess(blankToNull, z.uuid().nullable()).default(null),
  status: VanStatusSchema.default('ACTIVE'),
  remarks: z.preprocess(blankToNull, z.string().trim().max(300).nullable()).default(null),
};
export const VanCreateSchema = z.object(VanFields);
export type VanCreate = z.infer<typeof VanCreateSchema>;
export const VanUpdateSchema = patchFields(VanFields).extend(RowVersionSchema.shape);
export type VanUpdate = z.infer<typeof VanUpdateSchema>;
export const VanStatusChangeSchema = z.object({ status: VanStatusSchema }).extend(RowVersionSchema.shape);
export type VanStatusChange = z.infer<typeof VanStatusChangeSchema>;
