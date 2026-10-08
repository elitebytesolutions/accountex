import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  ChangeRequestCancelSchema, ChangeRequestCommentSchema, ChangeRequestCreateSchema, ChangeRequestDecisionSchema, ChangeRequestListQuerySchema,
  FLAG_ENVIRONMENTS, FlagScheduleInputSchema,
  type AdminSession, type ChangeRequestCancel, type ChangeRequestCommentInput, type ChangeRequestCreate, type ChangeRequestDecision,
  type ChangeRequestListQuery, type FlagEnvironment, type FlagScheduleInput,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { NotFoundError } from '../../../../../core/domain/errors.js';
import { ChangeRequestsService } from '../application/change-requests.service.js';

const uuid = new ParseUUIDPipe();
const envParam = (env: string): FlagEnvironment => {
  const e = env.toUpperCase();
  if (!(FLAG_ENVIRONMENTS as readonly string[]).includes(e)) throw new NotFoundError('Unknown environment');
  return e as FlagEnvironment;
};

/** /api/admin/change-requests: Feature Management › Change Requests (Phase 43). */
@AdminRoute()
@Controller('admin/change-requests')
export class ChangeRequestsController {
  constructor(private readonly crs: ChangeRequestsService) {}

  /** ?status=PENDING|APPROVED|REJECTED|CANCELLED|ALL&flagId= → { items, kpis, solo, meStaffId } */
  @Get()
  list(@CurrentAdmin() admin: AdminSession, @Query(new ZodValidationPipe(ChangeRequestListQuerySchema)) q: ChangeRequestListQuery) {
    return this.crs.list(admin, q);
  }

  /** Applies due approved requests and opens requests for due ramp steps now (the hourly ops job, on demand). */
  @Post('run-schedule')
  @HttpCode(200)
  runSchedule(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta) {
    return this.crs.runNow(admin, meta);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.crs.get(id);
  }

  /** From a Production flag edit: { flagId, environment, reason, applyNotBefore?, change }. 409 CR_PENDING_EXISTS. */
  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ChangeRequestCreateSchema)) body: ChangeRequestCreate) {
    return this.crs.create(admin, meta, body);
  }

  @Post(':id/comments')
  @HttpCode(200)
  comment(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ChangeRequestCommentSchema)) body: ChangeRequestCommentInput) {
    return this.crs.comment(admin, meta, id, body.body);
  }

  /** { note, confirmKey? }: 403 FOUR_EYES_REQUIRED (own request, more staff), 400 SOLO_CONFIRM_REQUIRED / CR_NOTE_REQUIRED. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ChangeRequestDecisionSchema)) body: ChangeRequestDecision) {
    return this.crs.approve(admin, meta, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ChangeRequestDecisionSchema)) body: ChangeRequestDecision) {
    return this.crs.reject(admin, meta, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ChangeRequestCancelSchema)) body: ChangeRequestCancel) {
    return this.crs.cancel(admin, meta, id, body.reason);
  }
}

/** /api/admin/flags/:id/schedule/:env: the flag detail's "Scheduled changes" (ramp steps). */
@AdminRoute()
@Controller('admin/flags')
export class FlagScheduleController {
  constructor(private readonly crs: ChangeRequestsService) {}

  @Get(':id/schedule/:env')
  schedule(@Param('id', uuid) id: string, @Param('env') env: string) {
    return this.crs.schedule(id, envParam(env));
  }

  /** { steps: [{ id?, stepDate, rolloutPct }] }: 400 SCHEDULE_INVALID (dates after today, one per date, 0–100 %). */
  @Put(':id/schedule/:env')
  save(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('env') env: string, @Body(new ZodValidationPipe(FlagScheduleInputSchema)) body: FlagScheduleInput) {
    return this.crs.saveSchedule(admin, meta, id, envParam(env), body);
  }
}
