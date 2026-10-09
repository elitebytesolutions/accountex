import { Injectable } from '@nestjs/common';
import type { ForgotPasswordInput, SetPasswordInput, SignInTokenInfo } from '../../../../shared/index.js';
import { MailSender } from '../../../core/application/ports/mail-sender.js';
import { Notifier } from '../../../core/application/ports/notifier.js';
import { PasswordHasher } from '../../../core/application/ports/password-hasher.js';
import { SessionStore } from '../../../core/application/ports/session-store.js';
import { UnitOfWork, type RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { ConflictError, ValidationError } from '../../../core/domain/errors.js';
import { passwordProblem } from '../domain/sign-in-policy.js';
import { RecoveryStore } from './recovery-store.js';
import { hashSignInToken, newSignInToken, SELF_RESET_MINUTES, signInPath } from './sign-in-tokens.js';

const invalid = () => new ConflictError('This link is invalid or has expired. Ask your administrator for a new one.', undefined, { code: 'TOKEN_INVALID_OR_EXPIRED' });

/**
 * Sign-in recovery (Phase 44, public endpoints). A one-time link (invite or password reset) opens the "set your
 * password" page; using it sets the password, activates an invited user, ends their other sessions and is recorded as
 * "password reset". "Forgot password" always answers the same way: it issues a reset link for the mail port (no
 * provider yet, so nothing leaves the system) and tells the company's user admins, who can share a link themselves.
 */
@Injectable()
export class RecoveryService {
  constructor(
    private readonly store: RecoveryStore,
    private readonly passwords: PasswordHasher,
    private readonly sessions: SessionStore,
    private readonly notifier: Notifier,
    private readonly mail: MailSender,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async tokenInfo(token: string): Promise<SignInTokenInfo> {
    const r = await this.store.lookup(hashSignInToken(token));
    if (!r?.valid) return { valid: false, purpose: null, email: null, fullName: null, companyName: null, companyCode: null };
    return { valid: true, purpose: r.purpose, email: r.email, fullName: r.fullName, companyName: r.companyName, companyCode: r.companyCode };
  }

  async setPassword(meta: RequestMeta, input: SetPasswordInput) {
    const problem = passwordProblem(input.password);
    if (problem) throw new ValidationError(problem, { password: [problem] }, { code: 'PASSWORD_TOO_WEAK' });
    const hash = hashSignInToken(input.token);
    const r = await this.store.lookup(hash);
    if (!r?.valid) throw invalid();
    const passwordHash = await this.passwords.hash(input.password);
    await this.unitOfWork.run({ ...meta, userId: null, tenantId: r.tenantId, actorLabel: r.purpose === 'INVITE' ? 'invitation accepted' : 'password reset' }, async () => {
      await this.store.consume(hash, passwordHash);
      if (r.purpose !== 'INVITE') await this.sessions.revokeAllForUser(r.tenantId, r.userId, 'PASSWORD_CHANGED', null);
    });
    return { companyCode: r.companyCode, email: r.email };
  }

  async forgot(meta: RequestMeta, input: ForgotPasswordInput) {
    const u = await this.store.activeUser(input.companyCode, input.email);
    if (u) {
      const { token, hash } = newSignInToken();
      const expiresAt = new Date(Date.now() + SELF_RESET_MINUTES * 60_000);
      await this.unitOfWork.run({ ...meta, userId: null, tenantId: u.tenantId, actorLabel: 'forgot password' }, async () => {
        await this.store.issueReset(u.tenantId, u.userId, hash, expiresAt, meta.clientIp ?? null);
        await this.notifier.notifyPermission(u.tenantId, 'usr:edit', {
          eventCode: 'PASSWORD_RESET_REQUESTED', category: 'SYSTEM', title: `${u.fullName ?? u.email} asked to reset their password`,
          body: this.mail.delivers ? 'A reset link was emailed to them.' : 'No email is set up: share a reset link from Settings > Users.',
          linkRoute: '/settings/users', severity: 'WARN', needsAction: !this.mail.delivers, actorUserId: u.userId,
        });
      });
      await this.mail.send({ to: u.email, subject: 'Reset your password', text: `Open this link within ${SELF_RESET_MINUTES} minutes to choose a new password: ${signInPath(token)}` });
    }
    // the same reply whether or not the account exists
    return { ok: true };
  }
}
