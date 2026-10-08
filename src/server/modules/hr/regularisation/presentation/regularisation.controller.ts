import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ApproveManySchema, DecisionSchema, RegularisationQuerySchema, RegularisationRejectSchema, RegularisationSchema, RegularisationUpdateSchema, RowVersionSchema,
  type RegularisationInput, type RegularisationUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RegularisationService } from '../application/regularisation.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/regularisation-requests: HR › Attendance › Regularisation. Decisions follow the approval engine's step. */
@Controller('hr/regularisation-requests')
export class RegularisationController {
  constructor(private readonly requests: RegularisationService) {}

  @Get()
  @RequirePermission('att:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(RegularisationQuerySchema)) q: z.infer<typeof RegularisationQuerySchema>) {
    return this.requests.list(user, q);
  }

  @Post('approve-many')
  @HttpCode(200)
  @RequirePermission('att:approve')
  approveMany(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ApproveManySchema)) body: { ids: string[] }) {
    return this.requests.approveMany(user, meta, body.ids);
  }

  @Get(':id')
  @RequirePermission('att:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.requests.get(user, id);
  }

  @Patch(':id')
  @RequirePermission('att:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RegularisationUpdateSchema)) body: RegularisationUpdate) {
    return this.requests.update(user, meta, id, body);
  }

  /** Eligibility is the approval engine's (the request's current step); no workflow: att:approve. */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('att:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DecisionSchema)) body: { comment: string | null }) {
    return this.requests.approve(user, meta, id, body.comment);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('att:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RegularisationRejectSchema)) body: z.infer<typeof RegularisationRejectSchema>) {
    return this.requests.reject(user, meta, id, body);
  }
}

/** /api/me/regularisation-requests: My Profile › Attendance › correction requests (own only). */
@Controller('me/regularisation-requests')
export class MyRegularisationController {
  constructor(private readonly requests: RegularisationService) {}

  @Get()
  @RequirePermission('myatt:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(RegularisationQuerySchema)) q: z.infer<typeof RegularisationQuerySchema>) {
    return this.requests.mine(user, q);
  }

  @Get(':id')
  @RequirePermission('myatt:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.requests.get(user, id, true);
  }

  @Post()
  @RequirePermission('myatt:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(RegularisationSchema)) body: RegularisationInput) {
    return this.requests.create(user, meta, body);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @RequirePermission('myatt:create')
  withdraw(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.requests.withdraw(user, meta, id, body.rowVersion);
  }
}
