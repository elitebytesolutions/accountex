import { Injectable } from '@nestjs/common';
import type {
  ChangePassword,
  MyPreferencesResponse,
  MyPreferencesUpdate,
  MyProfile,
  MyProfileUpdate,
  SessionUser,
  UserSession,
} from '../../../../shared/index.js';
import { actorContext } from '../../../core/application/actor-context.js';
import { PasswordHasher } from '../../../core/application/ports/password-hasher.js';
import { SessionStore } from '../../../core/application/ports/session-store.js';
import { UnitOfWork, type RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError, ValidationError } from '../../../core/domain/errors.js';
import { passwordProblem } from '../../auth/domain/sign-in-policy.js';
import { MeStore } from './me-store.js';

/** My Profile › Account & Security: always the signed-in user's own data; no permission needed. */
@Injectable()
export class MeService {
  constructor(
    private readonly store: MeStore,
    private readonly sessionStore: SessionStore,
    private readonly passwords: PasswordHasher,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async profile(user: SessionUser): Promise<MyProfile> {
    const p = await this.store.profile(user.tenantId, user.id);
    if (!p) throw new NotFoundError('Account not found');
    return p;
  }

  async updateProfile(user: SessionUser, meta: RequestMeta, input: MyProfileUpdate): Promise<MyProfile> {
    const current = await this.profile(user);
    if (current.rowVersion !== input.rowVersion) throw new ConcurrencyError('Your profile changed in another window. Reload and try again.');
    if (input.defaultBranchId && !current.branches.some((b) => b.id === input.defaultBranchId)) {
      throw new ValidationError('Choose one of your branches', { defaultBranchId: ['Not one of your branches'] });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.updateProfile(user.id, input));
    return this.profile(user);
  }

  /** Changes the own password and signs out every other device. */
  async changePassword(user: SessionUser, meta: RequestMeta, input: ChangePassword): Promise<void> {
    const current = await this.store.passwordHash(user.id);
    if (!current || !(await this.passwords.verify(input.currentPassword, current.hash))) {
      throw new ValidationError('Your current password is not correct.', { currentPassword: ['Not correct'] }, { code: 'AUTH_PASSWORD_INCORRECT' });
    }
    const problem = passwordProblem(input.newPassword);
    if (problem) throw new ValidationError(problem, { newPassword: [problem] }, { code: 'PASSWORD_TOO_WEAK' });
    const hash = await this.passwords.hash(input.newPassword);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.setPassword(user.id, current.rowVersion, hash);
      await this.sessionStore.revokeAllForUser(user.tenantId, user.id, 'PASSWORD_CHANGED', user.id, meta.sessionId);
    });
  }

  async listSessions(user: SessionUser, currentSessionId: string | undefined): Promise<UserSession[]> {
    const open = await this.sessionStore.listOpen(user.tenantId, user.id);
    return open.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      clientType: s.clientType,
      ipAddress: s.ipAddress,
      signedInAt: s.signedInAt.toISOString(),
      lastActiveAt: s.lastActiveAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  }

  /** Signs out one of the user's own devices, or all except this one. */
  async revokeSessions(user: SessionUser, meta: RequestMeta, sessionId?: string): Promise<void> {
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (!sessionId) return void (await this.sessionStore.revokeAllForUser(user.tenantId, user.id, 'USER_REVOKED', user.id, meta.sessionId));
      const s = await this.sessionStore.find(sessionId);
      if (!s || s.userId !== user.id) throw new NotFoundError('Session not found');
      await this.sessionStore.revoke(user.tenantId, sessionId, 'USER_REVOKED', user.id);
    });
  }

  activity(user: SessionUser) {
    return this.store.activity(user.tenantId, user.id, 8);
  }

  preferences(user: SessionUser): Promise<MyPreferencesResponse> {
    return this.store.preferences(user.tenantId, user.id);
  }

  async savePreferences(user: SessionUser, meta: RequestMeta, input: MyPreferencesUpdate): Promise<MyPreferencesResponse> {
    const current = await this.store.preferences(user.tenantId, user.id);
    if (current.saved && input.rowVersion !== undefined && input.rowVersion !== current.rowVersion) {
      throw new ConcurrencyError('Your preferences changed in another window. Reload and try again.');
    }
    const { rowVersion, ...prefs } = input;
    await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.savePreferences(user.tenantId, user.id, prefs, current.saved ? (rowVersion ?? current.rowVersion) : undefined),
    );
    return this.store.preferences(user.tenantId, user.id);
  }
}
