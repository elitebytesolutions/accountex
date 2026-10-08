import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { PlatformHistoryStore, type PlatformHistoryEntry } from '../application/platform-history.store.js';

type Row = {
  entryId: bigint;
  occurredAt: Date;
  tableName: string;
  recordId: string | null;
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

/** Reads Platform.getPlatformRecordHistory (table names come from the ADMIN_HISTORY_TABLES allow-list). */
@Injectable()
export class PrismaPlatformHistoryStore extends PlatformHistoryStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(table: string, id: string, childFks: string[], page: { limit: number; offset: number }) {
    const rows = await this.prisma.db().$queryRaw<Row[]>`
      select "entryId", "occurredAt", "tableName", "recordId", "action", "version", "actorId"::text as "actorId",
             "actorName", "actorEmail", "changes", "rowData", host("ipAddress") as "ipAddress", "userAgent",
             "correlationId", "total"
      from "Platform"."getPlatformRecordHistory"(${table}, ${id}::uuid, ${childFks}::text[], ${page.limit}::int, ${page.offset}::int)`;

    const items: PlatformHistoryEntry[] = rows.map((r) => ({
      entryId: r.entryId.toString(),
      occurredAt: r.occurredAt,
      table: r.tableName,
      recordId: r.recordId,
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
