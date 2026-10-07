import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ResetPasswordSchema,
  RowVersionSchema,
  UserCreateSchema,
  UserUpdateSchema,
  type ResetPassword,
  type SessionUser,
  type UserCreate,
  type UserUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { UsersService } from '../application/users.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/settings/users: Settings › Users. */
@Controller('settings/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('usr:view')
  list(@CurrentUser() user: SessionUser) {
    return this.users.list(user);
  }

  @Get('summary')
  @RequirePermission('usr:view')
  summary(@CurrentUser() user: SessionUser) {
    return this.users.summary(user);
  }

  @Get(':id')
  @RequirePermission('usr:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.users.get(user, id);
  }

  @Post()
  @RequirePermission('usr:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(UserCreateSchema)) body: UserCreate) {
    return this.users.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('usr:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(UserUpdateSchema)) body: UserUpdate) {
    return this.users.update(user, meta, id, body);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @RequirePermission('usr:edit')
  suspend(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.users.setStatus(user, meta, id, 'SUSPENDED', body.rowVersion);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission('usr:edit')
  reactivate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.users.setStatus(user, meta, id, 'ACTIVE', body.rowVersion);
  }

  @Post(':id/remove')
  @HttpCode(204)
  @RequirePermission('usr:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    await this.users.setStatus(user, meta, id, 'REMOVED', body.rowVersion);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @RequirePermission('usr:edit')
  resetPassword(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPassword) {
    return this.users.resetPassword(user, meta, id, body);
  }

  @Get(':id/sessions')
  @RequirePermission('usr:view')
  sessions(@CurrentUser() user: SessionUser, @Req() req: Request & { sessionId?: string }, @Param('id', uuid) id: string) {
    return this.users.sessionsOf(user, id, req.sessionId);
  }

  @Delete(':id/sessions')
  @HttpCode(204)
  @RequirePermission('usr:edit')
  async revokeAll(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    await this.users.revokeSessions(user, meta, id);
  }

  @Delete(':id/sessions/:sid')
  @HttpCode(204)
  @RequirePermission('usr:edit')
  async revokeOne(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('sid', uuid) sid: string) {
    await this.users.revokeSessions(user, meta, id, sid);
  }

  @Get(':id/activity')
  @RequirePermission('usr:view')
  activity(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.users.activity(user, id);
  }
}
