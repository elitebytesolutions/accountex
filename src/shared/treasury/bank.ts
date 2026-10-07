import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { GlLinkSchema, GlRefSchema, masterCode, optionalAmount, optionalText } from './common.ts';

// ---------------------------------------------------------------- Banks
export const BankSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  swiftBic: z.string().nullable(),
  ibanBankCode: z.string().nullable(),
  isIslamic: z.boolean(),
  isActive: z.boolean(),
  accountCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type Bank = z.infer<typeof BankSchema>;

const BankFields = {
  code: masterCode(20),
  name: z.string().trim().min(2, 'Name the bank').max(120),
  shortName: optionalText(40),
  swiftBic: z.string().trim().toUpperCase().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, '8 or 11 characters, e.g. HABBPKKA').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  ibanBankCode: z.string().trim().toUpperCase().regex(/^[A-Z]{4}$/, '4 letters, e.g. HABB').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  isIslamic: z.boolean().default(false),
};
export const BankCreateSchema = z.object(BankFields);
export type BankCreate = z.infer<typeof BankCreateSchema>;
export type BankCreateFields = z.input<typeof BankCreateSchema>;
export const BankUpdateSchema = patchFields(BankFields).extend(RowVersionSchema.shape);
export type BankUpdate = z.infer<typeof BankUpdateSchema>;

// ---------------------------------------------------------------- Bank accounts
export const ChequeBookSchema = z.object({
  id: z.string(),
  bankAccountId: z.string(),
  bookRef: z.string().nullable(),
  firstLeafNo: z.number(),
  lastLeafNo: z.number(),
  nextLeafNo: z.number(),
  leafDigits: z.number().int(),
  leaves: z.number().int(),
  /** Leaves already written (next − first). */
  used: z.number().int(),
  crossedAcPayee: z.boolean(),
  receivedOn: z.string().nullable(),
  status: z.string(),
  remarks: z.string().nullable(),
  rowVersion: z.number().int(),
});
export type ChequeBook = z.infer<typeof ChequeBookSchema>;

export const BankAccountSchema = z.object({
  id: z.string(),
  bank: z.object({ id: z.string(), code: z.string(), name: z.string(), shortName: z.string().nullable() }),
  branch: z.object({ id: z.string(), name: z.string() }),
  accountType: z.string(),
  accountTitle: z.string(),
  accountNo: z.string(),
  accountLast4: z.string().nullable(),
  iban: z.string().nullable(),
  bankBranch: z.string().nullable(),
  account: GlRefSchema,
  currencyCode: z.string(),
  creditLimit: z.number().nullable(),
  markupTerms: z.string().nullable(),
  purpose: z.string(),
  statementImportEnabled: z.boolean(),
  statementFormat: z.string().nullable(),
  useForPayroll: z.boolean(),
  reconciledTo: z.string().nullable(),
  status: z.string(),
  closedOn: z.string().nullable(),
  /** Book balance today; 0 until vouchers post (Phase 16). */
  balance: z.number(),
  activeBook: ChequeBookSchema.nullable(),
  bookCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type BankAccount = z.infer<typeof BankAccountSchema>;

const BankAccountFields = {
  bankId: z.uuid('Choose the bank'),
  branchId: z.uuid('Choose the branch'),
  accountType: z.string().min(1).default('CURRENT'),
  accountTitle: z.string().trim().min(2, 'Enter the account title').max(160),
  accountNo: z.string().trim().regex(/^[0-9][0-9 -]{3,33}$/, 'Digits, spaces and dashes'),
  iban: z.string().trim().toUpperCase().transform((v) => v.replace(/\s+/g, '')).pipe(z.string().regex(/^PK[0-9]{2}[A-Z]{4}[0-9]{16}$/, 'PK + 2 digits + 4-letter bank code + 16 digits'))
    .optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  bankBranch: optionalText(120),
  currencyCode: z.string().regex(/^[A-Z]{3}$/).default('PKR'),
  creditLimit: optionalAmount,
  markupTerms: optionalText(200),
  purpose: z.string().min(1).default('GENERAL'),
  statementImportEnabled: z.boolean().default(true),
  statementFormat: z.string().optional().nullable().transform((v) => (v ? v : null)),
  useForPayroll: z.boolean().default(false),
};

type AccountShape = { accountType: string; currencyCode: string; creditLimit: number | null };
/** Cross-field rules of BankCash.BankAccounts (same as its checks). Used on create and on the merged record on update. */
export function bankAccountErrors(a: AccountShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (a.accountType === 'RUNNING_FINANCE' && !a.creditLimit) e.creditLimit = 'Enter the running-finance limit';
  if (a.accountType === 'FOREIGN_CURRENCY' && a.currencyCode === 'PKR') e.currencyCode = 'Choose the foreign currency';
  return e;
}

export const BankAccountCreateSchema = z.object({ ...BankAccountFields, gl: GlLinkSchema.default({ mode: 'create', parentId: null }) }).superRefine((a, ctx) => {
  for (const [path, message] of Object.entries(bankAccountErrors(a))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type BankAccountCreate = z.infer<typeof BankAccountCreateSchema>;
export type BankAccountCreateFields = z.input<typeof BankAccountCreateSchema>;
/** The bank and the GL link are fixed once the account exists. */
const EditableAccountFields = Object.fromEntries(Object.entries(BankAccountFields).filter(([k]) => k !== 'bankId')) as Omit<typeof BankAccountFields, 'bankId'>;
export const BankAccountUpdateSchema = patchFields(EditableAccountFields).extend(RowVersionSchema.shape);
export type BankAccountUpdate = z.infer<typeof BankAccountUpdateSchema>;

/** POST /bank/accounts/:id/{dormant,activate,close} */
export const BankAccountStatusSchema = RowVersionSchema.extend({ closedOn: z.iso.date().optional() });
export type BankAccountStatusAction = z.infer<typeof BankAccountStatusSchema>;

// ---------------------------------------------------------------- Cheque books
const leaf = z.coerce.number().int('Whole numbers').positive('More than 0').max(9_999_999_999);
const ChequeBookFields = {
  bookRef: optionalText(40),
  firstLeafNo: leaf,
  lastLeafNo: leaf,
  leafDigits: z.coerce.number().int().min(4, '4–10').max(10, '4–10').default(8),
  crossedAcPayee: z.boolean().default(true),
  receivedOn: z.iso.date().optional().nullable().transform((v) => v ?? null),
  status: z.enum(['ON_ORDER', 'ACTIVE']).default('ACTIVE'),
  remarks: optionalText(200),
};
type LeafShape = { firstLeafNo: number; lastLeafNo: number; leafDigits: number };
export function chequeBookErrors(b: LeafShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (b.lastLeafNo < b.firstLeafNo) e.lastLeafNo = 'Last leaf after the first';
  if (String(b.lastLeafNo).length > b.leafDigits) e.leafDigits = `Leaf numbers have ${String(b.lastLeafNo).length} digits`;
  return e;
}
export const ChequeBookCreateSchema = z.object({ bankAccountId: z.uuid(), ...ChequeBookFields }).superRefine((b, ctx) => {
  for (const [path, message] of Object.entries(chequeBookErrors(b))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type ChequeBookCreate = z.infer<typeof ChequeBookCreateSchema>;
export type ChequeBookCreateFields = z.input<typeof ChequeBookCreateSchema>;
export const ChequeBookUpdateSchema = patchFields(ChequeBookFields).extend(RowVersionSchema.shape);
export type ChequeBookUpdate = z.infer<typeof ChequeBookUpdateSchema>;
