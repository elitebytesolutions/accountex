import { Injectable } from '@nestjs/common';
import type { AdminSession, LoginInput } from '../../../../shared/index.js';
import { AdminTokenService } from '../../../core/application/ports/admin-token-service.js';
import { PasswordHasher } from '../../../core/application/ports/password-hasher.js';
import { UnauthorizedError } from '../../../core/domain/errors.js';
import { PlatformAdminRepository } from '../domain/platform-admin.repository.js';
import { toAdminSession } from './admin-session.mapper.js';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly admins: PlatformAdminRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AdminTokenService,
  ) {}

  async login(input: LoginInput): Promise<{ admin: AdminSession; token: string }> {
    const admin = await this.admins.findByEmail(input.email);
    const valid = await this.passwords.verify(input.password, admin?.passwordHash ?? null);
    if (!admin || !valid) throw new UnauthorizedError('Invalid email or password');

    return { admin: toAdminSession(admin), token: await this.tokens.sign({ adminId: admin.id }) };
  }
}
