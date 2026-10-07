import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoginSchema, type LoginInput, type SessionUser } from '../../../../shared/index.js';
import type { CookieOptions, Request, Response } from 'express';
import { ReqMeta } from '../../../common/context/request-meta.js';
import type { RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { AUTH_COOKIE, extractToken } from '../../../common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { env } from '../../../infrastructure/config/env.js';
import { AuthService } from '../application/auth.service.js';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) input: LoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUser> {
    const { user, token } = await this.auth.login(input, meta);
    res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: env.SESSION_TTL_SECONDS * 1000 });
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(extractToken(req), meta);
    res.clearCookie(AUTH_COOKIE, cookieOptions);
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
