import type { StatementImport, StatementLayout, StatementLine } from '../../../../../shared/index.js';

export type BookCandidate = { id: string; txnDate: string; amount: number; reference: string | null };
export type EngineRule = { id: string; code: string; name: string; matchMode: string; accountId: string; costCentreId: string | null; autoPost: boolean; conditions: { field: string; operator: string; value: string }[] };

export abstract class StatementStore {
  abstract list(tenantId: string, bankAccountId: string | null): Promise<StatementImport[]>;
  abstract get(tenantId: string, id: string): Promise<StatementImport | null>;
  abstract line(tenantId: string, id: string): Promise<(StatementLine & { statementImportId: string; bankAccountId: string }) | null>;
  abstract existingHashes(tenantId: string, bankAccountId: string, hashes: string[]): Promise<Set<string>>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Voucher-sourced bank transactions not yet seen on a statement, in a date window. */
  abstract unmatchedBook(tenantId: string, bankAccountId: string, from: string, to: string): Promise<BookCandidate[]>;
  /** Links statement lines to existing bank transactions (seen on the statement: cleared). */
  abstract link(tenantId: string, pairs: { lineId: string; txnId: string; confidence: number }[]): Promise<void>;
  /** Creates an uncategorised bank transaction for each unlinked, unignored line of the import (or of one line). */
  abstract createUncategorised(tenantId: string, importId: string, lineId?: string): Promise<number>;
  abstract saveLayout(tenantId: string, bankAccountId: string, layout: StatementLayout): Promise<void>;
  abstract rules(tenantId: string, bankAccountId: string): Promise<EngineRule[]>;
  abstract suggest(tenantId: string, lineId: string, data: { categoryAccountId: string; costCentreId: string | null; bankRuleId: string }): Promise<void>;
  abstract ruleHits(tenantId: string, hits: Map<string, number>): Promise<void>;
  /** Ignores a line: its uncategorised bank transaction goes. */
  abstract ignore(tenantId: string, lineId: string): Promise<void>;
  abstract restore(tenantId: string, lineId: string): Promise<void>;
  abstract updateCounts(tenantId: string, importId: string): Promise<void>;
  abstract deleteImport(tenantId: string, importId: string): Promise<void>;
}
