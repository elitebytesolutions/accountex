import { Injectable } from '@nestjs/common';
import type { AdminHistoryPage, HistoryQuery } from '../../../../../shared/index.js';
import { NotFoundError } from '../../../../core/domain/errors.js';
import { ADMIN_HISTORY_TABLES } from '../admin-history-tables.js';
import { PlatformHistoryStore } from './platform-history.store.js';

/** The History tab of a Super Admin record: every version of it and of its child rows, who made it, what changed. */
@Injectable()
export class GetPlatformHistory {
  constructor(private readonly history: PlatformHistoryStore) {}

  async execute(table: string, id: string, query: HistoryQuery): Promise<AdminHistoryPage> {
    const entry = Object.hasOwn(ADMIN_HISTORY_TABLES, table) ? ADMIN_HISTORY_TABLES[table] : undefined;
    if (!entry) {
      throw new NotFoundError('History is not available for this record type.', undefined, {
        code: 'HISTORY_TABLE_UNKNOWN',
        log: { table: `Platform.${table}` },
      });
    }
    const { items, total } = await this.history.find(table, id, entry.children ?? [], {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      total,
      items: items.map((e) => ({
        entryId: e.entryId,
        occurredAt: e.occurredAt.toISOString(),
        table: e.table,
        recordId: e.recordId,
        action: e.action,
        version: e.version,
        actor: { id: e.actorId, name: e.actorName, email: e.actorEmail },
        changes: e.changes,
        row: e.row,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        correlationId: e.correlationId,
      })),
    };
  }
}
