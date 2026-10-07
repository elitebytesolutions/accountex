import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ADMIN_AUTH_COOKIE } from './admin-jwt.guard.js';
import { AUTH_COOKIE } from './jwt-auth.guard.js';

/**
 * Rate limits per signed-in session instead of per IP. Next.js server components call the API over loopback,
 * so keying by IP put every user's page loads into one shared bucket. Anonymous requests (login) stay per IP.
 */
@Injectable()
export class ThrottlerBySessionGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const session = cookies[AUTH_COOKIE] ?? cookies[ADMIN_AUTH_COOKIE];
    if (session) return 'session:' + createHash('sha256').update(session).digest('hex').slice(0, 32);
    return 'ip:' + String(req.ip ?? 'unknown');
  }
}
