import type { Bank, BankAccount, ChequeBook } from '../../../../../shared/index.js';

export abstract class BankStore {
  // Banks
  abstract banks(tenantId: string): Promise<Bank[]>;
  abstract retiredBankCodes(tenantId: string): Promise<string[]>;
  abstract saveBank(data: Record<string, unknown>): Promise<string>;
  abstract bankInUse(id: string): Promise<boolean>;
  abstract deleteBank(tenantId: string, id: string, rowVersion: number): Promise<void>;

  // Bank accounts
  abstract accounts(tenantId: string): Promise<BankAccount[]>;
  abstract saveAccount(data: Record<string, unknown>): Promise<string>;
  abstract accountInUse(id: string): Promise<boolean>;
  abstract deleteAccount(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract activeBranch(tenantId: string, id: string): Promise<boolean>;
  abstract activeCurrency(code: string): Promise<boolean>;

  // Cheque books
  abstract books(tenantId: string, bankAccountId?: string): Promise<ChequeBook[]>;
  abstract saveBook(data: Record<string, unknown>): Promise<string>;
  abstract bookInUse(id: string): Promise<boolean>;
  abstract deleteBook(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
