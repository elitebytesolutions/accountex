import type { BankingOptions, BankTxn, BankTxnList, BankTxnQuery } from '../../../../../shared/index.js';

export abstract class BankTxnStore {
  abstract options(tenantId: string): Promise<BankingOptions>;
  abstract list(tenantId: string, userId: string, q: BankTxnQuery): Promise<BankTxnList>;
  abstract get(tenantId: string, id: string): Promise<BankTxn | null>;
  /** GL balance of the bank account's GL account before a date (posted and reversed vouchers). */
  abstract balanceBefore(tenantId: string, bankAccountId: string, date: string): Promise<number>;
  /** Booked bank transactions (from posted vouchers) in a period, oldest first. */
  abstract booked(tenantId: string, bankAccountId: string, from: string, to: string): Promise<BankTxn[]>;
  /** A voucher raised for this bank transaction that is still alive (draft, pending or posted). */
  abstract openVoucherFor(tenantId: string, txnId: string): Promise<{ id: string; docNo: string; status: string } | null>;
  /** Marks the statement line behind an imported transaction as categorised to an account. */
  abstract categoriseLine(tenantId: string, txnId: string, data: { accountId: string; costCentreId: string | null; category: string | null; bankRuleId?: string | null }): Promise<void>;
}
