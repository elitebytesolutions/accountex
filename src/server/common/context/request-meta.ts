import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestMeta } from '../../core/application/ports/unit-of-work.js';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware.js';

/** Request facts for audit entries and error logs. The request id is set by RequestIdMiddleware. */
export function requestMetaOf(req: Request): RequestMeta {
  return {
    correlationId: req.header(REQUEST_ID_HEADER) ?? 'unknown',
    clientIp: req.ip?.replace(/^::ffff:/, ''),
    userAgent: req.header('user-agent')?.slice(0, 500),
    // Set by JwtAuthGuard, so every change made in this request is tied to the signed-in session.
    sessionId: (req as Request & { sessionId?: string }).sessionId,
  };
}

/** Injects the RequestMeta of the current request into a route handler. */
export const ReqMeta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestMeta => requestMetaOf(ctx.switchToHttp().getRequest<Request>()),
);
