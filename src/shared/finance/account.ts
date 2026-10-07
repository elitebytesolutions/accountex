import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';
import { ACCOUNT_CODE_RE } from './account-code.ts';

/** One chart-of-accounts row (the screen loads the whole chart as a flat list and builds the tree). */
export const AccountSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  parentId: z.string().nullable(),
  level: z.number().int(),
  accountClass: z.number().int(),
  nature: z.string(),
  kind: z.string(),
  subType: z.string().nullable(),
  currencyCode: z.string(),
  branchIds: z.array(z.string()),
  status: z.string(),
  /** Closing balance (net, in the account's nature); 0 until vouchers post (Phase 16). */
  balance: z.number(),
  updatedAt: z.string(),
  updatedByName: z.string().nullable(),
  rowVersion: z.number().int(),
});
export type Account = z.infer<typeof AccountSchema>;

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const AccountCreateSchema = z.object({
  parentId: z.uuid('Choose the parent account'),
  code: z.string().trim().regex(ACCOUNT_CODE_RE, 'Use a code like 1110 or 1110-01'),
  name: z.string().trim().min(2, 'Name the account').max(120),
  description: text(300),
  nature: z.enum(['DR', 'CR']),
  /** Required for postable (level 4) accounts; must match the account class. */
  subType: z.string().optional().nullable().transform((v) => (v ? v : null)),
  currencyCode: z.string().regex(/^[A-Z]{3}$/).default('PKR'),
  branchIds: z.array(z.uuid()).default([]),
});
export type AccountCreate = z.infer<typeof AccountCreateSchema>;
export type AccountCreateFields = z.input<typeof AccountCreateSchema>;

/** Structure (code, parent, level, class, kind) never changes after creation. */
export const AccountUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Name the account').max(120),
    description: text(300),
    subType: z.string().optional().nullable().transform((v) => (v ? v : null)),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    branchIds: z.array(z.uuid()),
  })
  .partial()
  .extend(RowVersionSchema.shape);
export type AccountUpdate = z.infer<typeof AccountUpdateSchema>;

export const AccountBulkStatusSchema = z.object({
  ids: z.array(z.uuid()).min(1),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
export type AccountBulkStatus = z.infer<typeof AccountBulkStatusSchema>;

export const AccountTemplateSchema = z.object({ id: z.string(), code: z.string(), name: z.string(), description: z.string().nullable(), accountCount: z.number(), postableCount: z.number() });
export type AccountTemplate = z.infer<typeof AccountTemplateSchema>;

/** One ledger line (Accounting.getGeneralLedgerForPeriod). */
export const LedgerLineSchema = z.object({
  rowKind: z.string(),
  postingDate: z.string().nullable(),
  voucherId: z.string().nullable(),
  docNo: z.string().nullable(),
  voucherType: z.string().nullable(),
  description: z.string().nullable(),
  referenceNo: z.string().nullable(),
  debit: z.number(),
  credit: z.number(),
  balance: z.number(),
});
export type LedgerLine = z.infer<typeof LedgerLineSchema>;
export const LedgerSchema = z.object({ account: AccountSchema, from: z.string(), to: z.string(), opening: z.number(), debit: z.number(), credit: z.number(), closing: z.number(), lines: z.array(LedgerLineSchema) });
export type Ledger = z.infer<typeof LedgerSchema>;

export const LedgerViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  accountId: z.string().nullable(),
  rangeLabel: z.string().nullable(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  filters: z.record(z.string(), z.unknown()),
  isShared: z.boolean(),
  isMine: z.boolean(),
  ownerName: z.string(),
  rowVersion: z.number().int(),
});
export type LedgerView = z.infer<typeof LedgerViewSchema>;
export const LedgerViewSaveSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the view').max(80),
    accountId: z.uuid().optional().nullable().transform((v) => v ?? null),
    rangeLabel: text(40),
    dateFrom: z.iso.date().optional().nullable().transform((v) => v ?? null),
    dateTo: z.iso.date().optional().nullable().transform((v) => v ?? null),
    filters: z.record(z.string(), z.unknown()).default({}),
    isShared: z.boolean().default(false),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateTo >= v.dateFrom, { path: ['dateTo'], message: 'End after start' });
export type LedgerViewSave = z.infer<typeof LedgerViewSaveSchema>;
