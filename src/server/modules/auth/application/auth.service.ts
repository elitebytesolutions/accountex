import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TENANT_SIGN_IN_STATUSES, type LoginInput, type SessionUser } from '../../../../shared/index.js';
import { PasswordHasher } from '../../../core/application/ports/password-hasher.js';
import { SessionStore } from '../../../core/application/ports/session-store.js';
import { TokenService } from '../../../core/application/ports/token-service.js';
import { UnitOfWork, type RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { ForbiddenError, UnauthorizedError } from '../../../core/domain/errors.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { deviceLabel, LOCK_AFTER_FAILURES, LOCK_MINUTES, LOCKOUT_ENABLED, withinLoginHours } from '../domain/sign-in-policy.js';
import { toSessionUser } from './session-user.mapper.js';
import { SignInStore } from './sign-in-store.js';

/** Sign-in: company code + email + password, then a server-side session the user or an admin can revoke. */
@Injectable()
export class AuthService {
  constructor(
    private readonly signIn: SignInStore,
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async login(input: LoginInput, meta: RequestMeta): Promise<{ user: SessionUser; token: string }> {
    const candidate = await this.signIn.findCandidate(input.companyCode, input.email);
    const now = new Date();

    if (LOCKOUT_ENABLED && candidate?.lockedUntil && candidate.lockedUntil > now) {
      throw new ForbiddenError('Too many failed sign-ins', undefined, { code: 'AUTH_ACCOUNT_LOCKED', log: { userId: candidate.id } });
    }
    // Suspended accounts verify against no hash, so they fail exactly like a wrong password.
    const valid = await this.passwords.verify(input.password, candidate?.status === 'ACTIVE' ? candidate.passwordHash : null);
    if (!candidate || !valid) {
      // Only active accounts count failures (they drive the lockout); a suspended account's row is left alone.
      if (candidate?.status === 'ACTIVE') {
        // A wrong password on a known account is recorded against that account, authored by the anonymous attempt.
        const lockUntil = LOCKOUT_ENABLED && candidate.failedLoginCount + 1 >= LOCK_AFTER_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
        await this.unitOfWork.run({ ...meta, userId: null, tenantId: candidate.tenantId, actorLabel: 'login attempt' }, () =>
          this.signIn.recordFailedLogin(candidate.id, lockUntil),
        );
      }
      throw new UnauthorizedError('Invalid company, email or password', undefined, {
        code: 'AUTH_INVALID_CREDENTIALS',
        log: { companyCode: input.companyCode, attemptedEmail: input.email, accountFound: Boolean(candidate), status: candidate?.status },
      });
    }
    // Phase 40: only live companies sign in (the password is checked first, so a suspended company can't be probed).
    if (candidate.tenantStatus === 'SUSPENDED') {
      throw new ForbiddenError('This company is suspended', undefined, { code: 'TENANT_SUSPENDED', log: { userId: candidate.id } });
    }
    if (!TENANT_SIGN_IN_STATUSES.includes(candidate.tenantStatus)) {
      throw new ForbiddenError('This company is not active', undefined, { code: 'TENANT_INACTIVE', log: { userId: candidate.id, status: candidate.tenantStatus } });
    }
    if (!withinLoginHours({ hours: candidate.loginHours, from: candidate.loginFrom, to: candidate.loginTo }, now, candidate.timeZone)) {
      throw new ForbiddenError('Outside allowed login hours', undefined, { code: 'AUTH_OUTSIDE_LOGIN_HOURS', log: { userId: candidate.id } });
    }
    if (!(await this.signIn.ipAllowed(candidate.id, meta.clientIp))) {
      throw new ForbiddenError('IP not allowed', undefined, { code: 'AUTH_IP_NOT_ALLOWED', log: { userId: candidate.id, ip: meta.clientIp } });
    }

    // The user proved who they are, so the sign-in is recorded as theirs, under the new session.
    const sessionId = randomUUID();
    const token = await this.tokens.sign({ userId: candidate.id, sessionId });
    await this.unitOfWork.run({ ...meta, sessionId, userId: candidate.id, tenantId: candidate.tenantId }, async () => {
      await this.signIn.recordLogin(candidate.id, meta.clientIp);
      await this.sessions.create({
        id: sessionId,
        tenantId: candidate.tenantId,
        userId: candidate.id,
        token,
        deviceLabel: deviceLabel(meta.userAgent),
        userAgent: meta.userAgent,
        ipAddress: meta.clientIp,
        expiresAt: new Date(now.getTime() + this.tokens.ttlSeconds * 1000),
      });
    });
    const user = await this.users.findById(candidate.id);
    if (!user) throw new UnauthorizedError('Not signed in');
    return { user: toSessionUser(user), token };
  }

  /** Ends the session behind `token`, if it is still valid. Always succeeds for the caller. */
  async logout(token: string | undefined, meta: RequestMeta): Promise<void> {
    const payload = token ? await this.tokens.verify(token) : null;
    const session = payload ? await this.sessions.find(payload.sessionId) : null;
    if (!payload || !session || session.revokedAt || session.userId !== payload.userId) return;
    await this.unitOfWork.run({ ...meta, sessionId: session.id, userId: session.userId, tenantId: session.tenantId }, () =>
      this.sessions.revoke(session.tenantId, session.id, 'SIGN_OUT', session.userId),
    );
  }
}
