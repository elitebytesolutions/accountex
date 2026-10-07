import { z } from 'zod';
import { ListQuerySchema, patchFields, RowVersionSchema } from '../common/list-query.ts';
import { GlRefSchema, optionalText } from '../treasury/common.ts';
import { cnicField, emailField, ntnField, optionalDate, optionalId, PartyRefSchema, phoneField, strnField } from './common.ts';

/** A customer's contact person (Sales.CustomerContacts). */
export const CustomerContactSchema = z.object({
  id: z.string(), fullName: z.string(), designation: z.string().nullable(), mobile: z.string().nullable(), phone: z.string().nullable(),
  email: z.string().nullable(), isPrimary: z.boolean(), receivesInvoices: z.boolean(), rowVersion: z.number().int(),
});
export type CustomerContact = z.infer<typeof CustomerContactSchema>;

/** A delivery / billing address (Sales.CustomerAddresses). */
export const CustomerAddressSchema = z.object({
  id: z.string(), addressType: z.string(), label: z.string(), addressLine: z.string(), area: z.string().nullable(), city: z.string().nullable(),
  province: z.string().nullable(), contactName: z.string().nullable(), contactPhone: z.string().nullable(), isDefault: z.boolean(), rowVersion: z.number().int(),
});
export type CustomerAddress = z.infer<typeof CustomerAddressSchema>;

/** A note on the customer (Sales.CustomerNotes); the author comes from the session. */
export const CustomerNoteSchema = z.object({
  id: z.string(), note: z.string(), author: PartyRefSchema.nullable(), createdAt: z.string(), rowVersion: z.number().int(),
});
export type CustomerNote = z.infer<typeof CustomerNoteSchema>;

/** One customer (Sales.Customers). Balance / overdue come from invoices (Phase 23); 0 until then. */
export const CustomerSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
  customerType: z.string(),
  group: PartyRefSchema.nullable(),
  /** The customer's own price list (wins over the group's); Phase 9. */
  priceList: PartyRefSchema.nullable(),
  salesRep: PartyRefSchema.nullable(),
  branch: PartyRefSchema.nullable(),
  customerSince: z.string().nullable(),
  customerChannel: z.string(),
  ntn: z.string().nullable(),
  cnic: z.string().nullable(),
  strn: z.string().nullable(),
  atlStatus: z.string(),
  isSalesTaxRegistered: z.boolean(),
  applyFurtherTax: z.boolean(),
  deductsWht: z.boolean(),
  whtSection: z.string().nullable(),
  whtRate: z.number().nullable(),
  isGstExempt: z.boolean(),
  contactPerson: z.string().nullable(),
  mobile: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  billingAddress: z.string().nullable(),
  area: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  shippingSameAsBilling: z.boolean(),
  shippingAddress: z.string().nullable(),
  creditLimit: z.number(),
  paymentTerms: z.string(),
  creditDays: z.number().int(),
  receivableAccount: GlRefSchema.nullable(),
  blockOverLimit: z.boolean(),
  autoReminders: z.boolean(),
  guarantorName: z.string().nullable(),
  guarantorFatherName: z.string().nullable(),
  guarantorCnic: z.string().nullable(),
  guarantorPhone: z.string().nullable(),
  guarantorAddress: z.string().nullable(),
  status: z.string(),
  holdReason: z.string().nullable(),
  onHoldSince: z.string().nullable(),
  balance: z.number(),
  overdue: z.number(),
  rowVersion: z.number().int(),
});
export type Customer = z.infer<typeof CustomerSchema>;
export const CustomerDetailSchema = CustomerSchema.extend({
  contacts: z.array(CustomerContactSchema), addresses: z.array(CustomerAddressSchema), notes: z.array(CustomerNoteSchema),
});
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;

export const CUSTOMER_STATUSES = ['ACTIVE', 'ON_HOLD', 'DISPUTED', 'INACTIVE'] as const;
export const CustomerListQuerySchema = ListQuerySchema.extend({
  group: z.uuid().optional(),
  city: z.string().trim().max(60).optional(),
});
export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;

