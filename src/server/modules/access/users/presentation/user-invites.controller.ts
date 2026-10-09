import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, UserInviteSchema, type SessionUser, type UserInviteInput } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { UsersService } from '../application/users.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const ListQuery = z.object({ all: z.coerce.boolean().default(false) });

/** /api/settings/users/invites: invitations (Phase 44). Registered before the users controller's /:id routes. */
@Controller('settings/users/invites')
export class UserInvitesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('usr:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(ListQuery)) q: { all: boolean }) {
    return this.users.invites(user, q.all);
  }

  /** Creates the invited user and returns the one-time link (shown once). */
  @Post()
  @RequirePermission('usr:create')
  invite(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(UserInviteSchema)) body: UserInviteInput) {
    return this.users.invite(user, meta, body);
  }

  @Post(':id/resend')
  @HttpCode(200)
  @RequirePermission('usr:create')
  resend(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.users.resendInvite(user, meta, id, body.rowVersion);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermission('usr:edit')
  revoke(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.users.revokeInvite(user, meta, id, body.rowVersion);
  }
}
