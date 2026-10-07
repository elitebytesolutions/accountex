import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminSession } from '../../../shared/index.js';

export type AdminAuthenticatedRequest = { admin: AdminSession };

/** Injects the signed-in platform admin (attached by AdminJwtGuard) into a route handler. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminSession =>
    ctx.switchToHttp().getRequest<AdminAuthenticatedRequest>().admin,
);
