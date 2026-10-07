import { Injectable } from '@nestjs/common';
import type { HistoryPage, HistoryQuery, SessionUser } from '../../../../shared/index.js';
import { UnitOfWork, type RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { NotFoundError, PermissionDeniedError } from '../../../core/domain/errors.js';
import { RecordHistoryRepository } from '../domain/record-history.js';
import { HISTORY_TABLES } from './history-tables.js';

/** The history tab of a record: every version, who made it, what changed. Tenant-scoped by row-level security. */
@Injectable()
export class GetRecordHistory {
  constructor(
    private readonly history: RecordHistoryRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(
    user: SessionUser,
    meta: RequestMeta,
    target: { schema: string; table: string; recordId: string },
    query: HistoryQuery,
  ): Promise<HistoryPage> {
    const permission = HISTORY_TABLES[`${target.schema}.${target.table}`];
    if (!permission) {
      throw new NotFoundError('History is not available for this record type.', undefined, {
        code: 'HISTORY_TABLE_UNKNOWN',
        log: { table: `${target.schema}.${target.table}` },
      });
    }
    if (!user.permissions.includes(permission)) {
      throw new PermissionDeniedError('You do not have permission to do this.', undefined, { log: { missing: [permission] } });
    }

    // Read inside the user's context so row-level security limits the rows to their tenant.
    const { items, total } = await this.unitOfWork.run({ ...meta, userId: user.id, tenantId: user.tenantId }, () =>
      this.history.find(target.schema, target.table, target.recordId, {
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      }),
    );

    return {
      total,
      items: items.map((e) => ({
        entryId: e.entryId,
        occurredAt: e.occurredAt.toISOString(),
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
