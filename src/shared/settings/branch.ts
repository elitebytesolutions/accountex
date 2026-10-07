import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

/** A branch as returned by the API. */
export const BranchSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isHeadOffice: z.boolean(),
  isDefault: z.boolean(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  salesTaxAuthority: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  openingDate: z.string().nullable(),
  status: z.string(),
  rowVersion: z.number().int(),
});
export type Branch = z.infer<typeof BranchSchema>;

/** Same rules as the database checks on Company.Branches. */
const BranchFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,5}$/, '2–5 capital letters, e.g. LHR'),
  name: z.string().trim().min(2, 'Name is required').max(80),
  description: optionalText(120),
  isHeadOffice: z.boolean().default(false),
  address: optionalText(200),
  city: optionalText(60),
  province: optionalText(20),
  salesTaxAuthority: optionalText(20),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.email('Enter a valid email address').nullable()),
  openingDate: z.iso.date('Use YYYY-MM-DD').optional().nullable().transform((v) => v ?? null),
};

export const BranchCreateSchema = z.object(BranchFields);
export type BranchCreate = z.infer<typeof BranchCreateSchema>;
export type BranchCreateFields = z.input<typeof BranchCreateSchema>;

export const BranchUpdateSchema = patchFields(BranchFields).extend(RowVersionSchema.shape);
export type BranchUpdate = z.infer<typeof BranchUpdateSchema>;

/** Body of deactivate / activate / make-default / delete: the version the user saw. */
export const BranchActionSchema = RowVersionSchema;
export type BranchAction = z.infer<typeof BranchActionSchema>;