const bool = (d: boolean) => z.boolean().default(d);
const CustomerFields = {
  /** Blank → the next free CUST-0001. */
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Like CUST-0001').optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  name: z.string().trim().min(2, 'Enter the customer name').max(150),
  displayName: optionalText(60),
  customerType: z.enum(['COMPANY', 'INDIVIDUAL', 'GOVERNMENT', 'AOP']).default('COMPANY'),
  customerGroupId: optionalId,
  priceListId: optionalId,
  salesRepUserId: optionalId,
  branchId: optionalId,
  customerSince: optionalDate,
  customerChannel: z.enum(['STANDARD', 'WHOLESALE']).default('STANDARD'),
  ntn: ntnField,
  cnic: cnicField,
  strn: strnField,
  atlStatus: z.enum(['ACTIVE', 'NOT_ON_ATL']).default('NOT_ON_ATL'),
  isSalesTaxRegistered: bool(false),
  applyFurtherTax: bool(false),
  deductsWht: bool(false),
  whtSection: z.enum(['153_1_A', '153_1_B', '153_1_C', 'EXEMPT']).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  whtRate: z.coerce.number().min(0, '0 to 100').max(100, '0 to 100').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  isGstExempt: bool(false),
  contactPerson: optionalText(100),
  mobile: phoneField,
  phone: phoneField,
  email: emailField,
  billingAddress: optionalText(300),
  area: optionalText(80),
  city: optionalText(60),
  province: z.enum(['PUNJAB', 'SINDH', 'KPK', 'ICT', 'BALOCHISTAN', 'GB', 'AJK']).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  shippingSameAsBilling: bool(true),
  shippingAddress: optionalText(300),
  creditLimit: z.coerce.number().min(0, 'Not negative').max(100_000_000_000).default(0),
  paymentTerms: z.enum(['NET_15', 'NET_30', 'NET_45', 'NET_60', 'DUE_ON_RECEIPT', 'ADVANCE_50', 'ADVANCE', 'COD']).default('NET_30'),
  creditDays: z.coerce.number().int().min(0, '0 to 365').max(365, '0 to 365').optional(),
  receivableAccountId: optionalId,
  blockOverLimit: bool(true),
  autoReminders: bool(true),
  guarantorName: optionalText(100),
  guarantorFatherName: optionalText(100),
  guarantorCnic: cnicField,
  guarantorPhone: phoneField,
  guarantorAddress: optionalText(300),
};
export const CustomerCreateSchema = z.object(CustomerFields);
export type CustomerCreate = z.infer<typeof CustomerCreateSchema>;
export type CustomerCreateFields = z.input<typeof CustomerCreateSchema>;
export const CustomerUpdateSchema = patchFields(CustomerFields).extend(RowVersionSchema.shape);
export type CustomerUpdate = z.infer<typeof CustomerUpdateSchema>;

/** Status change: ON_HOLD needs a reason. */
export const CustomerStatusSchema = z.object({
  status: z.enum(CUSTOMER_STATUSES),
  holdReason: z.enum(['OVER_LIMIT', 'OVERDUE', 'BOUNCED_CHEQUE', 'MANUAL']).optional().nullable(),
  rowVersion: z.coerce.number().int().min(0),
});
export type CustomerStatusChange = z.infer<typeof CustomerStatusSchema>;

const ContactFields = {
  fullName: z.string().trim().min(2, 'Enter the name').max(100),
  designation: optionalText(80),
  mobile: phoneField,
  phone: phoneField,
  email: emailField,
  isPrimary: bool(false),
  receivesInvoices: bool(false),
};
export const CustomerContactCreateSchema = z.object(ContactFields);
export type CustomerContactCreate = z.infer<typeof CustomerContactCreateSchema>;
export const CustomerContactUpdateSchema = patchFields(ContactFields).extend(RowVersionSchema.shape);
export type CustomerContactUpdate = z.infer<typeof CustomerContactUpdateSchema>;

const AddressFields = {
  addressType: z.enum(['BILLING', 'SHIPPING', 'BOTH']).default('SHIPPING'),
  label: z.string().trim().min(2, 'e.g. DHA store').max(60),
  addressLine: z.string().trim().min(3, 'Enter the address').max(300),
  area: optionalText(80),
  city: optionalText(60),
  province: z.enum(['PUNJAB', 'SINDH', 'KPK', 'ICT', 'BALOCHISTAN', 'GB', 'AJK']).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  contactName: optionalText(100),
  contactPhone: phoneField,
  isDefault: bool(false),
};
export const CustomerAddressCreateSchema = z.object(AddressFields);
export type CustomerAddressCreate = z.infer<typeof CustomerAddressCreateSchema>;
export const CustomerAddressUpdateSchema = patchFields(AddressFields).extend(RowVersionSchema.shape);
export type CustomerAddressUpdate = z.infer<typeof CustomerAddressUpdateSchema>;

export const CustomerNoteCreateSchema = z.object({ note: z.string().trim().min(1, 'Write the note').max(4000) });
export type CustomerNoteCreate = z.infer<typeof CustomerNoteCreateSchema>;
