import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const money = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000_000);
type Ref = { id: string; code: string; name: string };
type Who = { id: string; name: string } | null;

// ---------------------------------------------------------------- vouchers
export const VOUCHER_TYPES = ['JV', 'CPV', 'CRV', 'BPV', 'BRV', 'CON'] as const;
/** Cash / bank vouchers are one-sided: the user enters the other side and the cash / bank leg is added automatically. */
export const ONE_SIDED: Record<string, 'DEBIT' | 'CREDIT'> = { CPV: 'DEBIT', BPV: 'DEBIT', CRV: 'CREDIT', BRV: 'CREDIT' };
export const REVERSAL_REASONS = ['INCORRECT_AMOUNT', 'WRONG_ACCOUNT', 'DUPLICATE', 'WRONG_PERIOD', 'OTHER'] as const;

export type VoucherLine = {
  id: string; lineNo: number; account: Ref & { accountClass: number }; particulars: string | null; debit: number; credit: number;
  costCentre: Ref | null; isAutoContra: boolean;
};
export type VoucherListItem = {
  id: string; docNo: string; voucherType: string; docDate: string; postingDate: string; narration: string; referenceNo: string | null;
  branch: Ref; totalDebit: number; totalCredit: number; status: string; partyName: string | null; preparedBy: Who;
  reversedBy: string | null; reversalOf: string | null; sourceDocType: string | null; lineCount: number;
};
export type VoucherList = {
  items: VoucherListItem[]; total: number;
  kpis: { count: number; totalDebit: number; pending: number; drafts: number };
  typeCounts: Record<string, number>;
};
export type VoucherActivity = { id: string; occurredAt: string; user: Who; action: string; detail: string | null };
export type Voucher = VoucherListItem & {
  fiscalPeriod: { id: string; code: string; status: string } | null; department: string | null; currencyCode: string; remarks: string | null; tags: string[];
  cashBankAccount: Ref | null; instrumentType: string | null; instrumentNo: string | null; instrumentDate: string | null; autoReverseOn: string | null;
  submittedAt: string | null; approvedBy: Who; approvedAt: string | null; postedBy: Who; postedAt: string | null;
  reversalReason: string | null; reversalRemarks: string | null; reversalDate: string | null; reversedById: string | null; reversalOfId: string | null;
  recurringTemplate: { id: string; name: string } | null;
  lines: VoucherLine[]; activities: VoucherActivity[];
  /** The approval request (once submitted) or, for a draft, the workflow it would be routed to. */
  approval: ApprovalDetail | null; routing: { workflow: { id: string; name: string }; steps: ApprovalStep[] } | null;
  rowVersion: number;
};

export const VoucherLineSchema = z.object({
  id: z.uuid().optional(),
  accountId: z.uuid('Choose the account'),
  particulars: optionalText(200),
  debit: money.default(0),
  credit: money.default(0),
  costCentreId: optionalId,
});
export type VoucherLineInput = z.infer<typeof VoucherLineSchema>;
export const VoucherSchema = z.object({
  voucherType: z.enum(VOUCHER_TYPES),
  docDate: z.iso.date('Use a date'),
  postingDate: z.iso.date('Use a date'),
  referenceNo: optionalText(60),
  branchId: z.uuid('Choose the branch'),
  department: optionalText(60),
  narration: z.string().trim().min(1, 'Narration is required').max(300, 'At most 300 characters'),
  remarks: optionalText(500),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  cashBankAccountId: optionalId,
  partyName: optionalText(120),
  instrumentType: z.string().trim().max(30).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  instrumentNo: optionalText(40),
  instrumentDate: optionalDate,
  autoReverseOn: optionalDate,
  lines: z.array(VoucherLineSchema).max(500),
});
export type VoucherInput = z.infer<typeof VoucherSchema>;

