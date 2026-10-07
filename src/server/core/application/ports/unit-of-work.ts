/**
 * Who is changing data, taken from the verified session and the request (never from the request body).
 * The database audit triggers read these values, so every insert/update/delete is recorded with its author.
 */
export type AuditContext = {
  userId: string | null;
  tenantId: string | null;
  /** The request id (x-request-id), shared by every change made in one request. */
  correlationId: string;
  clientIp?: string;
  userAgent?: string;
  sessionId?: string;
  /** Who acted when there is no signed-in user, e.g. "seed.ts" or "login attempt". */
  actorLabel?: string;
};

/** Facts about the HTTP request that every audit entry and error log carries. */
export type RequestMeta = Pick<AuditContext, 'correlationId' | 'clientIp' | 'userAgent' | 'sessionId'>;

/**
 * Port: runs work in one database transaction that carries the AuditContext.
 * Every change inside `work` and its history entries commit or roll back together.
 */
export abstract class UnitOfWork {
  abstract run<T>(context: AuditContext, work: () => Promise<T>): Promise<T>;
}
