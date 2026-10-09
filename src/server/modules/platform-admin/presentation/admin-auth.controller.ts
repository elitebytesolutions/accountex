import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminLoginSchema, ChangePasswordSchema, type AdminLoginInput, type AdminSession, type ChangePassword } from '../../../../shared/index.js';
import type { CookieOptions, Response } from 'express';
import { ReqMeta } from '../../../common/context/request-meta.js';
import { AdminRoute } from '../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { ADMIN_AUTH_COOKIE } from '../../../common/guards/admin-jwt.guard.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { env } from '../../../infrastructure/config/env.js';
import { AdminAuthService } from '../application/admin-auth.service.js';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

@AdminRoute()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  // Per-route 5/min sign-in limit removed for now; the global limit (app.module) still applies.
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(AdminLoginSchema)) input: AdminLoginInput,
    @Res({ passthrough: true }) res: Response,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminSession> {
    // Phase 38: the request IP is checked against the console allow-list.
    const { admin, token } = await this.auth.login(input, meta.clientIp);
    res.cookie(ADMIN_AUTH_COOKIE, token, { ...cookieOptions, maxAge: env.ADMIN_SESSION_TTL_SECONDS * 1000 });
    return admin;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ADMIN_AUTH_COOKIE, cookieOptions);
  }

  /** Phase 38: change the Super Admin password (platform password policy applies). */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentAdmin() admin: AdminSession, @Body(new ZodValidationPipe(ChangePasswordSchema)) input: ChangePassword) {
    await this.auth.changePassword(admin, input);
  }

  @Get('me')
  me(@CurrentAdmin() admin: AdminSession): AdminSession {
    return admin;
  }
}
