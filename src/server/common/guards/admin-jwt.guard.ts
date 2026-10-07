import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AdminTokenService } from '../../core/application/ports/admin-token-service.js';
import { UnauthorizedError } from '../../core/domain/errors.js';
import { toAdminSession } from '../../modules/platform-admin/application/admin-session.mapper.js';
import { PlatformAdminRepository } from '../../modules/platform-admin/domain/platform-admin.repository.js';
import type { AdminAuthenticatedRequest } from '../decorators/current-admin.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

export const ADMIN_AUTH_COOKIE = 'admin_token';

/** Guards @AdminRoute() controllers: requires a valid Super Admin token (cookie only). */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AdminTokenService,
    private readonly admins: PlatformAdminRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & Partial<AdminAuthenticatedRequest>>();
    const token = request.cookies?.[ADMIN_AUTH_COOKIE] as string | undefined;
    const payload = token ? await this.tokens.verify(token) : null;
    // Load the admin on every request so a removed admin loses access immediately.
    const admin = payload ? await this.admins.findById(payload.adminId) : null;
    if (!admin) throw new UnauthorizedError('Not signed in');

    request.admin = toAdminSession(admin);
    return true;
  }
}
