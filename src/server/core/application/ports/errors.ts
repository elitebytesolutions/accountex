/** One entry of the error catalogue (Platform.ErrorCodes). */
export type ErrorCodeInfo = {
  code: string;
  httpStatus: number;
  category: string;
  userMessage: string;
  isLogged: boolean;
};

/** Port: the error catalogue. Every error response uses a code from it. */
export abstract class ErrorCatalogue {
  abstract get(code: string): ErrorCodeInfo | undefined;
  /** The catalogue entry for a PostgreSQL SQLSTATE (e.g. 23505 → DB_UNIQUE_VIOLATION). */
  abstract bySqlState(sqlState: string): ErrorCodeInfo | undefined;
}

/** What is stored in Platform.ErrorLogs. Never request bodies or secrets. */
export type ErrorLogEntry = {
  tenantId: string | null;
  userId: string | null;
  correlationId: string;
  method: string;
  path: string;
  httpStatus: number;
  errorCode: string;
  message: string;
  details?: Record<string, unknown>;
  sqlState?: string;
  stackHash?: string;
};

/** Port: the append-only error log. Written outside the failed request's transaction. */
export abstract class ErrorLog {
  abstract record(entry: ErrorLogEntry): Promise<void>;
}
