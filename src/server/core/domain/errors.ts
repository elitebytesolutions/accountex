type ErrorOptions = {
  /** Catalogue code (Platform.ErrorCodes) when more specific than the class default. */
  code?: string;
  /** Extra facts stored in the error log only, never sent to the client. */
  log?: Record<string, unknown>;
};

/**
 * Base class for errors raised by domain and application code. Mapped to HTTP by DomainExceptionFilter:
 * the HTTP status comes from the error catalogue entry for `code`.
 */
export abstract class DomainError extends Error {
  protected abstract readonly defaultCode: string;
  private readonly explicitCode?: string;
  readonly log?: Record<string, unknown>;

  constructor(
    message: string,
    /** Field-level details returned to the client (validation errors). */
    readonly details?: Record<string, string[]>,
    options?: ErrorOptions,
  ) {
    super(message);
    this.name = new.target.name;
    this.explicitCode = options?.code;
    this.log = options?.log;
  }

  get code(): string {
    return this.explicitCode ?? this.defaultCode;
  }
}

export class ValidationError extends DomainError {
  protected readonly defaultCode = 'VALIDATION_FAILED';
}

export class UnauthorizedError extends DomainError {
  protected readonly defaultCode = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
  protected readonly defaultCode = 'FORBIDDEN';
}

export class PermissionDeniedError extends DomainError {
  protected readonly defaultCode = 'PERMISSION_DENIED';
}

export class NotFoundError extends DomainError {
  protected readonly defaultCode = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
  protected readonly defaultCode = 'CONFLICT';
}

/** The record changed since it was read (rowVersion mismatch). */
export class ConcurrencyError extends DomainError {
  protected readonly defaultCode = 'CONCURRENCY_CONFLICT';
}
