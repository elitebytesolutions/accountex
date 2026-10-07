import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SessionUser } from '../../../shared/index.js';
import { PermissionDeniedError } from '../../core/domain/errors.js';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permission.decorator.js';

/**
 * Global guard, after JwtAuthGuard: enforces @RequirePermission() with the signed-in user's permission codes
 * (union of all their roles, loaded fresh on every request). Routes without the decorator are not affected.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: SessionUser }>().user;
    const missing = required.filter((code) => !user?.permissions.includes(code));
    if (missing.length) {
      throw new PermissionDeniedError('You do not have permission to do this.', undefined, { log: { missing } });
    }
    return true;
  }
}
