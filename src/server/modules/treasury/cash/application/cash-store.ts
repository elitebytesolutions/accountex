import type { CashAccount, CashCategory, ExpenseCategory } from '../../../../../shared/index.js';

export type CashTable = 'cashAccounts' | 'cashCategories' | 'expenseCategories';

export abstract class CashStore {
  abstract accounts(tenantId: string): Promise<CashAccount[]>;
  abstract saveAccount(data: Record<string, unknown>): Promise<string>;
  abstract categories(tenantId: string): Promise<CashCategory[]>;
  abstract saveCategory(data: Record<string, unknown>): Promise<string>;
  abstract expenseCategories(tenantId: string): Promise<ExpenseCategory[]>;
  abstract saveExpenseCategory(data: Record<string, unknown>): Promise<string>;

  /** Codes of soft-deleted rows (codes are never reused). */
  abstract retiredCodes(tenantId: string, table: CashTable): Promise<string[]>;
  abstract inUse(table: CashTable, id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, table: CashTable, id: string, rowVersion: number): Promise<void>;
  abstract activeBranch(tenantId: string, id: string): Promise<boolean>;
  abstract activeUser(tenantId: string, id: string): Promise<boolean>;
  /** Whether a petty cash fund sits on this cash account (the fund then owns its imprest, custodian and branch). */
  abstract hasFund(tenantId: string, cashAccountId: string): Promise<boolean>;
}
