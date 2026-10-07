import { createHash } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiErrorBody, SessionUser } from '../../../shared/index.js';
import type { Request, Response } from 'express';
import { ErrorCatalogue, ErrorLog, type ErrorCodeInfo } from '../../core/application/ports/errors.js';
import { DomainError } from '../../core/domain/errors.js';
import { requestMetaOf } from '../context/request-meta.js';

/** What we know about a failure before looking up its catalogue entry. */
type Resolved = {
  code: string;
  /** Message for the client; the catalogue's userMessage is used when absent. */
  message?: string;
  details?: Record<string, string[]>;
  log?: Record<string, unknown>;
  sqlState?: string;
};

/** PostgreSQL error as surfaced by Prisma's driver adapter (code, hint from RAISE ... HINT, constraint). */
type DbCause = { originalCode?: string; hint?: string; originalMessage?: string; constraint?: { index?: string }; table?: string };

const HTTP_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

/**
 * Turns every error into `{ error: { code, message, details }, correlationId }` with the HTTP status from the
 * error catalogue, and records it in Platform.ErrorLogs when the catalogue says so. Never leaks SQL or stacks.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(
    private readonly catalogue: ErrorCatalogue,
    private readonly errorLog: ErrorLog,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request & { user?: SessionUser; admin?: { id: string } }>();
    const res = host.switchToHttp().getResponse<Response>();
    const meta = requestMetaOf(req);

    const resolved = this.resolve(exception);
    let info = this.catalogue.get(resolved.code);
    if (!info) {
      this.logger.warn(`Error code ${resolved.code} is not in Platform.ErrorCodes; add it in the phase SQL`);
      info = this.catalogue.get('INTERNAL_ERROR') as ErrorCodeInfo;
    }

    let stackHash: string | undefined;
    if (info.httpStatus >= 500) {
      const stack = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      stackHash = createHash('sha256').update(stack).digest('hex').slice(0, 16);
      this.logger.error(`[${meta.correlationId}] ${stack}`);
    }

    if (info.isLogged) {
      this.errorLog
        .record({
          tenantId: req.user?.tenantId ?? null,
          userId: req.user?.id ?? null,
          correlationId: meta.correlationId,
          method: req.method,
          path: req.originalUrl.split('?')[0]!,
          httpStatus: info.httpStatus,
          errorCode: info.code,
          message: resolved.message ?? info.userMessage,
          details: { ...resolved.log, ...(resolved.details && { fields: resolved.details }), ...(req.admin && { adminId: req.admin.id }) },
          sqlState: resolved.sqlState,
          stackHash,
        })
        .catch((e: unknown) => this.logger.error(`Could not write ErrorLogs: ${String(e)}`));
    }

    const body: ApiErrorBody = {
      error: { code: info.code, message: resolved.message ?? info.userMessage, details: resolved.details },
      correlationId: meta.correlationId,
    };
    res.status(info.httpStatus).json(body);
  }

  private resolve(exception: unknown): Resolved {
    if (exception instanceof DomainError) {
      return { code: exception.code, message: exception.message, details: exception.details, log: exception.log };
    }

    const cause = (exception as { meta?: { driverAdapterError?: { cause?: DbCause } } })?.meta?.driverAdapterError?.cause;
    if (cause?.originalCode) {
      // A trigger can name its exact catalogue code with RAISE ... USING HINT = '<CODE>'.
      const fromHint = cause.hint && this.catalogue.get(cause.hint) ? cause.hint : undefined;
      const code = fromHint ?? this.catalogue.bySqlState(cause.originalCode)?.code ?? 'INTERNAL_ERROR';
      return {
        code,
        sqlState: cause.originalCode,
        log: { constraint: cause.constraint?.index, table: cause.table, dbMessage: cause.originalMessage },
      };
    }

    if (exception instanceof HttpException) {
      return { code: HTTP_CODES[exception.getStatus()] ?? 'INTERNAL_ERROR' };
    }
    return { code: 'INTERNAL_ERROR' };
  }
}
