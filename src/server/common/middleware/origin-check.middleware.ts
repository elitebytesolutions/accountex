import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../../core/domain/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence: state-changing requests sent by a browser must come from this app's own origin.
 * Requests without an Origin header (server-side callers, CLI tools) carry no browser cookies to abuse.
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const origin = req.header('origin');
    if (SAFE_METHODS.has(req.method) || !origin) return next();

    let originHost: string | undefined;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = undefined;
    }
    if (originHost !== req.header('host')) throw new ForbiddenError('Cross-origin request rejected');
    next();
  }
}
