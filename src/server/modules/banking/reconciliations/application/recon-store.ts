import type { ReconBookRow, ReconMatch, ReconStatementRow, Reconciliation } from '../../../../../shared/index.js';

export abstract class ReconStore {
  abstract list(tenantId: string, bankAccountId: string | null): Promise<Reconciliation[]>;
  abstract get(tenantId: string, id: string): Promise<Reconciliation | null>;
  abstract openFor(tenantId: string, bankAccountId: string): Promise<Reconciliation | null>;
  abstract closedFor(tenantId: string, bankAccountId: string): Promise<Reconciliation[]>;
  abstract firstActivity(tenantId: string, bankAccountId: string): Promise<string | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract bookBalance(tenantId: string, bankAccountId: string, on: string): Promise<number>;
  abstract statementRows(tenantId: string, bankAccountId: string, periodTo: string, reconId: string): Promise<(ReconStatementRow & { bankTransactionId: string | null; txnHasVoucher: boolean })[]>;
  abstract bookRows(tenantId: string, bankAccountId: string, periodTo: string, reconId: string): Promise<(ReconBookRow & { statementLineId: string | null })[]>;
  abstract matches(tenantId: string, reconId: string): Promise<ReconMatch[]>;
  abstract addMatch(tenantId: string, data: { reconciliationId: string; statementLineId: string; bankTransactionId: string; statementAmount: number; bookAmount: number; matchMethod: string; confidence: number | null; userId: string }): Promise<void>;
  abstract removeMatch(tenantId: string, matchId: string): Promise<{ statementLineId: string | null; bankTransactionId: string | null } | null>;
  /** Links a statement line to a book entry (manual match): a stand-in uncategorised transaction of the line goes. */
  abstract linkLine(tenantId: string, lineId: string, txnId: string): Promise<void>;
  /** Undoes a manual link: the line is open again with a fresh uncategorised transaction. */
  abstract unlinkLine(tenantId: string, lineId: string, txnId: string): Promise<void>;
  abstract close(tenantId: string, reconId: string, userId: string): Promise<void>;
  /** Header status (not part of the save function): CLOSED with who / when, or REOPENED. */
  abstract setStatus(tenantId: string, reconId: string, status: 'CLOSED' | 'REOPENED', userId: string | null): Promise<void>;
  abstract reopen(tenantId: string, reconId: string): Promise<void>;
  /** The bank account's reconciled-to date and last statement balance after a reopen (the previous closed one, or none). */
  abstract setReconciledTo(tenantId: string, bankAccountId: string, previous: Reconciliation | null): Promise<void>;
}
