import type { AdminHistoryPage } from '../../../../../shared/index.js';
import type { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';

type Row = {
  entryId: bigint; occurredAt: Date; action: string; actorId: string | null; actorName: string | null; actorEmail: string | null;
  changes: Record<string, unknown> | null; rowData: Record<string, unknown> | null; ipAddress: string | null; userAgent: string | null;
  correlationId: string | null; total: bigint;
};

/**
 * Platform.PlatformAuditLogs entries of some Platform tables, newest first, as History tab items. Used where one
 * record id doesn't fit getPlatformRecordHistory: a system role's grants (rows keyed by systemKey) and the Tax
 * Master change log (every tax-master table). `tables` are fixed names from code; `match` filters on a row field.
 */
export async function readPlatformLog(
  prisma: PrismaService,
  q: { tables: string[]; match?: { field: string; value: string }; limit: number; offset: number },
): Promise<AdminHistoryPage> {
  const field = q.match?.field ?? null;
  const value = q.match?.value ?? null;
  const rows = await prisma.db().$queryRaw<Row[]>`
    select l.id as "entryId", l."occurredAt", l.action, l."staffUserId"::text as "actorId", l."actorLabel" as "actorName",
           coalesce(l."actorDetail", s.email::text) as "actorEmail", l.payload as changes, l."rowData", host(l."ipAddress") as "ipAddress",
           l."userAgent", l."correlationId", count(*) over () as total
      from "Platform"."PlatformAuditLogs" l
      left join "Platform"."PlatformStaff" s on s.id = l."staffUserId"
     where split_part(l.action, '.', 1) = any(${q.tables}::text[])
       and (${field}::text is null or l."rowData" ->> ${field}::text = ${value}::text)
     order by l."occurredAt" desc, l.id desc
     limit ${q.limit}::int offset ${q.offset}::int`;
  return {
    total: rows.length ? Number(rows[0]!.total) : 0,
    items: rows.map((r) => ({
      entryId: r.entryId.toString(),
      occurredAt: r.occurredAt.toISOString(),
      table: r.action.split('.')[0]!,
      recordId: (r.rowData?.id as string | undefined) ?? null,
      action: (r.action.split('.')[1] ?? '').toUpperCase(),
      version: 1,
      actor: { id: r.actorId, name: r.actorName, email: r.actorEmail },
      changes: r.changes,
      row: r.rowData,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      correlationId: r.correlationId,
    })),
  };
}
