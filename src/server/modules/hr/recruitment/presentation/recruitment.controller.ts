import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RECRUITMENT_OPENING_ACTIONS, RecruitmentActivitySchema, RecruitmentCandidateCreateSchema, RecruitmentCandidateQuerySchema, RecruitmentCandidateUpdateSchema,
  RecruitmentHireSchema, RecruitmentMoveSchema, RecruitmentOpeningActionSchema, RecruitmentOpeningCreateSchema, RecruitmentOpeningUpdateSchema, RecruitmentRejectSchema,
  type RecruitmentActivityInput, type RecruitmentCandidateCreate, type RecruitmentCandidateQuery, type RecruitmentCandidateUpdate, type RecruitmentHire, type RecruitmentMove,
  type RecruitmentOpeningAction, type RecruitmentOpeningActionInput, type RecruitmentOpeningCreate, type RecruitmentOpeningUpdate, type RecruitmentReject, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RecruitmentService } from '../application/recruitment.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/recruitment: Workforce › Talent › Recruitment overview (KPIs, openings with funnel counts) and form options. emp:* applies. */
@Controller('hr/recruitment')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Get()
  @RequirePermission('emp:view')
  overview(@CurrentUser() user: SessionUser) {
    return this.recruitment.overview(user);
  }

  @Get('options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.recruitment.options(user);
  }
}

/** /api/hr/job-openings: requisitions (REQ-). Approve / return follow the JOB_REQUISITION approval step. */
@Controller('hr/job-openings')
export class JobOpeningsController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.recruitment.opening(user, id);
  }

  @Post()
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(RecruitmentOpeningCreateSchema)) body: RecruitmentOpeningCreate) {
    return this.recruitment.createOpening(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RecruitmentOpeningUpdateSchema)) body: RecruitmentOpeningUpdate) {
    return this.recruitment.updateOpening(user, meta, id, body);
  }

  /** submit (emp:create) · approve / return (engine step, or emp:edit with no workflow) · open / hold / close / cancel (emp:edit). */
  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('emp:create')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string,
    @Param('action', pipe(z.enum(RECRUITMENT_OPENING_ACTIONS))) action: RecruitmentOpeningAction, @Body(pipe(RecruitmentOpeningActionSchema)) body: RecruitmentOpeningActionInput) {
    return this.recruitment.openingAction(user, meta, id, action, body);
  }
}

/** /api/hr/candidates: candidates of a requisition, stage moves, activities, reject and hire. */
@Controller('hr/candidates')
export class CandidatesController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(RecruitmentCandidateQuerySchema)) q: RecruitmentCandidateQuery) {
    return this.recruitment.candidates(user, q);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.recruitment.candidate(user, id);
  }

  @Post()
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(RecruitmentCandidateCreateSchema)) body: RecruitmentCandidateCreate) {
    return this.recruitment.createCandidate(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RecruitmentCandidateUpdateSchema)) body: RecruitmentCandidateUpdate) {
    return this.recruitment.updateCandidate(user, meta, id, body);
  }

  @Post(':id/move')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  move(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RecruitmentMoveSchema)) body: RecruitmentMove) {
    return this.recruitment.move(user, meta, id, body);
  }

  @Post(':id/activities')
  @RequirePermission('emp:edit')
  activity(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RecruitmentActivitySchema)) body: RecruitmentActivityInput) {
    return this.recruitment.addActivity(user, meta, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RecruitmentRejectSchema)) body: RecruitmentReject) {
    return this.recruitment.reject(user, meta, id, body);
  }

  /** Creates the employee, so it needs emp:create as well. */
  @Post(':id/hire')
  @HttpCode(200)
  @RequirePermission('emp:create')
  hire(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RecruitmentHireSchema)) body: RecruitmentHire) {
    return this.recruitment.hire(user, meta, id, body);
  }
}
