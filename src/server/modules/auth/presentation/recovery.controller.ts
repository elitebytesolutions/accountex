import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ForgotPasswordSchema, SetPasswordSchema, type ForgotPasswordInput, type SetPasswordInput } from '../../../../shared/index.js';
import { ReqMeta } from '../../../common/context/request-meta.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { RecoveryService } from '../application/recovery.service.js';

/** /api/auth: forgot password, one-time link check and "set your password" (public, throttled). */
@Controller('auth')
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot')
  @HttpCode(200)
  forgot(@ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput) {
    return this.recovery.forgot(meta, body);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('token/:token')
  token(@Param('token') token: string) {
    return this.recovery.tokenInfo(token.slice(0, 200));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset')
  @HttpCode(200)
  reset(@ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(SetPasswordSchema)) body: SetPasswordInput) {
    return this.recovery.setPassword(meta, body);
  }
}
