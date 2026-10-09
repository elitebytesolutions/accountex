import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  ProfileChangeApproveSchema, ProfileChangeCreateSchema, ProfileChangeQuerySchema, ProfileChangeRejectSchema,
  type ProfileChangeApprove, type ProfileChangeCreate, type ProfileChangeQuery, type ProfileChangeReject,
} from '../../../../../shared/self-service/profile-change.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ProfileChangesService } from '../application/profile-changes.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/me/personal-details and /api/me/profile-change-requests: My Profile › Personal details (own record only). */
@Controller('me')
export class MyProfileController {
  constructor(private readonly changes: ProfileChangesService) {}

  @Get('personal-details')
  @RequirePermission('myprof:view')
  profile(@CurrentUser() user: SessionUser) {
    return this.changes.myProfile(user);
  }

  @Post('profile-change-requests')
  @RequirePermission('myprof:edit')
  request(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ProfileChangeCreateSchema)) body: ProfileChangeCreate) {
    return this.changes.request(user, meta, body);
  }

  @Post('profile-change-requests/:id/withdraw')
  @HttpCode(200)
  @RequirePermission('myprof:edit')
  withdraw(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.changes.withdraw(user, meta, id, body.rowVersion);
  }
}

/** /api/hr/profile-change-requests: HR reviews employees' requested changes; approval writes the value to the employee record. */
@Controller('hr/profile-change-requests')
export class ProfileChangeRequestsController {
  constructor(private readonly changes: ProfileChangesService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(ProfileChangeQuerySchema)) q: ProfileChangeQuery) {
    return this.changes.list(user, q);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.changes.get(user, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ProfileChangeApproveSchema)) body: ProfileChangeApprove) {
    return this.changes.approve(user, meta, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ProfileChangeRejectSchema)) body: ProfileChangeReject) {
    return this.changes.reject(user, meta, id, body);
  }
}
