import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ChangePasswordSchema,
  MyPreferencesUpdateSchema,
  MyProfileUpdateSchema,
  type ChangePassword,
  type MyPreferencesUpdate,
  type MyProfileUpdate,
  type SessionUser,
} from '../../../../shared/index.js';
import { ReqMeta } from '../../../common/context/request-meta.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../core/application/ports/unit-of-work.js';
import { MeService } from '../application/me.service.js';

/** /api/me: the signed-in user's own account (My Profile › Account & Security). No permission needed. */
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('profile')
  profile(@CurrentUser() user: SessionUser) {
    return this.me.profile(user);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(MyProfileUpdateSchema)) body: MyProfileUpdate) {
    return this.me.updateProfile(user, meta, body);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePassword) {
    await this.me.changePassword(user, meta, body);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: SessionUser, @Req() req: Request & { sessionId?: string }) {
    return this.me.listSessions(user, req.sessionId);
  }

  @Delete('sessions')
  @HttpCode(204)
  async revokeOthers(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    await this.me.revokeSessions(user, meta);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.me.revokeSessions(user, meta, id);
  }

  @Get('activity')
  activity(@CurrentUser() user: SessionUser) {
    return this.me.activity(user);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: SessionUser) {
    return this.me.preferences(user);
  }

  @Patch('preferences')
  savePreferences(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(MyPreferencesUpdateSchema)) body: MyPreferencesUpdate) {
    return this.me.savePreferences(user, meta, body);
  }
}
