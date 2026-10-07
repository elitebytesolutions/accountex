import { z } from 'zod';
import { ListQuerySchema, patchFields, RowVersionSchema } from '../common/list-query.ts';
import { GlRefSchema, optionalText } from '../treasury/common.ts';
import { cnicField, emailField, ntnField, optionalDate, optionalId, PartyRefSchema, phoneField, strnField } from './common.ts';

/** A vendor contact (Purchases.VendorContacts). */
export const VendorContactSchema = z.object({
  id: z.string(), fullName: z.string(), designation: z.string().nullable(), phone: z.string().nullable(), mobile: z.string().nullable(),
  email: z.string().nullable(), isPrimary: z.boolean(), rowVersion: z.number().int(),
});
export type VendorContact = z.infer<typeof VendorContactSchema>;

/** A bank account payments go to (Purchases.VendorBankAccounts). */
export const VendorBankAccountSchema = z.object({
  id: z.string(), bankName: z.string(), branchName: z.string().nullable(), accountTitle: z.string().nullable(), accountNo: z.string().nullable(),
  iban: z.string().nullable(), swiftCode: z.string().nullable(), currencyCode: z.string(), isPrimary: z.boolean(), isActive: z.boolean(), rowVersion: z.number().int(),
});
export type VendorBankAccount = z.infer<typeof VendorBankAccountSchema>;

/** One vendor (Purchases.Vendors). Payable / overdue come from bills (Phase 21); 0 until then. */
export const VendorSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  category: PartyRefSchema.nullable(),
  ntn: z.string().nullable(),
  cnic: z.string().nullable(),
  strn: z.string().nullable(),
  atlStatus: z.string(),
  atlVerifiedAt: z.string().nullable(),
  defaultWhtSection: z.string(),
  defaultAccount: GlRefSchema.nullable(),
  payableAccount: GlRefSchema.nullable(),
  paymentTerms: z.string(),
  creditDays: z.number().int(),
  currencyCode: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  bankName: z.string().nullable(),
  iban: z.string().nullable(),
  vendorSince: z.string().nullable(),
  status: z.string(),
  remarks: z.string().nullable(),
  primaryContact: VendorContactSchema.nullable(),
  payable: z.number(),
  overdue: z.number(),
  rowVersion: z.number().int(),
});
export type Vendor = z.infer<typeof VendorSchema>;
export const VendorDetailSchema = VendorSchema.extend({ contacts: z.array(VendorContactSchema), bankAccounts: z.array(VendorBankAccountSchema) });
export type VendorDetail = z.infer<typeof VendorDetailSchema>;

export const VendorListQuerySchema = ListQuerySchema.extend({
  category: z.uuid().optional(),
  atl: z.enum(['ACTIVE', 'NOT_ON_ATL', 'UNVERIFIED']).optional(),
});
export type VendorListQuery = z.infer<typeof VendorListQuerySchema>;

export const VENDOR_TERMS = ['ADVANCE', 'ON_RECEIPT', 'NET_7', 'NET_14', 'NET_15', 'NET_30', 'NET_45', 'NET_60', 'NET_90'] as const;
const ibanPk = z.string().trim().toUpperCase().transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^PK[0-9]{2}[A-Z]{4}[0-9A-Z]{16}$/, 'Like PK36SCBL0000001123456702'));
const VendorFields = {
  /** Blank → the next free VEN-0001. */
  code: z.string().trim().toUpperCase().regex(/^VEN-[0-9]{4,}$/, 'Like VEN-0001').optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  name: z.string().trim().min(2, 'Enter the vendor name').max(150),
  legalName: optionalText(150),
  categoryId: optionalId,
  ntn: ntnField,
  cnic: cnicField,
  strn: strnField,
  atlStatus: z.enum(['ACTIVE', 'NOT_ON_ATL', 'UNVERIFIED']).default('UNVERIFIED'),
  defaultWhtSection: z.enum(['153_1_A', '153_1_B', '153_1_C', 'EXEMPT']).default('153_1_A'),
  defaultAccountId: optionalId,
  payableAccountId: optionalId,
  paymentTerms: z.enum(VENDOR_TERMS).default('NET_30'),
  creditDays: z.coerce.number().int().min(0, '0 to 365').max(365, '0 to 365').optional(),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('PKR'),
  phone: phoneField,
  email: emailField,
  address: optionalText(300),
  city: optionalText(60),
  vendorSince: optionalDate,
  remarks: optionalText(500),
};
/** Create also takes the template's contact person and bank / IBAN: they become the primary contact and bank account. */
export const VendorCreateSchema = z.object({
  ...VendorFields,
  contactPerson: optionalText(100),
  bankName: optionalText(80),
  iban: ibanPk.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
}).refine((v) => !v.iban || v.bankName, { path: ['bankName'], message: 'Enter the bank for this IBAN' });
export type VendorCreate = z.infer<typeof VendorCreateSchema>;
export type VendorCreateFields = z.input<typeof VendorCreateSchema>;
export const VendorUpdateSchema = patchFields(VendorFields).extend(RowVersionSchema.shape);
export type VendorUpdate = z.infer<typeof VendorUpdateSchema>;

const ContactFields = {
  fullName: z.string().trim().min(2, 'Enter the name').max(100),
  designation: optionalText(80),
  phone: phoneField,
  mobile: phoneField,
  email: emailField,
  isPrimary: z.boolean().default(false),
};
export const VendorContactCreateSchema = z.object(ContactFields);
export type VendorContactCreate = z.infer<typeof VendorContactCreateSchema>;
export const VendorContactUpdateSchema = patchFields(ContactFields).extend(RowVersionSchema.shape);
export type VendorContactUpdate = z.infer<typeof VendorContactUpdateSchema>;

const BankFields = {
  bankName: z.string().trim().min(2, 'Enter the bank').max(80),
  branchName: optionalText(80),
  accountTitle: optionalText(120),
  accountNo: optionalText(40),
  iban: z.string().trim().toUpperCase().transform((v) => v.replace(/\s+/g, '')).pipe(z.string().regex(/^[A-Z]{2}[0-9]{2}[0-9A-Z]{11,30}$/, 'Like PK36SCBL0000001123456702'))
    .optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  swiftCode: z.string().trim().toUpperCase().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Like SCBLPKKX').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('PKR'),
  isPrimary: z.boolean().default(false),
  isActive: z.boolean().default(true),
};
export const VendorBankCreateSchema = z.object(BankFields);
export type VendorBankCreate = z.infer<typeof VendorBankCreateSchema>;
export const VendorBankUpdateSchema = patchFields(BankFields).extend(RowVersionSchema.shape);
export type VendorBankUpdate = z.infer<typeof VendorBankUpdateSchema>;
