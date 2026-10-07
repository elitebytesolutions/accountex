import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoginSchema, type AdminSession, type LoginInput } from '../../../../shared/index.js';
import type { CookieOptions, Response } from 'express';
import { AdminRoute } from '../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { ADMIN_AUTH_COOKIE } from '../../../common/guards/admin-jwt.guard.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) input: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminSession> {
    const { admin, token } = await this.auth.login(input);
    res.cookie(ADMIN_AUTH_COOKIE, token, { ...cookieOptions, maxAge: env.ADMIN_SESSION_TTL_SECONDS * 1000 });
    return admin;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ADMIN_AUTH_COOKIE, cookieOptions);
  }

  @Get('me')
  me(@CurrentAdmin() admin: AdminSession): AdminSession {
    return admin;
  }
}
