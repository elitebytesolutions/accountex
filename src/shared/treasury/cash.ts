import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { GlLinkSchema, GlRefSchema, masterCode, optionalAmount, optionalText } from './common.ts';

// ---------------------------------------------------------------- Cash accounts
export const CashAccountSchema = z.object({
  id: z.string(),
  /** Same as the linked GL account's code. */
  code: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  kind: z.string(),
  branch: z.object({ id: z.string(), name: z.string() }),
  custodian: z.object({ id: z.string(), name: z.string() }).nullable(),
  account: GlRefSchema,
  imprestAmount: z.number().nullable(),
  varianceTolerance: z.number(),
  approvalThreshold: z.number(),
  isActive: z.boolean(),
  /** Balance today; 0 until vouchers post (Phase 16). */
  balance: z.number(),
  rowVersion: z.number().int(),
});
export type CashAccount = z.infer<typeof CashAccountSchema>;

const CashAccountFields = {
  name: z.string().trim().min(2, 'Name the cash account').max(120),
  shortName: optionalText(40),
  kind: z.string().min(1).default('DRAWER'),
  branchId: z.uuid('Choose the branch'),
  custodianUserId: z.uuid().optional().nullable().transform((v) => v ?? null),
  imprestAmount: optionalAmount,
  varianceTolerance: z.coerce.number().min(0).max(100_000_000).default(1000),
  approvalThreshold: z.coerce.number().min(0).max(100_000_000_000).default(50000),
};
/** Same as cashAccountImprestChk. */
export function cashAccountErrors(a: { kind: string; imprestAmount: number | null }): Record<string, string> {
  return (a.kind === 'PETTY' || a.kind === 'IMPREST') && !a.imprestAmount ? { imprestAmount: 'Enter the imprest amount' } : {};
}
export const CashAccountCreateSchema = z.object({ ...CashAccountFields, gl: GlLinkSchema.default({ mode: 'create', parentId: null }) }).superRefine((a, ctx) => {
  for (const [path, message] of Object.entries(cashAccountErrors(a))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type CashAccountCreate = z.infer<typeof CashAccountCreateSchema>;
export type CashAccountCreateFields = z.input<typeof CashAccountCreateSchema>;
export const CashAccountUpdateSchema = patchFields(CashAccountFields).extend(RowVersionSchema.shape);
export type CashAccountUpdate = z.infer<typeof CashAccountUpdateSchema>;

// ---------------------------------------------------------------- Cash categories
export const CashCategorySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  direction: z.string(),
  voucherType: z.string(),
  defaultAccount: GlRefSchema.nullable(),
  partyKind: z.string(),
  icon: z.string().nullable(),
  colorToken: z.string().nullable(),
  sortOrder: z.number().int(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  rowVersion: z.number().int(),
});
export type CashCategory = z.infer<typeof CashCategorySchema>;

const CashCategoryFields = {
  code: masterCode(30),
  name: z.string().trim().min(2, 'Name the category').max(80),
  direction: z.string().min(1),
  voucherType: z.string().min(1),
  defaultAccountId: z.uuid().optional().nullable().transform((v) => v ?? null),
  partyKind: z.string().min(1).default('NONE'),
  icon: optionalText(40),
  colorToken: optionalText(20),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};
export const CashCategoryCreateSchema = z.object(CashCategoryFields);
export type CashCategoryCreate = z.infer<typeof CashCategoryCreateSchema>;
export type CashCategoryCreateFields = z.input<typeof CashCategoryCreateSchema>;
export const CashCategoryUpdateSchema = patchFields(CashCategoryFields).extend(RowVersionSchema.shape);
export type CashCategoryUpdate = z.infer<typeof CashCategoryUpdateSchema>;

// ---------------------------------------------------------------- Expense categories
export const ExpenseCategorySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  appliesTo: z.string(),
  account: GlRefSchema,
  limitAmount: z.number().nullable(),
  limitPeriod: z.string().nullable(),
  requiresPreApproval: z.boolean(),
  receiptRequired: z.boolean(),
  submitWithinDays: z.number().int().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  rowVersion: z.number().int(),
});
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

const ExpenseCategoryFields = {
  code: masterCode(30),
  name: z.string().trim().min(2, 'Name the category').max(80),
  appliesTo: z.string().min(1).default('BOTH'),
  accountId: z.uuid('Choose the expense account'),
  limitAmount: optionalAmount,
  limitPeriod: z.string().optional().nullable().transform((v) => (v ? v : null)),
  requiresPreApproval: z.boolean().default(false),
  receiptRequired: z.boolean().default(true),
  submitWithinDays: z.coerce.number().int().min(1).max(365).optional().nullable().transform((v) => v ?? null),
  icon: optionalText(40),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
};
/** Same as expenseCategoryLimitChk: a limit needs its period and the other way round. */
export function expenseCategoryErrors(c: { limitAmount: number | null; limitPeriod: string | null }): Record<string, string> {
  if (c.limitAmount && !c.limitPeriod) return { limitPeriod: 'Choose the limit period' };
  if (!c.limitAmount && c.limitPeriod) return { limitAmount: 'Enter the limit' };
  return {};
}
export const ExpenseCategoryCreateSchema = z.object(ExpenseCategoryFields).superRefine((c, ctx) => {
  for (const [path, message] of Object.entries(expenseCategoryErrors(c))) ctx.addIssue({ code: 'custom', path: [path], message });
});
export type ExpenseCategoryCreate = z.infer<typeof ExpenseCategoryCreateSchema>;
export type ExpenseCategoryCreateFields = z.input<typeof ExpenseCategoryCreateSchema>;
export const ExpenseCategoryUpdateSchema = patchFields(ExpenseCategoryFields).extend(RowVersionSchema.shape);
export type ExpenseCategoryUpdate = z.infer<typeof ExpenseCategoryUpdateSchema>;
