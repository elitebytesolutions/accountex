import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminTokenService, type AdminTokenPayload } from '../../core/application/ports/admin-token-service.js';
import { env } from '../config/env.js';

const AUDIENCE = 'platform';

/** Uses its own JwtService (own secret and lifetime), not the tenant one registered by JwtModule. */
@Injectable()
export class JwtAdminTokenService extends AdminTokenService {
  private readonly jwt = new JwtService({
    secret: env.ADMIN_JWT_SECRET,
    signOptions: { expiresIn: env.ADMIN_SESSION_TTL_SECONDS, audience: AUDIENCE },
    verifyOptions: { audience: AUDIENCE },
  });

  sign({ adminId }: AdminTokenPayload) {
    return this.jwt.signAsync({ sub: adminId });
  }

  async verify(token: string): Promise<AdminTokenPayload | null> {
    try {
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token);
      return { adminId: sub };
    } catch {
      return null;
    }
  }
}
