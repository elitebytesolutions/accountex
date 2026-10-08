import { Injectable } from '@nestjs/common';
import type { AdminLoginInput, AdminSession, ChangePassword } from '../../../../shared/index.js';
import { AdminTokenService } from '../../../core/application/ports/admin-token-service.js';
import { PasswordHasher } from '../../../core/application/ports/password-hasher.js';
import { UnauthorizedError } from '../../../core/domain/errors.js';
import { AdminLoginPolicy } from '../config/security/application/admin-login-policy.js';
import { PlatformAdminRepository } from '../domain/platform-admin.repository.js';
import { toAdminSession } from './admin-session.mapper.js';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly admins: PlatformAdminRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AdminTokenService,
    // Phase 38: IP allow-list, failed-sign-in lockout and password policy (Platform security settings).
    private readonly policy: AdminLoginPolicy,
  ) {}

  async login(input: AdminLoginInput, clientIp?: string): Promise<{ admin: AdminSession; token: string }> {
    // Phase 38: the network check comes first (break-glass: an empty or unenforced allow-list never blocks).
    await this.policy.assertNetworkAllowed(clientIp);
    const admin = await this.admins.findByEmail(input.email);
    if (admin) await this.policy.assertNotLocked(admin.id);
    const valid = await this.passwords.verify(input.password, admin?.passwordHash ?? null);
    if (!admin || !valid) {
      const locked = admin ? await this.policy.recordFailure(admin.id) : null;
      throw locked ?? new UnauthorizedError('Invalid email or password');
    }
    await this.policy.recordSuccess(admin.id);

    return { admin: toAdminSession(admin), token: await this.tokens.sign({ adminId: admin.id }) };
  }

  /** Phase 38: the signed-in admin changes their password; the new one must pass the platform password policy. */
  async changePassword(session: AdminSession, input: ChangePassword): Promise<void> {
    const admin = await this.admins.findById(session.id);
    if (!admin || !(await this.passwords.verify(input.currentPassword, admin.passwordHash))) {
      throw new UnauthorizedError('Your current password is not correct.', { currentPassword: ['Not correct'] }, { code: 'AUTH_PASSWORD_INCORRECT' });
    }
    await this.policy.assertPasswordAllowed(input.newPassword);
    await this.policy.setPasswordHash(admin.id, await this.passwords.hash(input.newPassword));
  }
}
