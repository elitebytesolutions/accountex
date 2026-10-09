export type TokenRecord = { resetId: string; tenantId: string; userId: string; purpose: string; valid: boolean; email: string; fullName: string | null; companyName: string | null; companyCode: string };

/** Persistence for sign-in recovery (Phase 44): token lookup / use and the account behind a "forgot password" request. */
export abstract class RecoveryStore {
  /** Company.passwordResetLookup: works without a tenant context (public). */
  abstract lookup(hash: Buffer): Promise<TokenRecord | null>;
  /** Company.passwordResetConsume, inside the token's tenant context. Returns the user id. */
  abstract consume(hash: Buffer, passwordHash: string): Promise<string>;
  /** An active user of the company with this email (null otherwise). */
  abstract activeUser(companyCode: string, email: string): Promise<{ tenantId: string; userId: string; email: string; fullName: string | null } | null>;
  abstract issueReset(tenantId: string, userId: string, hash: Buffer, expiresAt: Date, ip: string | null): Promise<void>;
}
