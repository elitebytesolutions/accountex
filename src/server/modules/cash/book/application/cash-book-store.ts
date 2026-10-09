import type { CashEntry, CashLedgerRow, CashOptions } from '../../../../../shared/index.js';

export abstract class CashBookStore {
  abstract options(tenantId: string): Promise<CashOptions>;
  /** GL balance of an account up to and including a date (posted and reversed vouchers); before the date when `before`. */
  abstract glBalance(tenantId: string, glAccountId: string, date: string, before?: boolean): Promise<number>;
  abstract entries(tenantId: string, q: { cashAccountId?: string; bankAccountId?: string; from: string; to: string }): Promise<CashEntry[]>;
  abstract entry(tenantId: string, id: string): Promise<CashEntry | null>;
  abstract insertEntry(data: Record<string, unknown>): Promise<string>;
  /** Posted lines on a GL account in a period with their contra account and cash-book category, oldest first (balance left at 0). */
  abstract ledgerRows(tenantId: string, glAccountId: string, from: string, to: string): Promise<CashLedgerRow[]>;
  abstract lockedDay(tenantId: string, cashAccountId: string, date: string): Promise<boolean>;
  abstract dayCloses(tenantId: string, cashAccountId: string, from: string, to: string): Promise<{ id: string; closeDate: string; status: string; varianceAmount: number }[]>;
  abstract custodian(tenantId: string, userId: string | null): Promise<{ id: string; name: string } | null>;
}