/** Field rules shared by the editor and the API (the DB re-checks on posting). Cash / bank lines are one-sided. */
export function voucherErrors(v: Pick<VoucherInput, 'voucherType' | 'cashBankAccountId' | 'lines' | 'autoReverseOn' | 'postingDate' | 'instrumentType' | 'instrumentNo'>): Record<string, string> {
  const e: Record<string, string> = {};
  const side = ONE_SIDED[v.voucherType];
  if (side && !v.cashBankAccountId) e.cashBankAccountId = v.voucherType.startsWith('C') ? 'Choose the cash account' : 'Choose the bank account';
  if (!side && v.cashBankAccountId) e.cashBankAccountId = 'Only cash and bank vouchers have a cash / bank account';
  v.lines.forEach((l, i) => {
    if ((l.debit > 0) === (l.credit > 0)) e[`lines.${i}.debit`] = 'Enter a debit or a credit';
    else if (side === 'DEBIT' && l.credit > 0) e[`lines.${i}.debit`] = 'Payments are entered as debits';
    else if (side === 'CREDIT' && l.debit > 0) e[`lines.${i}.credit`] = 'Receipts are entered as credits';
  });
  if (!e.lines) {
    if (side ? v.lines.length < 1 : v.lines.length < 2) e.lines = side ? 'Add at least one line' : 'Add at least two lines';
    else if (!side) {
      const dr = v.lines.reduce((s, l) => s + l.debit, 0);
      const cr = v.lines.reduce((s, l) => s + l.credit, 0);
      if (Math.round(dr * 100) !== Math.round(cr * 100)) e.lines = `Unbalanced: debit ${dr.toFixed(2)} vs credit ${cr.toFixed(2)}`;
    }
  }
  if (v.autoReverseOn && (v.voucherType !== 'JV' || v.autoReverseOn <= v.postingDate)) e.autoReverseOn = 'Only a JV, and after its posting date';
  if (v.instrumentNo && !v.instrumentType) e.instrumentType = 'Choose the instrument type';
  return e;
}
export const ReverseSchema = z.object({
  reversalDate: z.iso.date('Use a date'),
  reason: z.enum(REVERSAL_REASONS, 'Choose the reason'),
  remarks: optionalText(300),
  rowVersion: z.coerce.number().int().min(0),
});
export const VoucherListQuerySchema = z.object({
  from: z.iso.date().optional(), to: z.iso.date().optional(), type: z.string().trim().max(10).optional(), status: z.string().trim().max(20).optional(),
  branch: z.uuid().optional(), search: z.string().trim().max(100).optional(), mine: z.coerce.boolean().optional(), minAmount: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(14),
});
export type VoucherListQuery = z.infer<typeof VoucherListQuerySchema>;
export type GlOptions = {
  accounts: (Ref & { accountClass: number; nature: string })[];
  cashAccounts: (Ref & { accountId: string; branchId: string | null })[];
  bankAccounts: (Ref & { accountId: string; branchId: string | null })[];
  costCentres: Ref[];
  branches: Ref[];
  periods: { id: string; code: string; startDate: string; endDate: string; status: string; fiscalYearId: string }[];
  fiscalYears: { id: string; code: string; startDate: string; endDate: string; status: string }[];
  templates: { id: string; name: string; voucherType: string }[];
  nextNumbers: Record<string, string | null>;
};

// ---------------------------------------------------------------- approvals
export type ApprovalStep = {
  stepNo: number; name: string; mode: string; appliesAboveAmount: number | null; approvers: { id: string; name: string }[];
  state: 'done' | 'current' | 'waiting' | 'skipped'; actedBy: { id: string; name: string; at: string }[];
};
export type ApprovalActionItem = { id: string; stepNo: number; action: string; actor: Who; onBehalfOf: Who; delegateTo: Who; reason: string | null; comment: string | null; actedAt: string };
export type ApprovalItem = {
  id: string; entityType: string; entityId: string; docLabel: string; title: string | null; amount: number | null; currencyCode: string;
  branch: Ref | null; requestedBy: { id: string; name: string }; requestedAt: string; status: string; currentStepNo: number | null;
  currentStepDueAt: string | null; workflow: { id: string; name: string }; link: string; canAct: boolean;
};
export type ApprovalComment = { id: string; by: Who; at: string; text: string };
export type ApprovalDetail = ApprovalItem & { steps: ApprovalStep[]; actions: ApprovalActionItem[]; lines: { account: string; particulars: string | null; debit: number; credit: number }[]; comments: ApprovalComment[] };
export type ApprovalInbox = {
  items: ApprovalItem[];
  kpis: { waiting: number; breached: number; valuePending: number; approvedToday: number; oldestHours: number | null };
  mine: ApprovalItem[];
};
export const ApprovalActSchema = z.object({ reason: optionalText(500), comment: optionalText(1000) });
export const DelegateSchema = z.object({ userId: z.uuid('Choose the person'), comment: optionalText(1000) });
export const BulkApproveSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200), action: z.enum(['approve', 'reject']), reason: optionalText(500) });

// ---------------------------------------------------------------- opening balances
export type OpeningBatch = {
  id: string | null; fiscalYear: { id: string; code: string; startDate: string }; asAtDate: string; branch: Ref; suspenseAccount: Ref | null;
  totalDebit: number; totalCredit: number; difference: number; status: string; voucher: { id: string; docNo: string } | null;
  postedAt: string | null; postedBy: Who; remarks: string | null;
  lines: { id: string; account: Ref & { accountClass: number }; debit: number; credit: number; remarks: string | null }[];
  rowVersion: number | null;
};
export const OpeningSchema = z.object({
  fiscalYearId: z.uuid(),
  branchId: z.uuid('Choose the branch'),
  suspenseAccountId: optionalId,
  remarks: optionalText(300),
  lines: z.array(z.object({ id: z.uuid().optional(), accountId: z.uuid('Choose the account'), debit: money.default(0), credit: money.default(0), remarks: optionalText(120) })).max(5000),
  rowVersion: z.coerce.number().int().min(0).nullable().optional(),
});
export type OpeningInput = z.infer<typeof OpeningSchema>;

