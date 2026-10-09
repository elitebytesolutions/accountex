import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from './common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const positive = z.coerce.number('Enter an amount').positive('More than 0').max(100_000_000_000);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;

// ---------------------------------------------------------------- options
export type CashOptions = {
  cashAccounts: { id: string; code: string; name: string; kind: string | null; branchId: string; accountId: string; balance: number; varianceTolerance: number; approvalThreshold: number | null; custodianUserId: string | null; custodianName: string | null }[];
  bankAccounts: { id: string; title: string; last4: string | null; accountId: string | null; branchId: string; balance: number }[];
  categories: { id: string; code: string; name: string; direction: string; voucherType: string; defaultAccountId: string | null; partyKind: string; icon: string | null }[];
  expenseCategories: { id: string; code: string; name: string; accountId: string; limitAmount: number | null; limitPeriod: string | null; receiptRequired: boolean; requiresPreApproval: boolean; icon: string | null }[];
  accounts: (Ref & { accountClass: number })[];
  costCentres: Ref[];
  branches: Ref[];
  customers: Ref[];
  vendors: Ref[];
  employees: Ref[];
  banks: Ref[];
  pettyFunds: { id: string; name: string; branchId: string; cashAccountId: string; imprestAmount: number; status: string; cashOnHand: number; unreplenishedCount: number; unreplenishedTotal: number }[];
  postingRoles: Record<string, Ref | null>;
};

// ---------------------------------------------------------------- cash book entries
export const CASH_ENTRY_KINDS = ['CASH_IN', 'CASH_OUT', 'BANK_IN', 'BANK_OUT', 'CHEQUE_IN', 'CHEQUE_OUT', 'TRANSFER'] as const;
export const ENTRY_PAYMENT_MODES: Record<string, string[]> = {
  CASH_IN: ['CASH', 'CARD'], CASH_OUT: ['CASH', 'CARD'], BANK_IN: ['IBFT', 'RAAST', 'BANK_TRANSFER', 'DEBIT_CARD'], BANK_OUT: ['IBFT', 'RAAST', 'BANK_TRANSFER', 'DEBIT_CARD'],
  CHEQUE_IN: ['CHEQUE'], CHEQUE_OUT: ['CHEQUE'], TRANSFER: [],
};
const EntryFields = z.object({
  kind: z.enum(CASH_ENTRY_KINDS),
  entryDate: z.iso.date('Use a date'),
  entryTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  cashAccountId: optionalId,
  bankAccountId: optionalId,
  toCashAccountId: optionalId,
  toBankAccountId: optionalId,
  categoryId: optionalId,
  /** The other side of the entry; defaults to the category's account. */
  accountId: optionalId,
  paymentMode: z.string().trim().max(20).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  partyName: optionalText(160),
  customerId: optionalId,
  vendorId: optionalId,
  employeeId: optionalId,
  referenceNo: optionalText(60),
  amount: positive,
  narration: optionalText(300),
  costCentreId: optionalId,
  /** Cheque mode (CHEQUE_IN / CHEQUE_OUT): recorded as a Phase 17 cheque. */
  chequeNo: z.string().trim().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  chequeDate: optionalDate,
  drawnOnBankId: optionalId,
  chequeBookId: optionalId,
  isPdc: z.boolean().default(false),
});
/** The cash book's own rules (the table's checks), shared by the form and the API. */
export function cashEntryErrors(e: z.infer<typeof EntryFields>): Record<string, string> {
  const x: Record<string, string> = {};
  const cashSide = e.kind === 'CASH_IN' || e.kind === 'CASH_OUT';
  const bankSide = ['BANK_IN', 'BANK_OUT', 'CHEQUE_IN', 'CHEQUE_OUT'].includes(e.kind);
  if (cashSide && !e.cashAccountId) x.cashAccountId = 'Choose the cash account';
  if (bankSide && !e.bankAccountId) x.bankAccountId = 'Choose the bank account';
  if (e.kind === 'TRANSFER') {
    if (!!e.cashAccountId === !!e.bankAccountId) x.cashAccountId = 'Choose the account the money leaves';
    if (!!e.toCashAccountId === !!e.toBankAccountId) x.toCashAccountId = 'Choose the account the money goes to';
    if ((e.cashAccountId && e.cashAccountId === e.toCashAccountId) || (e.bankAccountId && e.bankAccountId === e.toBankAccountId)) x.toCashAccountId = 'From and to must differ';
  } else {
    if (!e.partyName) x.partyName = 'Enter the party';
    if (!e.categoryId && !e.accountId) x.categoryId = 'Choose the category';
    const modes = ENTRY_PAYMENT_MODES[e.kind] ?? [];
    if (!e.paymentMode || !modes.includes(e.paymentMode)) x.paymentMode = 'Choose the payment mode';
  }
  if (e.kind === 'CHEQUE_IN' || e.kind === 'CHEQUE_OUT') {
    if (!e.chequeNo || !/^[0-9]{4,10}$/.test(e.chequeNo)) x.chequeNo = '4–10 digits';
    if (!e.chequeDate) x.chequeDate = 'Choose the cheque date';
  }
  if ([e.customerId, e.vendorId, e.employeeId].filter(Boolean).length > 1) x.customerId = 'One party only';
  return x;
}
export const CashEntrySchema = EntryFields.superRefine((e, ctx) => { for (const [path, message] of Object.entries(cashEntryErrors(e))) ctx.addIssue({ code: 'custom', path: [path], message }); });
export type CashEntryInput = z.infer<typeof CashEntrySchema>;
export const CashReverseSchema = z.object({ date: z.iso.date('Use a date'), reason: z.enum(['INCORRECT_AMOUNT', 'WRONG_ACCOUNT', 'DUPLICATE', 'WRONG_PERIOD', 'OTHER']).default('OTHER'), remarks: optionalText(300) });
export type CashEntry = {
  id: string; kind: string; entryDate: string; entryTime: string | null; branch: Ref; cashAccount: Ref | null; bankAccount: { id: string; title: string } | null;
  toCashAccount: Ref | null; toBankAccount: { id: string; title: string } | null; category: { id: string; code: string; name: string; icon: string | null } | null;
  paymentMode: string | null; partyName: string | null; referenceNo: string | null; amount: number; narration: string | null;
  cheque: { id: string; docNo: string; chequeNo: string; status: string } | null; voucher: VoucherRef; createdBy: Who; createdAt: string; rowVersion: number;
};
export type CashBook = {
  kpis: { liquid: number; mainDrawer: { name: string; balance: number } | null; bank: number; bankCount: number; petty: number; pettyImprest: number };
  entries: CashEntry[];
  glance: { cashIn: number; cashOut: number; topCategories: { name: string; amount: number; direction: string }[] };
};

