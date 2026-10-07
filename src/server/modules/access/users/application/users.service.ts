import { Injectable } from '@nestjs/common';
import type {
  ResetPassword,
  SessionUser,
  UserActivity,
  UserCreate,
  UserDetail,
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
