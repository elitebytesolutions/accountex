import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '../../../shared/index.js';

/** Set by JwtAuthGuard: the signed-in user and the Company.UserSessions row of this request. */
export type AuthenticatedRequest = { user: SessionUser; sessionId: string };

/** Injects the signed-in user (attached by JwtAuthGuard) into a route handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
