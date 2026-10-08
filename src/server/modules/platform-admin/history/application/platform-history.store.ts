/** One version of a platform row, as written by the audit trigger into Platform.PlatformAuditLogs. */
export type PlatformHistoryEntry = {
  entryId: string;
  occurredAt: Date;
  table: string;
  recordId: string | null;
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

/** Port: reads a platform record's history (and its child rows), newest first. */
export abstract class PlatformHistoryStore {
  abstract find(
    table: string,
    id: string,
    childFks: string[],
    page: { limit: number; offset: number },
  ): Promise<{ items: PlatformHistoryEntry[]; total: number }>;
}
