import { Injectable } from '@nestjs/common';
import type {
  PendingInvite,
  ResetPassword,
  SignInLink,
  SessionUser,
  UserActivity,
  UserCreate,
  UserDetail,
  UserInviteInput,
  UserInviteResult,
  UserListItem,
  UserSession,
  UserSummary,
  UserUpdate,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { PasswordHasher } from '../../../../core/application/ports/password-hasher.js';
import { SessionStore, type RevokeReason } from '../../../../core/application/ports/session-store.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ADMIN_RESET_HOURS, INVITE_DAYS, newSignInToken, signInPath } from '../../../auth/application/sign-in-tokens.js';
import { passwordProblem } from '../../../auth/domain/sign-in-policy.js';
import { UserAdminStore, type UserFields } from './user-admin-store.js';

const toSession = (current: string | undefined) => (s: { id: string; deviceLabel: string | null; clientType: string; ipAddress: string | null; signedInAt: Date; lastActiveAt: Date }): UserSession => ({
  id: s.id,
  deviceLabel: s.deviceLabel,
  clientType: s.clientType,
  ipAddress: s.ipAddress,
  signedInAt: s.signedInAt.toISOString(),
  lastActiveAt: s.lastActiveAt.toISOString(),
  current: s.id === current,
});

/** Settings › Users: accounts, their roles and branches, suspension, password resets and devices. */
@Injectable()
export class UsersService {
  constructor(
    private readonly store: UserAdminStore,
    private readonly sessions: SessionStore,
    private readonly passwords: PasswordHasher,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser): Promise<UserListItem[]> {
    return this.store.list(user.tenantId);
  }

  async summary(user: SessionUser): Promise<UserSummary> {
    const all = await this.store.list(user.tenantId);
    return {
      total: all.length,
      active: all.filter((u) => u.status === 'ACTIVE').length,
      suspended: all.filter((u) => u.status === 'SUSPENDED').length,
      external: all.filter((u) => u.isExternal).length,
    };
  }

  async get(user: SessionUser, id: string): Promise<UserDetail> {
    const found = await this.store.get(user.tenantId, id);
    if (!found) throw new NotFoundError('User not found');
    return found;
  }

  async create(user: SessionUser, meta: RequestMeta, input: UserCreate): Promise<UserDetail> {
    this.checkPassword(input.temporaryPassword, 'temporaryPassword');
    await this.checkRefs(user, input.roleIds, input.branchIds);
    const { temporaryPassword, mustChangePassword, roleIds, branchIds, ...fields } = input;
    const passwordHash = await this.passwords.hash(temporaryPassword);
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.create({ ...fields, passwordHash, mustChangePassword, roleIds, branchIds }),
    );
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: UserUpdate): Promise<UserDetail> {
    await this.current(user, id, input.rowVersion);
    const { rowVersion, roleIds, branchIds, ...fields } = input;
    await this.checkRefs(user, roleIds, branchIds);
    await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.update(user.tenantId, id, rowVersion, fields as Partial<UserFields>, roleIds, branchIds),
    );
    return this.get(user, id);
  }

  /** Suspend / reactivate / remove. Never on yourself; the database refuses it for the company's default user. */
  async setStatus(user: SessionUser, meta: RequestMeta, id: string, status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED', rowVersion: number): Promise<UserDetail | null> {
    this.notSelf(user, id);
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.setStatus(id, rowVersion, status);
      if (status !== 'ACTIVE') await this.sessions.revokeAllForUser(user.tenantId, id, 'SUSPENDED', user.id);
    });
    return status === 'REMOVED' ? null : this.get(user, id);
  }

  /** New temporary password; the user must change it at next sign-in and is signed out everywhere. */
  async resetPassword(user: SessionUser, meta: RequestMeta, id: string, input: ResetPassword): Promise<UserDetail> {
    this.notSelf(user, id);
    this.checkPassword(input.temporaryPassword, 'temporaryPassword');
    await this.current(user, id, input.rowVersion);
    const hash = await this.passwords.hash(input.temporaryPassword);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.setPassword(id, input.rowVersion, hash, true);
      await this.sessions.revokeAllForUser(user.tenantId, id, 'PASSWORD_CHANGED', user.id);
    });
    return this.get(user, id);
  }

  async sessionsOf(user: SessionUser, id: string, currentSessionId?: string): Promise<UserSession[]> {
    const target = await this.get(user, id);
    return (await this.sessions.listOpen(user.tenantId, target.id)).map(toSession(currentSessionId));
  }

  /** Signs the user out of one device, or of all of them. */
  async revokeSessions(user: SessionUser, meta: RequestMeta, id: string, sessionId?: string): Promise<void> {
    await this.get(user, id);
    const reason: RevokeReason = user.id === id ? 'USER_REVOKED' : 'ADMIN_REVOKED';
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (!sessionId) return void (await this.sessions.revokeAllForUser(user.tenantId, id, reason, user.id, user.id === id ? meta.sessionId : undefined));
      const session = await this.sessions.find(sessionId);
      if (!session || session.userId !== id || session.tenantId !== user.tenantId) throw new NotFoundError('Session not found');
      await this.sessions.revoke(user.tenantId, sessionId, reason, user.id);
    });
  }

  async activity(user: SessionUser, id: string): Promise<UserActivity[]> {
    await this.get(user, id);
    return this.store.activity(user.tenantId, id, 20);
  }

  // ---------------------------------------------------------------- Phase 44: invites and sign-in links
  /**
   * Invites a person: the user is created INVITED (no password) with their roles and branches, and a one-time link
   * (7 days) is returned once for the admin to copy or share on WhatsApp. Accepting it sets their password and activates them.
   */
  async invite(user: SessionUser, meta: RequestMeta, input: UserInviteInput): Promise<UserInviteResult> {
    await this.checkRefs(user, input.roleIds, input.branchIds);
    if (await this.store.pendingInviteFor(user.tenantId, input.email)) {
      throw new ConflictError('This person already has a pending invitation. Resend it instead.', { email: ['Invitation pending'] }, { code: 'INVITE_PENDING_EXISTS' });
    }
    const { roleIds, branchIds, channels, ...fields } = input;
    const { token, hash } = newSignInToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const userId = await this.store.createInvited({ ...fields, roleIds, branchIds, invitedByUserId: user.id });
      const resetId = await this.store.issueToken(user.tenantId, userId, 'INVITE', channels[0] ?? 'EMAIL', hash, expiresAt, user.id, meta.clientIp ?? null);
      await this.store.saveInvite({
        userId, email: fields.email, fullName: fields.fullName, phone: fields.phone, roleId: roleIds[0], branchId: branchIds[0] ?? null, channels,
        passwordResetId: resetId, invitedByUserId: user.id, expiresAt: expiresAt.toISOString(), status: 'PENDING',
      });
      return userId;
    });
    return { user: await this.get(user, id), link: { path: signInPath(token), expiresAt: expiresAt.toISOString(), purpose: 'INVITE' } };
  }

  invites(user: SessionUser, includeClosed: boolean): Promise<PendingInvite[]> {
    return this.store.invites(user.tenantId, includeClosed);
  }

  /** A new link (the previous one stops working); the invitation's 7 days start again. */
  async resendInvite(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<{ invite: PendingInvite; link: SignInLink }> {
    const inv = await this.openInvite(user, id, rowVersion, true);
    const { token, hash } = newSignInToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const resetId = await this.store.issueToken(user.tenantId, inv.userId, 'INVITE', inv.channels[0] ?? 'EMAIL', hash, expiresAt, user.id, meta.clientIp ?? null);
      await this.store.saveInvite({ id, rowVersion, passwordResetId: resetId, expiresAt: expiresAt.toISOString(), resendCount: inv.resendCount + 1, lastResentAt: new Date().toISOString(), status: 'PENDING' });
    });
    return { invite: (await this.store.invite(user.tenantId, id))!, link: { path: signInPath(token), expiresAt: expiresAt.toISOString(), purpose: 'INVITE' } };
  }

  /** Withdraws the invitation: the link stops working and the invited account is removed. */
  async revokeInvite(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const inv = await this.openInvite(user, id, rowVersion, true);
    const target = await this.get(user, inv.userId);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (inv.passwordResetId) await this.store.voidToken(user.tenantId, inv.passwordResetId);
      await this.store.saveInvite({ id, rowVersion, status: 'REVOKED', revokedAt: new Date().toISOString(), revokedByUserId: user.id });
      if (target.status === 'INVITED') await this.store.setStatus(inv.userId, target.rowVersion, 'REMOVED');
    });
    return (await this.store.invite(user.tenantId, id))!;
  }

  /**
   * A one-time link (24 hours) with which the user sets a new password; shown once to the admin to share. Their
   * sessions end when they use it. Next to the temporary-password reset.
   */
  async resetLink(user: SessionUser, meta: RequestMeta, id: string): Promise<SignInLink> {
    this.notSelf(user, id);
    const target = await this.get(user, id);
    if (target.status !== 'ACTIVE') throw new ConflictError('Only an active user can get a password link.', undefined, { code: 'USER_NOT_INVITABLE' });
    const { token, hash } = newSignInToken();
    const expiresAt = new Date(Date.now() + ADMIN_RESET_HOURS * 3_600_000);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.issueToken(user.tenantId, id, 'ADMIN_RESET', 'WHATSAPP', hash, expiresAt, user.id, meta.clientIp ?? null));
    return { path: signInPath(token), expiresAt: expiresAt.toISOString(), purpose: 'ADMIN_RESET' };
  }

  private async openInvite(user: SessionUser, id: string, rowVersion: number, allowExpired: boolean) {
    const inv = await this.store.invite(user.tenantId, id);
    if (!inv) throw new NotFoundError('Invitation not found');
    if (inv.rowVersion !== rowVersion) throw new ConcurrencyError('This invitation was changed. Reload and try again.');
    if (inv.status !== 'PENDING' && !(allowExpired && inv.status === 'EXPIRED')) {
      throw new ConflictError('This invitation was already accepted, revoked or has expired.', undefined, { code: 'INVITE_NOT_PENDING' });
    }
    return inv;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const found = await this.get(user, id);
    if (found.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this user. Reload and try again.');
    return found;
  }

  private notSelf(user: SessionUser, id: string) {
    if (user.id === id) throw new ConflictError("You can't do this to your own account.", undefined, { code: 'USER_SELF_ACTION' });
  }

  private checkPassword(password: string, field: string) {
    const problem = passwordProblem(password);
    if (problem) throw new ValidationError(problem, { [field]: [problem] }, { code: 'PASSWORD_TOO_WEAK' });
  }

  private async checkRefs(user: SessionUser, roleIds?: string[], branchIds?: string[]) {
    if (roleIds && (await this.store.jobRoleIds(user.tenantId, roleIds)).length !== new Set(roleIds).size) {
      throw new ValidationError('Choose roles of this company', { roleIds: ['Unknown role'] });
    }
    if (branchIds && (await this.store.activeBranchIds(user.tenantId, branchIds)).length !== new Set(branchIds).size) {
      throw new ValidationError('Choose active branches', { branchIds: ['Unknown or inactive branch'] });
    }
  }
}
