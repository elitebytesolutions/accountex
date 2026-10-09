import type { FinancialStatement, ReminderDue, ReminderLog, ReopenRequest, YearEnd, YearEndCheck } from '../../../../../shared/index.js';

export type PeriodCloseSave = 'periodReopenRequestAddUpdate' | 'yearEndCloseAddUpdate';
export type PeriodCloseLifecycle = 'periodReopenRequestApprove' | 'periodReopenRequestReject' | 'periodReopenRequestCancel' | 'periodReopenReclose' | 'yearEndClosePost' | 'yearEndCloseCancel';
export type PeriodFacts = { id: string; code: string; status: string; fiscalYearId: string; modules: Record<string, string> };
export type YearFacts = { id: string; code: string; startDate: string; endDate: string; status: string };

/** Persistence for reopen requests, year-end close, reminder runs (outbox) and the financial statements. */
export abstract class PeriodCloseStore {
  abstract tenants(): Promise<string[]>;

  abstract listReopen(tenantId: string): Promise<ReopenRequest[]>;
  abstract getReopen(tenantId: string, id: string): Promise<ReopenRequest | null>;
  abstract period(tenantId: string, id: string): Promise<PeriodFacts | null>;
  abstract dueReclose(tenantId: string): Promise<string[]>;

  abstract year(tenantId: string, fiscalYearId: string): Promise<YearFacts | null>;
  abstract yearEnd(tenantId: string, fiscalYearId: string, checklist: YearEndCheck[]): Promise<YearEnd>;
  abstract checklist(tenantId: string, fiscalYearId: string): Promise<YearEndCheck[]>;
  abstract draftFinal(tenantId: string, fiscalYearId: string): Promise<{ id: string; rowVersion: number } | null>;
  abstract accountsExist(tenantId: string, ids: string[]): Promise<boolean>;
  abstract adjustment(tenantId: string, id: string): Promise<{ id: string; yearEndCloseId: string; description: string; debitAccountId: string; creditAccountId: string; amount: number; status: string; rowVersion: number } | null>;
  abstract addAdjustment(tenantId: string, yearEndCloseId: string, row: { description: string; debitAccountId: string; creditAccountId: string; amount: number }): Promise<void>;
  abstract setAdjustment(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract deleteAdjustment(tenantId: string, id: string): Promise<boolean>;
  /** Accounting.journalCreate (SYSTEM voucher) — returns the voucher id. */
  abstract journal(header: Record<string, unknown>, lines: Record<string, unknown>[]): Promise<string>;
  abstract runOf(tenantId: string, id: string): Promise<{ id: string; fiscalYearId: string; runMode: string; status: string; rowVersion: number } | null>;

  abstract reminderQueue(tenantId: string, customerId: string | null): Promise<ReminderDue[]>;
  abstract reminderLog(tenantId: string, limit: number): Promise<ReminderLog[]>;
  abstract reminderKpis(tenantId: string): Promise<{ overdueCustomers: number; overdueAmount: number; dueNow: number; queuedToday: number }>;
  /** Due queue rows with their template for rendering. */
  abstract reminderWork(tenantId: string, customerId: string | null, invoiceIds: string[] | null): Promise<{
    invoiceId: string; docNo: string; dueDate: string; customerId: string; customerName: string; mobile: string | null; email: string | null; balance: number; daysOverdue: number;
    ruleId: string | null; templateId: string | null; channels: string[]; bodyEn: string | null; emailSubject: string | null;
  }[]>;
  abstract companyName(tenantId: string): Promise<string>;
  abstract addReminderLogs(tenantId: string, rows: Record<string, unknown>[]): Promise<void>;

  abstract pnl(tenantId: string, from: string, to: string, cmpFrom: string | null, cmpTo: string | null, branch: string | null): Promise<FinancialStatement>;
  abstract balanceSheet(tenantId: string, asAt: string, cmpAsAt: string | null, branch: string | null): Promise<FinancialStatement>;
  abstract cashFlow(tenantId: string, from: string, to: string, branch: string | null): Promise<FinancialStatement>;

  abstract save(fn: PeriodCloseSave, data: Record<string, unknown>): Promise<string>;
  abstract run(fn: PeriodCloseLifecycle, id: string, text?: string | null): Promise<void>;
}
