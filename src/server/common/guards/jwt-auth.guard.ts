import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SessionStore } from '../../core/application/ports/session-store.js';
import { TenantAccess } from '../../core/application/ports/tenant-access.js';
import { TokenService } from '../../core/application/ports/token-service.js';
import { ForbiddenError, UnauthorizedError } from '../../core/domain/errors.js';
import { toSessionUser } from '../../modules/auth/application/session-user.mapper.js';
import { TOUCH_EVERY_MS } from '../../modules/auth/domain/sign-in-policy.js';
import { UserRepository } from '../../modules/users/domain/user.repository.js';
import { IS_ADMIN_ROUTE_KEY } from '../decorators/admin-route.decorator.js';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

export const AUTH_COOKIE = 'access_token';

/** While a new password is required, only these API paths open (own account, sign-out, select lists). */
const PASSWORD_CHANGE_PATHS = /^\/api\/(auth|me|lookups)(\/|$)/;

/** Requests that never change data (allowed for READ_ONLY companies and read-only support sessions). */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Phase 40: ending a support session is always allowed, even when the session is read-only. */
const ALWAYS_ALLOWED = /^\/api\/me\/support-access\/end$/;

/**
 * Global guard: every tenant API route requires a valid session unless marked @Public() or @AdminRoute().
 * The token must name a Company.UserSessions row that is not revoked, expired or idle past the user's timeout.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionStore,
    private readonly users: UserRepository,
    private readonly access: TenantAccess,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    // Admin routes are authenticated by AdminJwtGuard; a tenant token never opens them.
    if (this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ROUTE_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & Partial<AuthenticatedRequest>>();
    const token = extractToken(request);
    const payload = token ? await this.tokens.verify(token) : null;
    const session = payload ? await this.sessions.find(payload.sessionId) : null;
    if (!payload || !session || session.userId !== payload.userId) throw new UnauthorizedError('Not signed in');
    if (session.revokedAt) throw new UnauthorizedError('Signed out', undefined, { code: 'AUTH_SESSION_REVOKED' });

    // Load the user on every request so a suspended or removed account loses access immediately.
    const user = await this.users.findById(payload.userId);
    if (!user) throw new UnauthorizedError('Not signed in');

    const now = Date.now();
    const idleMs = now - session.lastActiveAt.getTime();
    if (session.expiresAt.getTime() <= now || idleMs > user.sessionTimeoutMin * 60_000) {
      throw new UnauthorizedError('Session expired', undefined, { code: 'AUTH_SESSION_EXPIRED' });
    }
    if (idleMs > TOUCH_EVERY_MS) await this.sessions.touch(session.id);
    if (user.mustChangePassword && !PASSWORD_CHANGE_PATHS.test(request.path)) {
      throw new ForbiddenError('Set a new password to continue', undefined, { code: 'AUTH_PASSWORD_CHANGE_REQUIRED' });
    }

    // Phase 40: the company must be live, and a READ_ONLY company (or a read-only support session) can only read.
    const status = await this.access.tenantStatus(session.tenantId);
    if (status === 'SUSPENDED') throw new ForbiddenError('This company is suspended', undefined, { code: 'TENANT_SUSPENDED' });
    if (!status || status === 'CHURNED' || status === 'PROVISIONING') throw new ForbiddenError('This company is not active', undefined, { code: 'TENANT_INACTIVE' });
    const writes = !SAFE_METHODS.has(request.method) && !ALWAYS_ALLOWED.test(request.path);
    let impersonatedBy: string | undefined;
    if (session.authMethod === 'IMPERSONATION') {
      const support = await this.access.supportSession(session.id);
      if (!support || support.endedAt) throw new UnauthorizedError('The support session has ended', undefined, { code: 'IMPERSONATION_ENDED' });
      if (support.expiresAt.getTime() <= now) {
        await this.access.expire(support.id, session.id);
        throw new UnauthorizedError('The support session has ended', undefined, { code: 'IMPERSONATION_ENDED' });
      }
      if (support.isReadOnly && writes) throw new ForbiddenError('This support session is read-only', undefined, { code: 'IMPERSONATION_READ_ONLY' });
      impersonatedBy = support.staffLabel;
    }
    if (status === 'READ_ONLY' && writes) throw new ForbiddenError('This company is read-only', undefined, { code: 'TENANT_READ_ONLY' });

    request.user = toSessionUser(user);
    request.sessionId = session.id;
    (request as Request & { impersonatedBy?: string }).impersonatedBy = impersonatedBy;
    return true;
  }
}

export function extractToken(request: Request): string | undefined {
  const cookie = request.cookies?.[AUTH_COOKIE] as string | undefined;
  if (cookie) return cookie;
  const [type, value] = request.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' ? value : undefined;
}
