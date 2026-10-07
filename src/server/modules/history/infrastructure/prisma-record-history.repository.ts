import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { RecordHistoryRepository, type HistoryEntry } from '../domain/record-history.js';

type Row = {
  entryId: bigint;
  occurredAt: Date;
  action: string;
  version: number;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  changes: Record<string, unknown> | null;
  rowData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  total: bigint;
};

/** Reads Company.getRecordHistory (SECURITY INVOKER, so the caller's tenant row-level security applies). */
@Injectable()
export class PrismaRecordHistoryRepository extends RecordHistoryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(schema: string, table: string, recordId: string, page: { limit: number; offset: number }) {
    const rows = await this.prisma.db().$queryRaw<Row[]>`
      select "entryId", "occurredAt", "action", "version", "actorId"::text as "actorId", "actorName", "actorEmail",
             "changes", "rowData", host("ipAddress") as "ipAddress", "userAgent", "correlationId", "total"
      from "Company"."getRecordHistory"(${schema}, ${table}, ${recordId}::uuid, ${page.limit}::int, ${page.offset}::int)`;

    const items: HistoryEntry[] = rows.map((r) => ({
      entryId: r.entryId.toString(),
      occurredAt: r.occurredAt,
      action: r.action,
      version: r.version,
      actorId: r.actorId,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      changes: r.changes,
      row: r.rowData,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      correlationId: r.correlationId,
    }));
    return { items, total: rows.length ? Number(rows[0]!.total) : 0 };
  }
}