// ---------------------------------------------------------------- cash ledger + day close
export type CashLedgerRow = {
  date: string; time: string | null; entryId: string | null; voucher: VoucherRef; particulars: string; contra: { code: string; name: string } | null; category: string | null;
  receipt: number; payment: number; balance: number; narration: string | null; createdBy: Who;
};
export type CashLedgerDay = { date: string; rows: CashLedgerRow[]; receipts: number; payments: number; closing: number; close: { id: string; status: string; varianceAmount: number } | null };
export type CashLedger = {
  account: { id: string; code: string; name: string; glCode: string; custodian: Who; varianceTolerance: number };
  from: string; to: string; opening: number; receipts: number; payments: number; closing: number; count: number; days: CashLedgerDay[];
  categories: { name: string; amount: number }[];
};
export const NOTE_VALUES = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1] as const;
export type CashDayClose = {
  id: string | null; cashAccountId: string; closeDate: string; bookBalance: number; countedAmount: number; varianceAmount: number; status: string;
  lockedBy: Who; lockedAt: string | null; varianceVoucher: VoucherRef; remarks: string | null; denominations: { noteValue: number; qty: number }[];
  tolerance: number; receipts: number; payments: number; rowVersion: number | null;
};
export const DayCountSchema = z.object({
  cashAccountId: z.uuid('Choose the cash account'),
  closeDate: z.iso.date('Use a date'),
  denominations: z.array(z.object({ noteValue: z.union(NOTE_VALUES.map((n) => z.literal(n)) as [z.ZodLiteral<5000>, ...z.ZodLiteral<number>[]]), qty: z.coerce.number().int().min(0).max(1_000_000) })).max(10),
  remarks: optionalText(300),
  rowVersion: z.coerce.number().int().min(0).nullable().optional(),
});
export type DayCountInput = z.infer<typeof DayCountSchema>;
export const countTotal = (d: { noteValue: number; qty: number }[]) => d.reduce((s, x) => s + x.noteValue * x.qty, 0);

