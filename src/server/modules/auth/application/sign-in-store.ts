/** Everything sign-in needs about one account in one company. */
export type SignInCandidate = {
  id: string;
  tenantId: string;
  status: string;
  passwordHash: string | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  loginHours: string;
  loginFrom: string | null;
  loginTo: string | null;
  /** Company time zone (CompanySettings.timezone, Asia/Karachi until saved). */
  timeZone: string;
  /** Phase 40: Platform.Tenants.status (TRIAL, ACTIVE, PAST_DUE and READ_ONLY companies can sign in). */
  tenantStatus: string;
};

/** Port: account lookups and counters for sign-in. Writes run inside a UnitOfWork. */
export abstract class SignInStore {
  /** The user with this email in the company with this code (any status: the caller checks it), or null. Removed users are never found. */
  abstract findCandidate(companyCode: string, email: string): Promise<SignInCandidate | null>;
  /** True unless the user is IP-restricted and `ip` is outside their allow-list. */
  abstract ipAllowed(userId: string, ip: string | undefined): Promise<boolean>;
  abstract recordLogin(userId: string, ip: string | undefined): Promise<void>;
  abstract recordFailedLogin(userId: string, lockUntil: Date | null): Promise<void>;
}
