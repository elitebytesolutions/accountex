import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  LeaveApplySchema, LeaveApproveManySchema, LeaveCancelSchema, LeaveDecisionSchema, LeaveOnBehalfSchema, LeaveOverviewQuerySchema, LeavePreviewSchema,
  LeaveRejectSchema, LeaveRequestQuerySchema, type LeaveApply, type LeaveOnBehalf, type LeavePreviewInput, type LeaveReject, type LeaveRequestQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { LeaveRequestsService } from '../application/leave-requests.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/leave-requests: HR › Leave (overview, requests, apply on behalf). Decisions follow the approval engine's step. */
@Controller('hr/leave-requests')
export class LeaveRequestsController {
  constructor(private readonly requests: LeaveRequestsService) {}

  @Get()
  @RequirePermission('lv:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(LeaveRequestQuerySchema)) q: LeaveRequestQuery) {
    return this.requests.list(user, q);
  }

  @Get('overview')
  @RequirePermission('lv:view')
  overview(@CurrentUser() user: SessionUser, @Query(pipe(LeaveOverviewQuerySchema)) q: z.infer<typeof LeaveOverviewQuerySchema>) {
    return this.requests.overview(user, q);
  }

  @Get('options')
  @RequirePermission('lv:view')
  options(@CurrentUser() user: SessionUser) {
    return this.requests.options(user);
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('lv:view')
  preview(@CurrentUser() user: SessionUser, @Body(pipe(LeavePreviewSchema)) body: LeavePreviewInput) {
    return this.requests.preview(user, body, false);
  }

  /** Apply on behalf: the approval chain is skipped and the leave is recorded approved. */
  @Post()
  @RequirePermission('lv:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(LeaveOnBehalfSchema)) body: LeaveOnBehalf) {
    return this.requests.applyOnBehalf(user, meta, body);
  }

  @Post('approve-many')
  @HttpCode(200)
  @RequirePermission('lv:view')
  approveMany(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(LeaveApproveManySchema)) body: { ids: string[] }) {
    return this.requests.approveMany(user, meta, body.ids);
  }

  @Get(':id')
  @RequirePermission('lv:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.requests.get(user, id);
  }

  /** Eligibility is the approval engine's (the current step's approvers); with no engine request: lv:approve or the line manager. */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('lv:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeaveDecisionSchema)) body: { comment: string | null }) {
    return this.requests.approve(user, meta, id, body.comment);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('lv:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeaveRejectSchema)) body: LeaveReject) {
    return this.requests.reject(user, meta, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('lv:approve')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeaveCancelSchema)) body: { reason: string | null; rowVersion: number }) {
    return this.requests.cancel(user, meta, id, body.reason, body.rowVersion);
  }
}

/** /api/me/leave-requests and /api/me/leave-balances: My Profile › Leave (own data only). */
@Controller('me')
export class MyLeaveController {
  constructor(private readonly requests: LeaveRequestsService) {}

  @Get('leave-balances')
  @RequirePermission('mylv:view')
  mine(@CurrentUser() user: SessionUser) {
    return this.requests.myLeave(user);
  }

  @Post('leave-requests/preview')
  @HttpCode(200)
  @RequirePermission('mylv:view')
  preview(@CurrentUser() user: SessionUser, @Body(pipe(LeavePreviewSchema)) body: LeavePreviewInput) {
    return this.requests.preview(user, body, true);
  }

  @Get('leave-requests/:id')
  @RequirePermission('mylv:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.requests.get(user, id, true);
  }

  @Post('leave-requests')
  @RequirePermission('mylv:create')
  apply(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(LeaveApplySchema)) body: LeaveApply) {
    return this.requests.apply(user, meta, body);
  }

  @Post('leave-requests/:id/cancel')
  @HttpCode(200)
  @RequirePermission('mylv:create')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeaveCancelSchema)) body: { reason: string | null; rowVersion: number }) {
    return this.requests.cancelMine(user, meta, id, body.reason, body.rowVersion);
  }
}
