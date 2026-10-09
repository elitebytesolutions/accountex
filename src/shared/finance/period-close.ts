import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const rowVersion = z.coerce.number().int().min(0);
type Who = { id: string; name: string } | null;
type VoucherRef = { id: string; docNo: string; voucherType: string; status: string } | null;

// ---------------------------------------------------------------- period reopen requests
export const PERIOD_REOPEN_MODULES = ['GL', 'AR', 'AP', 'INV', 'PAY'] as const;
export const ReopenRequestInputSchema = z.object({
  fiscalPeriodId: z.uuid('Choose the period'),
  /** One module only; empty reopens the whole period. */
  moduleCode: z.enum(PERIOD_REOPEN_MODULES).optional().nullable(),
  reopenUntil: z.iso.datetime({ offset: true, message: 'Enter until when' }).or(z.iso.date('Enter until when')),
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(500),
  /** Who should approve (someone with close:approve, not you). */
  approverUserId: z.uuid('Choose the approver'),
  autoReclose: z.boolean().default(true),
});
export type ReopenRequestInput = z.input<typeof ReopenRequestInputSchema>;
export const ReopenDecisionSchema = z.object({ comment: optionalText(500) });
export type ReopenRequest = {
  id: string; period: { id: string; code: string; startDate: string; endDate: string; fiscalYear: string }; moduleCode: string | null; previousStatus: string;
  reopenUntil: string; reason: string; autoReclose: boolean;
  /** PENDING, APPROVED, REJECTED, RECLOSED, CANCELLED */
  status: string; requestedBy: Who; requestedAt: string; approver: Who; decidedAt: string | null; reclosedAt: string | null; rowVersion: number;
};

// ---------------------------------------------------------------- year-end close
export type YearEndCheck = { key: string; label: string; detail: string; state: 'ok' | 'warn' | 'block'; count: number; link: string | null };
export type YearEndAdjustment = {
  id: string; description: string; debitAccount: { id: string; code: string; name: string }; creditAccount: { id: string; code: string; name: string }; amount: number;
  /** PROPOSED, AWAITING_INPUT, POSTED, EXCLUDED */
  status: string; journal: VoucherRef; rowVersion: number;
};
export type YearEndRun = {
  id: string; runMode: string; status: string; asAtDate: string; checksTotal: number; checksPassed: number; checksWarning: number; netProfit: number | null;
  retainedOpening: number | null; retainedClosing: number | null; journal: VoucherRef; runBy: Who; runAt: string | null; rowVersion: number;
};
export type YearEnd = {
  fiscalYear: { id: string; code: string; startDate: string; endDate: string; status: string; isLocked: boolean; closing: VoucherRef };
  periods: { id: string; code: string; status: string }[];
  checklist: YearEndCheck[];
  /** Year to date from the ledger (closing entry excluded). */
  figures: { revenue: number; expenses: number; netProfit: number; retainedOpening: number; retainedClosing: number; retainedEarningsAccount: { id: string; code: string; name: string } | null };
  /** Each income / expense account's closing line (Dr income, Cr expense; the balance goes to retained earnings). */
  closingLines: { account: { id: string; code: string; name: string }; debit: number; credit: number }[];
  adjustments: YearEndAdjustment[];
  runs: YearEndRun[];
};
export const YearEndAdjustmentInputSchema = z.object({
  description: z.string().trim().min(3, 'Describe the adjustment').max(300),
  debitAccountId: z.uuid('Choose the debit account'),
  creditAccountId: z.uuid('Choose the credit account'),
  amount: z.coerce.number().positive('More than 0').max(100_000_000_000),
}).refine((a) => a.debitAccountId !== a.creditAccountId, { message: 'Debit and credit accounts must differ', path: ['creditAccountId'] });
export const YearEndCancelSchema = z.object({ rowVersion, reason: z.string().trim().min(3, 'Give a reason').max(500) });
export const YearEndRunSchema = z.object({ acknowledgeWarnings: z.boolean().default(false) });

// ---------------------------------------------------------------- reminder runs (outbox)
export type ReminderDue = {
  invoice: { id: string; docNo: string; dueDate: string }; customer: { id: string; code: string; name: string }; balance: number; daysOverdue: number;
  rule: { id: string; name: string } | null; dunningLevel: string | null; channels: string[]; recipientMobile: string | null; recipientEmail: string | null; isDueNow: boolean;
  lastReminderAt: string | null; lastReminderStatus: string | null;
};
export type ReminderLog = {
  id: string; sentAt: string; customer: { id: string; name: string }; invoice: { id: string; docNo: string } | null; rule: string | null; template: string | null;
  channel: string; recipient: string | null; triggerMode: string; amount: number; daysOverdue: number;
  /** QUEUED (outbox), SENT, DELIVERED, READ, FAILED */
  status: string; message: string | null; sentBy: Who;
};
export type ReminderRunsOverview = {
  kpis: { overdueCustomers: number; overdueAmount: number; dueNow: number; queuedToday: number };
  due: ReminderDue[];
  log: ReminderLog[];
  /** No email / SMS / WhatsApp provider is connected: messages are recorded in the outbox. */
  outboxOnly: true;
};
export const ReminderRunSchema = z.object({ customerId: optionalId, invoiceIds: z.array(z.uuid()).max(500).optional() });
export type ReminderRunResult = { queued: number; skipped: number; overview: ReminderRunsOverview };

// ---------------------------------------------------------------- financial statements
export const StatementQuerySchemaPnl = z.object({ from: z.iso.date(), to: z.iso.date(), cmpFrom: z.iso.date().optional(), cmpTo: z.iso.date().optional(), branch: z.uuid().optional() });
export const StatementQuerySchemaBs = z.object({ asAt: z.iso.date(), cmpAsAt: z.iso.date().optional(), branch: z.uuid().optional() });
export const StatementQuerySchemaCf = z.object({ from: z.iso.date(), to: z.iso.date(), branch: z.uuid().optional() });
export type StatementRow = {
  /** s = section heading, r = account / line, t = section total, g = grand total (net profit, total assets…) */
  kind: 's' | 'r' | 't' | 'g'; label: string; code?: string | null; accountId?: string | null; amount: number; comparative?: number | null; change?: number | null; pct?: number | null;
};
export type FinancialStatement = {
  kind: 'pnl' | 'balance-sheet' | 'cash-flow'; title: string; period: string; comparativePeriod: string | null; rows: StatementRow[];
  totals: Record<string, number>;
  /** Balance sheet: assets − (liabilities + equity); 0 when it balances. */
  difference?: number;
};
