import type { ImpersonationSession } from '../../../../../../shared/index.js';

export type ImpersonationTarget = { tenantId: string; tenantStatus: string; userId: string; label: string };

/** Port: Platform.ImpersonationSessions and the tenant session (Company.UserSessions) each one signs in with. */
export abstract class ImpersonationStore {
  abstract list(filter: { tenantId?: string; staffId?: string; liveOnly?: boolean }): Promise<ImpersonationSession[]>;
  abstract get(id: string): Promise<ImpersonationSession | null>;
  /** The company user to sign in as: the given one (ACTIVE, same company) or the company's default user. */
  abstract target(tenantId: string, userId?: string): Promise<ImpersonationTarget | null>;
  abstract liveForStaff(staffId: string): Promise<{ id: string; userSessionId: string | null; expiresAt: Date } | null>;
  abstract start(s: {
    tenantId: string; staffId: string; target: ImpersonationTarget; reason: string; timeLimitMinutes: number; isReadOnly: boolean;
    userSessionId: string; tokenHash: Uint8Array<ArrayBuffer>; expiresAt: Date; ipAddress?: string; userAgent?: string;
  }): Promise<string>;
  /** Ends the session (and revokes its tenant session); false when it had already ended. */
  abstract end(id: string, reason: 'MANUAL' | 'EXPIRED' | 'REVOKED'): Promise<boolean>;
  abstract byUserSession(userSessionId: string): Promise<ImpersonationSession | null>;
  /** The Super Admin (PlatformStaff) who opened the session. */
  abstract staffOf(id: string): Promise<{ staffId: string; email: string | null } | null>;
}
