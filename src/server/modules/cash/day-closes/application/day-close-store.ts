import type { CashDayClose } from '../../../../../shared/index.js';

export type DayCloseRow = Omit<CashDayClose, 'tolerance' | 'receipts' | 'payments'>;

export abstract class DayCloseStore {
  abstract find(tenantId: string, cashAccountId: string, date: string): Promise<DayCloseRow | null>;
  abstract get(tenantId: string, id: string): Promise<DayCloseRow | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract set(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  /** Receipts and payments posted to the GL account on a day. */
  abstract dayTotals(tenantId: string, glAccountId: string, date: string): Promise<{ receipts: number; payments: number }>;
  /** Posts the cash over / short JV (Dr shortage or Cr overage on CASH_OVER_SHORT); returns the voucher id. */
  abstract postVariance(date: string, branchId: string, cashGlAccountId: string, variance: number, label: string): Promise<string>;
}
