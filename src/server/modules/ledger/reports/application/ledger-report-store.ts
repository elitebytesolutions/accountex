import type { DayBookRow, GlRow, TrialBalanceRow } from '../../../../../shared/index.js';

export abstract class LedgerReportStore {
  abstract trialBalance(tenantId: string, from: string, to: string, branchId: string | null, level: number): Promise<TrialBalanceRow[]>;
  abstract generalLedger(tenantId: string, from: string, to: string, accountId: string | null, branchId: string | null): Promise<GlRow[]>;
  abstract dayBook(tenantId: string, date: string, branchId: string | null): Promise<DayBookRow[]>;
  /** The start of the fiscal year that contains the date (the first of the date's month when none does). */
  abstract yearStart(tenantId: string, date: string): Promise<string>;
}