// ---------------------------------------------------------------- recurring vouchers
export const RECURRING_TYPES = ['JV', 'BPV', 'CPV'] as const;
export type RecurringTemplate = {
  id: string; name: string; description: string | null; voucherType: string; frequency: string; runDay: number | null; runOnLastDay: boolean;
  runWeekday: number | null; runMonth: number | null; startDate: string | null; endMode: string; endAfterCount: number | null; endOnDate: string | null;
  branch: Ref; narration: string; cashBankAccount: Ref | null; partyName: string | null; amount: number; autoPost: boolean; notifyOnFailure: boolean;
  notifyUser: Who; nextRunDate: string | null; lastRunDate: string | null; occurrencesDone: number; status: string; lastError: string | null;
  lines: { id: string; account: Ref; narration: string | null; debit: number; credit: number; costCentre: Ref | null }[];
  rowVersion: number;
};
export type RecurringRun = { id: string; scheduledDate: string; runAt: string; triggerType: string; status: string; voucher: { id: string; docNo: string } | null; errorMessage: string | null };
export const RecurringSchema = z.object({
  name: z.string().trim().min(2, 'Name the template').max(80),
  description: optionalText(200),
  voucherType: z.enum(RECURRING_TYPES),
  frequency: z.enum(['NONE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  runDay: z.coerce.number().int().min(1).max(31).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  runOnLastDay: z.boolean().default(false),
  runWeekday: z.coerce.number().int().min(1).max(7).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  runMonth: z.coerce.number().int().min(1).max(12).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  startDate: optionalDate,
  endMode: z.enum(['NEVER', 'AFTER_N', 'ON_DATE']).default('NEVER'),
  endAfterCount: z.coerce.number().int().min(1).max(1000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  endOnDate: optionalDate,
  branchId: z.uuid('Choose the branch'),
  narration: z.string().trim().min(1, 'Narration is required').max(300),
  cashBankAccountId: optionalId,
  partyName: optionalText(120),
  autoPost: z.boolean().default(true),
  notifyOnFailure: z.boolean().default(true),
  lines: z.array(VoucherLineSchema.extend({ particulars: optionalText(200) })).min(1, 'Add the lines').max(200),
});
export type RecurringInput = z.infer<typeof RecurringSchema>;
/** The DB checks: schedule fields per frequency, end mode, cash / bank account for BPV / CPV, balanced JV lines. */
export function recurringErrors(r: RecurringInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (r.frequency !== 'NONE' && !r.startDate) e.startDate = 'Choose the start date';
  if (r.frequency === 'WEEKLY' && !r.runWeekday) e.runWeekday = 'Choose the weekday';
  if ((r.frequency === 'MONTHLY' || r.frequency === 'QUARTERLY') && !r.runDay && !r.runOnLastDay) e.runDay = 'Choose the day';
  if (r.frequency === 'YEARLY' && ((!r.runDay && !r.runOnLastDay) || !r.runMonth)) e.runDay = 'Choose the day and month';
  if (r.runOnLastDay && r.runDay) e.runDay = 'Either a day or the last day';
  if (r.endMode === 'AFTER_N' && !r.endAfterCount) e.endAfterCount = 'How many runs?';
  if (r.endMode === 'ON_DATE' && !r.endOnDate) e.endOnDate = 'Choose the end date';
  Object.assign(e, voucherErrors({ voucherType: r.voucherType, cashBankAccountId: r.cashBankAccountId, lines: r.lines, autoReverseOn: null, postingDate: r.startDate ?? '2000-01-01', instrumentType: null, instrumentNo: null }));
  return e;
}

// ---------------------------------------------------------------- reports
export type TrialBalanceRow = { accountId: string; code: string; name: string; accountClass: number; className: string; level: number; kind: string; openingDr: number; openingCr: number; movementDr: number; movementCr: number; closingDr: number; closingCr: number };
export type GlRow = { rowKind: string; accountId: string; accountCode: string; accountName: string; postingDate: string | null; voucherId: string | null; docNo: string | null; voucherType: string | null; description: string | null; debit: number; credit: number; balance: number; nature: string };
export type DayBookRow = { voucherId: string; docNo: string; voucherType: string; postedAt: string; narration: string; by: string | null; debitAccount: string; debit: number; credit: number };
export const ReportQuerySchema = z.object({
  from: z.iso.date().optional(), to: z.iso.date().optional(), date: z.iso.date().optional(), branch: z.uuid().optional(), account: z.uuid().optional(),
  level: z.coerce.number().int().min(1).max(4).default(4), zero: z.coerce.boolean().default(false),
});
export type ReportQuery = z.infer<typeof ReportQuerySchema>;
export const RowVersionOnly = RowVersionSchema;
