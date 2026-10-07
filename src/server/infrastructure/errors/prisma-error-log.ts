import { Injectable } from '@nestjs/common';
import { ErrorLog, type ErrorLogEntry } from '../../core/application/ports/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Writes Platform.ErrorLogs on the plain client, never inside a request transaction: the request's own
 * transaction has already rolled back, and the log entry must survive it.
 */
@Injectable()
export class PrismaErrorLog extends ErrorLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(e: ErrorLogEntry) {
    await this.prisma.$executeRaw`
      insert into "Platform"."ErrorLogs"
        ("tenantId", "userId", "correlationId", "method", "path", "httpStatus", "errorCode", "message", "details", "sqlState", "stackHash")
      values (${e.tenantId}::uuid, ${e.userId}::uuid, ${e.correlationId}, ${e.method}, ${e.path}, ${e.httpStatus},
              ${e.errorCode}, ${e.message}, ${e.details ? JSON.stringify(e.details) : null}::jsonb, ${e.sqlState ?? null}, ${e.stackHash ?? null})`;
  }
}
