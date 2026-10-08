/**
 * Port (Phase 40): what the auth guard checks on every tenant request besides the session itself.
 * - The company's status: SUSPENDED / CHURNED / PROVISIONING companies are refused; a READ_ONLY company can only read.
 * - Support access: a session signed in by the Super Admin (Platform.ImpersonationSessions) is time-boxed, may be
 *   read-only, and every change made in it names the Super Admin too.
 */
export type SupportSession = {
  id: string;
  /** "Super Admin <email>", added to the row history of every change made in the session. */
  staffLabel: string;
  isReadOnly: boolean;
  reason: string;
  expiresAt: Date;
  endedAt: Date | null;
};

export abstract class TenantAccess {
  abstract tenantStatus(tenantId: string): Promise<string | null>;
  /** The support session behind a tenant session (UserSessions.authMethod = IMPERSONATION), or null. */
  abstract supportSession(userSessionId: string): Promise<SupportSession | null>;
  /** Ends a support session whose time ran out (endReason EXPIRED) and revokes its tenant session. */
  abstract expire(supportSessionId: string, userSessionId: string): Promise<void>;
}
