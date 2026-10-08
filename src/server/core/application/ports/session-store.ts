/** One signed-in device (Company.UserSessions). */
export type SessionRecord = {
  id: string;
  tenantId: string;
  userId: string;
  deviceLabel: string | null;
  clientType: string;
  ipAddress: string | null;
  signedInAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  /** PASSWORD, SSO_*, or IMPERSONATION (Phase 40: a Super Admin support session). */
  authMethod: string;
};

export type NewSession = {
  id: string;
  tenantId: string;
  userId: string;
  /** The issued token; only its SHA-256 is stored. */
  token: string;
  deviceLabel: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
};

/** Revoke reasons (RevokeReason lookup). */
export type RevokeReason = 'SIGN_OUT' | 'USER_REVOKED' | 'ADMIN_REVOKED' | 'SUSPENDED' | 'PASSWORD_CHANGED' | 'IDLE_TIMEOUT' | 'EXPIRED';

/** Port: server-side sessions, so a session can be listed and revoked. Writes run inside a UnitOfWork. */
export abstract class SessionStore {
  abstract create(session: NewSession): Promise<void>;
  abstract find(id: string): Promise<SessionRecord | null>;
  /** Marks the session as used now. Not row history (the audit trigger ignores lastActiveAt). */
  abstract touch(id: string): Promise<void>;
  /** Sessions not revoked and not past expiresAt, most recent first. */
  abstract listOpen(tenantId: string, userId: string): Promise<SessionRecord[]>;
  abstract revoke(tenantId: string, id: string, reason: RevokeReason, byUserId: string | null): Promise<boolean>;
  /** Revokes every open session of the user, except `exceptId` (the caller's own). Returns how many. */
  abstract revokeAllForUser(tenantId: string, userId: string, reason: RevokeReason, byUserId: string | null, exceptId?: string): Promise<number>;
}
