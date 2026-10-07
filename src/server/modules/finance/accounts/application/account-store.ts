import type { Account, AccountTemplate, Ledger, LedgerView, LedgerViewSave } from '../../../../../shared/index.js';

export type NewAccount = {
  code: string; name: string; description: string | null; parentId: string; level: number; accountClass: number;
  nature: string; kind: string; subType: string | null; currencyCode: string; branchIds: string[];
};
export type AccountChanges = { name?: string; description?: string | null; subType?: string | null; currencyCode?: string };

/** Port: the chart of accounts, templates, ledger reads and saved ledger views. Writes run inside a UnitOfWork. */
export abstract class AccountStore {
  /** Every non-deleted account with its branches and current fiscal-year closing balance. */
  abstract list(tenantId: string): Promise<Account[]>;
  abstract get(tenantId: string, id: string): Promise<Account | null>;
  /** True when any account row exists (also deleted ones, whose codes stay taken). */
  /** Codes of soft-deleted accounts: codes are never reused (unique per tenant including deleted rows). */
  abstract retiredCodes(tenantId: string): Promise<string[]>;
  abstract hasAny(tenantId: string): Promise<boolean>;
  /** Of `ids`, this company's active branches. */
  abstract activeBranchIds(tenantId: string, ids: string[]): Promise<string[]>;
  /** Whether the sub-type is valid for the account class (AccountSubType lookup parent codes). */
  abstract subTypeFits(subType: string, accountClass: number): Promise<boolean>;
  abstract create(a: NewAccount): Promise<string>;
  abstract update(tenantId: string, id: string, rowVersion: number, changes: AccountChanges, branchIds?: string[]): Promise<void>;
  abstract setStatus(tenantId: string, ids: string[], status: 'ACTIVE' | 'INACTIVE'): Promise<number>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;

  abstract templates(): Promise<AccountTemplate[]>;
  /** Accounting.applyChartTemplate; returns the number of accounts created. */
  abstract applyTemplate(templateId: string): Promise<number>;

  abstract ledger(tenantId: string, account: Account, from: string, to: string): Promise<Ledger>;
  abstract ledgerViews(tenantId: string, userId: string): Promise<LedgerView[]>;
  abstract ledgerView(tenantId: string, id: string, userId: string): Promise<LedgerView | null>;
  abstract saveLedgerView(data: LedgerViewSave & { id?: string; rowVersion?: number; userId?: string }): Promise<string>;
  abstract deleteLedgerView(tenantId: string, id: string): Promise<void>;
}