// ---------------------------------------------------------------- petty cash
export type PettyVoucher = {
  id: string; docNo: string; docDate: string; fund: { id: string; name: string }; category: { id: string; code: string; name: string; icon: string | null };
  description: string; paidTo: string; amount: number; account: Ref; costCentre: Ref | null; receiptStatus: string; receiptCount: number; status: string;
  replenishment: { id: string; docDate: string; voucher: VoucherRef } | null; recordedBy: Who; rowVersion: number;
};
export type PettyVoucherList = { items: PettyVoucher[]; total: number; byCategory: { name: string; amount: number }[]; pending: { count: number; total: number } };
export const PettyVoucherQuerySchema = z.object({
  fund: z.uuid().optional(), status: z.string().trim().max(20).optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export const PettyVoucherSchema = z.object({
  fundId: z.uuid('Choose the fund'),
  docDate: z.iso.date('Use a date'),
  categoryId: z.uuid('Choose the category'),
  description: z.string().trim().min(2, 'Describe the expense').max(300),
  paidTo: z.string().trim().min(1, 'Who was paid?').max(160),
  amount: positive,
  accountId: optionalId,
  costCentreId: optionalId,
  receiptStatus: z.enum(['ATTACHED', 'MISSING', 'NA']).default('MISSING'),
  receiptCount: z.coerce.number().int().min(0).max(50).default(0),
}).refine((v) => (v.receiptStatus === 'ATTACHED') === (v.receiptCount > 0), { path: ['receiptCount'], message: 'Receipts held: count above 0' });
export type PettyVoucherInput = z.infer<typeof PettyVoucherSchema>;
export const ReplenishSchema = z.object({
  docDate: z.iso.date('Use a date'),
  payFromCashAccountId: optionalId,
  payFromBankAccountId: optionalId,
  amount: positive,
  postTogether: z.boolean().default(true),
  remarks: optionalText(300),
}).refine((r) => !!r.payFromCashAccountId !== !!r.payFromBankAccountId, { path: ['payFromCashAccountId'], message: 'Pay from a cash or a bank account' });
export type ReplenishInput = z.infer<typeof ReplenishSchema>;
export type PettyReplenishment = {
  id: string; fund: { id: string; name: string }; docDate: string; payFrom: { kind: 'CASH' | 'BANK'; id: string; name: string }; amount: number; voucherCount: number;
  vouchersTotal: number; status: string; voucher: VoucherRef; remarks: string | null; createdBy: Who; rowVersion: number;
};

// ---------------------------------------------------------------- expense claims
export const CLAIM_REJECT_REASONS = ['MISSING_RECEIPT', 'EXCEEDS_POLICY', 'NOT_BUSINESS', 'DUPLICATE', 'WRONG_COST_CENTRE', 'OTHER'] as const;
export const ClaimLineSchema = z.object({
  id: z.uuid().optional(),
  expenseDate: optionalDate,
  description: z.string().trim().min(1, 'Describe the item').max(200),
  categoryId: optionalId,
  merchant: optionalText(120),
  amount: positive,
  costCentreId: optionalId,
});
export const ClaimSchema = z.object({
  title: z.string().trim().min(2, 'Give the claim a title').max(120),
  merchant: optionalText(120),
  categoryId: z.uuid('Choose the category'),
  costCentreId: optionalId,
  tripFrom: optionalDate,
  tripTo: optionalDate,
  customerId: optionalId,
  travelRequestRef: optionalText(40),
  receiptCount: z.coerce.number().int().min(0).max(50).default(0),
  policyJustification: optionalText(500),
  lines: z.array(ClaimLineSchema).min(1, 'Add at least one item').max(50),
}).refine((c) => !c.tripFrom || !c.tripTo || c.tripTo >= c.tripFrom, { path: ['tripTo'], message: 'On or after the start' });
export type ClaimInput = z.infer<typeof ClaimSchema>;
export const ClaimUpdateSchema = ClaimSchema.and(RowVersionSchema);
export const ClaimRejectSchema = z.object({ reason: z.enum(CLAIM_REJECT_REASONS, 'Choose the reason'), comment: optionalText(500), allowResubmit: z.boolean().default(true) });
export const ClaimPaySchema = z.object({
  method: z.enum(['CASH', 'BANK_TRANSFER']),
  cashAccountId: optionalId,
  bankAccountId: optionalId,
  date: z.iso.date('Use a date'),
}).refine((p) => (p.method === 'CASH' ? !!p.cashAccountId : !!p.bankAccountId), { path: ['cashAccountId'], message: 'Choose the account it is paid from' });
export type ClaimPayInput = z.infer<typeof ClaimPaySchema>;
export const ClaimQuerySchema = z.object({
  status: z.string().trim().max(20).optional(), department: z.uuid().optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
/** What an employee needs to file a claim (no cash:view required). `usedThisMonth` is per category, submitted or later. */
export type MyClaimOptions = {
  categories: { id: string; code: string; name: string; icon: string | null; limitAmount: number | null; limitPeriod: string | null; receiptRequired: boolean; requiresPreApproval: boolean; usedThisMonth: number }[];
  costCentres: Ref[];
};
export type ClaimPolicy = { limitAmount: number | null; limitPeriod: string | null; usedInPeriod: number; isOver: boolean; message: string };
export type ExpenseClaim = {
  id: string; docNo: string; docDate: string; submittedAt: string | null; employee: { id: string; code: string; name: string; department: string | null };
  branch: Ref; source: string; title: string; merchant: string | null; tripFrom: string | null; tripTo: string | null;
  category: { id: string; code: string; name: string; icon: string | null }; costCentre: Ref | null; customer: Ref | null; chargeAccount: Ref | null;
  travelRequestRef: string | null; totalAmount: number; approvedAmount: number | null; receiptCount: number; policyLimitAmount: number | null; policyLimitPeriod: string | null;
  isOverPolicy: boolean; policyJustification: string | null; status: string; workflowStage: string; approvedBy: Who; approvedAt: string | null;
  rejectionReason: string | null; rejectionComment: string | null; allowResubmit: boolean; resubmittedFrom: { id: string; docNo: string } | null;
  paymentMethod: string | null; paidAt: string | null; approvalVoucher: VoucherRef; paymentVoucher: VoucherRef; rowVersion: number;
  lines: { id: string; lineNo: number; expenseDate: string | null; description: string; category: { id: string; name: string } | null; merchant: string | null; amount: number; costCentre: Ref | null }[];
  actions: { id: string; action: string; stage: string; actor: Who; actedAt: string; comment: string | null }[];
  approvalId: string | null;
  canAct: boolean;
};
export type ExpenseClaimList = {
  items: Omit<ExpenseClaim, 'lines' | 'actions' | 'approvalId' | 'canAct'>[]; total: number; counts: Record<string, number>;
  kpis: { awaiting: number; awaitingAmount: number; approvedUnpaid: number; approvedUnpaidAmount: number; paidThisMonth: number; overPolicy: number };
};
/** Within / near / over the category's limit (near = 80 % or more). */
export function claimPolicyCheck(limit: number | null, period: string | null, amount: number, usedInPeriod = 0): ClaimPolicy {
  if (!limit) return { limitAmount: null, limitPeriod: period, usedInPeriod, isOver: false, message: 'No limit for this category' };
  const basis = period === 'PER_MONTH' ? usedInPeriod + amount : amount;
  const isOver = basis > limit;
  const near = !isOver && basis >= limit * 0.8;
  const per = { PER_CLAIM: 'per claim', PER_TRIP: 'per trip', PER_DAY: 'per day', PER_NIGHT: 'per night', PER_MEAL: 'per meal', PER_MONTH: 'per month' }[period ?? ''] ?? '';
  return { limitAmount: limit, limitPeriod: period, usedInPeriod, isOver, message: isOver ? `Over the ${limit.toLocaleString('en-PK')} ${per} limit` : near ? `Near the ${limit.toLocaleString('en-PK')} ${per} limit` : `Within the ${limit.toLocaleString('en-PK')} ${per} limit` };
}
