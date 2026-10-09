import type { PendingInvite, UserActivity, UserDetail, UserListItem } from '../../../../../shared/index.js';

/** Account fields an admin edits (identity, access and security). */
export type UserFields = {
  fullName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  isExternal: boolean;
  externalOrg: string | null;
  moduleAccess: string[];
  approvalLimit: number;
  dataScope: string;
  ipRestricted: boolean;
  ipAllowlist: string[];
  sessionTimeoutMin: number;
  loginHours: string;
  loginFrom: string | null;
  loginTo: string | null;
};

export type NewUser = UserFields & { passwordHash: string; mustChangePassword: boolean; roleIds: string[]; branchIds: string[] };

/** Port: the company's users as an admin manages them. Writes run inside a UnitOfWork (Company.userAddUpdate). */
export abstract class UserAdminStore {
  /** Everyone except removed users. */
  abstract list(tenantId: string): Promise<UserListItem[]>;
  abstract get(tenantId: string, id: string): Promise<UserDetail | null>;
  /** Of `ids`, the job roles of this company (not EMPLOYEE, not deleted). */
  abstract jobRoleIds(tenantId: string, ids: string[]): Promise<string[]>;
  /** Of `ids`, this company's active branches. */
  abstract activeBranchIds(tenantId: string, ids: string[]): Promise<string[]>;
  abstract create(user: NewUser): Promise<string>;
  /** Partial update; roles and branches are replaced when given (first role = primary). */
  abstract update(tenantId: string, id: string, rowVersion: number, fields: Partial<UserFields>, roleIds?: string[], branchIds?: string[]): Promise<void>;
  abstract setStatus(id: string, rowVersion: number, status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED'): Promise<void>;
  abstract setPassword(id: string, rowVersion: number, passwordHash: string, mustChangePassword: boolean): Promise<void>;
  /** The user's latest actions (audit entries they authored). */
  abstract activity(tenantId: string, userId: string, limit: number): Promise<UserActivity[]>;

  // ---------------------------------------------------------------- Phase 44: invites and sign-in links
  /** Creates the user INVITED, without a password (they set it from the link). */
  abstract createInvited(user: UserFields & { roleIds: string[]; branchIds: string[]; invitedByUserId: string }): Promise<string>;
  /** Company.passwordResetIssue: stores the token's hash; earlier unused links of the same purpose stop working. */
  abstract issueToken(tenantId: string, userId: string, purpose: 'INVITE' | 'ADMIN_RESET', channel: string, hash: Buffer, expiresAt: Date, requestedBy: string, ip: string | null): Promise<string>;
  abstract saveInvite(data: Record<string, unknown>): Promise<string>;
  abstract invites(tenantId: string, includeClosed: boolean): Promise<PendingInvite[]>;
  abstract invite(tenantId: string, id: string): Promise<(PendingInvite & { passwordResetId: string | null }) | null>;
  abstract pendingInviteFor(tenantId: string, email: string): Promise<string | null>;
  /** Voids a token now (revoke). */
  abstract voidToken(tenantId: string, resetId: string): Promise<void>;
}
