import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService, type TokenPayload } from '../../core/application/ports/token-service.js';
import { env } from '../config/env.js';

const AUDIENCE = 'tenant';

@Injectable()
export class JwtTokenService extends TokenService {
  readonly ttlSeconds = env.SESSION_TTL_SECONDS;

  constructor(private readonly jwt: JwtService) {
    super();
  }

  sign({ userId, sessionId }: TokenPayload) {
    return this.jwt.signAsync({ sub: userId, sid: sessionId }, { audience: AUDIENCE });
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { sub, sid } = await this.jwt.verifyAsync<{ sub: string; sid?: string }>(token, { audience: AUDIENCE });
      // Tokens issued before server-side sessions carry no session id: they are no longer valid.
      return sid ? { userId: sub, sessionId: sid } : null;
    } catch {
      return null;
    }
  }
}
