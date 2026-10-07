import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

/** One product company / brand (Inventory.ProductCompanies). */
export const ProductCompanySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  status: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  brandColour: z.string(),
  notes: z.string().nullable(),
  productCount: z.number().int(),
  updatedAt: z.string(),
  rowVersion: z.number().int(),
});
export type ProductCompany = z.infer<typeof ProductCompanySchema>;

/** The template's brand swatches. */
export const BRAND_COLOURS = ['#1F5F45', '#2F6FD0', '#D64545', '#B7791F', '#7C3AED', '#DB2777'] as const;

const CompanyFields = {
  /** Blank → the next free CO-NN. */
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}-?\d{2,3}$/, 'Like CO-13').optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  name: z.string().trim().min(2, 'Enter the company name').max(120),
  shortName: z.string().trim().max(5, 'At most 5 characters').optional().nullable().transform((v) => (v ? v : null)),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  address: optionalText(200),
  city: optionalText(60),
  country: z.string().trim().min(2).max(60).default('Pakistan'),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,16}$/, 'Like 021-1234567').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  email: z.email('Like info@company.com').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  website: z.string().trim().regex(/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i, 'Like www.company.com').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  brandColour: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'A colour like #1F5F45').default('#1F5F45'),
  notes: optionalText(500),
};

export const ProductCompanyCreateSchema = z.object(CompanyFields);
export type ProductCompanyCreate = z.infer<typeof ProductCompanyCreateSchema>;
export type ProductCompanyCreateFields = z.input<typeof ProductCompanyCreateSchema>;
export const ProductCompanyUpdateSchema = patchFields(CompanyFields).extend(RowVersionSchema.shape);
export type ProductCompanyUpdate = z.infer<typeof ProductCompanyUpdateSchema>;

/** Initials for the logo tile when there's no short name: "Habib Packaging" → "HP". */
export function companyInitials(c: { name: string; shortName: string | null }): string {
  if (c.shortName) return c.shortName;
  const words = c.name.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return (words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join('') : (words[0] ?? c.name).slice(0, 4)).toUpperCase();
}
