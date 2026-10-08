import { z } from 'zod';
import { optNum, optText, rowVersion } from './fields.ts';

/**
 * Phase 41: dunning cases (Platform.DunningCases + DunningAttempts), one per overdue invoice, following the active
 * dunning policy: GRACE (company PAST_DUE) → READ_ONLY → SUSPENDED → COLLECTIONS (archive / churn stays manual). There
 * is no payment gateway: a retry records the result of a manual attempt. A promise to pay pauses retries and can lift
 * read-only. Full payment recovers the case and restores the company.
 */
export const DUNNING_OPEN_STAGES = ['GRACE', 'READ_ONLY', 'SUSPENDED', 'COLLECTIONS', 'PROMISE'] as const;
export const DUNNING_ATTEMPT_METHODS = ['CARD', 'JAZZCASH', 'EASYPAISA', 'RAAST', 'DIRECT_DEBIT'] as const;
export const PROMISE_SOURCES = ['PHONE', 'WHATSAPP', 'EMAIL', 'VISIT'] as const;
/** Collections-queue buckets by days overdue (template admin/dunning). */
export const AGE_BUCKETS = [
  { key: '1-7', label: '1–7 days', from: Number.NEGATIVE_INFINITY, to: 7 },
  { key: '8-14', label: '8–14 days', from: 8, to: 14 },
  { key: '15-30', label: '15–30 days', from: 15, to: 30 },
  { key: '30+', label: '30+ days', from: 31, to: Number.POSITIVE_INFINITY },
] as const;

export type DunningQueueRow = {
  caseId: string; tenantId: string; tenantCode: string; tenantName: string; tenantStatus: string; invoiceId: string; docNo: string | null;
  dueOn: string; amountDue: number; balance: number; daysOverdue: number; ageBucket: string; stage: string; paymentMethod: string | null;
  attemptsCount: number; attemptsPlanned: number; lastFailureReason: string | null; nextRetryAt: string | null; nextRetryMethod: string | null;
  retriesPaused: boolean; promiseDate: string | null; promiseAmount: number | null; policyName: string; mrr: number | null;
};
export type DunningKpis = {
  recoveredMonthAmount: number; recoveredMonthCount: number; recoveryRate30dPct: number | null; inDunningCount: number;
  inDunningAmount: number; churnSavedMrr: number;
};
export type DunningPolicySummary = { id: string; name: string; graceDays: number; readOnlyDays: number; suspendedDays: number; retryHour: number; salaryRetryDays: number[] };
export type DunningQueue = { rows: DunningQueueRow[]; kpis: DunningKpis; policy: DunningPolicySummary | null };

export type DunningAttempt = {
  id: string; attemptNo: number; planDay: number; label: string; method: string; scheduledAt: string; attemptedAt: string | null; status: string;
  triggeredBy: string; failureReason: string | null; staff: string | null; paymentId: string | null;
};
export type DunningCaseDetail = DunningQueueRow & {
  openedAt: string; closedAt: string | null; recoveredAt: string | null; promiseSource: string | null; promiseNote: string | null;
  promiseLiftReadOnly: boolean; promiseRemindOwner: boolean; invoiceTotal: number; attempts: DunningAttempt[]; rowVersion: number;
};

/** The dunning panel of Tenant 360: the company's open case (if any) and its policy. */
export type TenantDunningState = { case: DunningCaseDetail | null; policy: DunningPolicySummary | null; tenantStatus: string };

export const DunningAttemptSchema = z.object({
  rowVersion,
  result: z.enum(['SUCCEEDED', 'FAILED']),
  method: z.enum(DUNNING_ATTEMPT_METHODS),
  /** SUCCEEDED: the amount collected (default the balance). */
  amount: optNum(0.01, 100_000_000, 'More than 0').optional(),
  failureReason: optText(200),
  paymentRef: optText(80),
}).refine((a) => a.result === 'SUCCEEDED' || !!a.failureReason, { path: ['failureReason'], message: 'Say why the attempt failed' });
export type DunningAttemptInput = z.infer<typeof DunningAttemptSchema>;

export const DunningPromiseSchema = z.object({
  rowVersion,
  promiseDate: z.iso.date('Choose the promised date'),
  promiseAmount: optNum(0.01, 100_000_000, 'More than 0').optional(),
  promiseSource: z.enum(PROMISE_SOURCES),
  promiseNote: optText(300),
  pauseRetries: z.boolean().default(true),
  liftReadOnly: z.boolean().default(false),
  remindOwner: z.boolean().default(true),
});
export type DunningPromise = z.infer<typeof DunningPromiseSchema>;

export const DunningCloseSchema = z.object({ rowVersion, reason: z.string().trim().min(3, 'Give the reason').max(300) });
export type DunningClose = z.infer<typeof DunningCloseSchema>;
export const DunningEscalateSchema = z.object({ rowVersion });

/** POST /api/admin/billing/run and /api/admin/dunning/run (and the daily job): what one run did. */
export type BillingRunResult = {
  asOf: string;
  invoicesGenerated: number;
  invoicesIssued: number;
  casesOpened: number;
  casesAdvanced: number;
  casesRecovered: number;
  statusChanges: { tenantId: string; tenantName: string; before: string; after: string }[];
  errors: { subject: string; message: string }[];
};
