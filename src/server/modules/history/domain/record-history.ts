/** One version of a database row, as written by the audit trigger (Company.AuditTrailEntries). */
export type HistoryEntry = {
  entryId: string;
  occurredAt: Date;
  action: string;
  version: number;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  changes: Record<string, unknown> | null;
  row: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
};

/** Port: reads a record's history, newest first. Implemented in infrastructure/. */
export abstract class RecordHistoryRepository {
  abstract find(
    schema: string,
    table: string,
    recordId: string,
    page: { limit: number; offset: number },
  ): Promise<{ items: HistoryEntry[]; total: number }>;
}
