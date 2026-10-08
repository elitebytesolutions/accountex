import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  MyTaskCompleteSchema, OnboardingCancelSchema, OnboardingQuerySchema, OnboardingStartSchema, OnboardingTaskUpdateSchema, OnboardingUpdateSchema,
  type OnboardingStart, type OnboardingTaskUpdate, type OnboardingUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OnboardingsService } from '../application/onboardings.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/onboardings: Workforce › Talent › Onboarding (new joiners and their tasks). */
@Controller('hr/onboardings')
export class OnboardingsController {
  constructor(private readonly onboardings: OnboardingsService) {}

  @Get()
  @RequirePermission('emp:view')
  board(@CurrentUser() user: SessionUser, @Query(pipe(OnboardingQuerySchema)) q: { status: string }) {
    return this.onboardings.board(user, q.status);
  }

  @Get('options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.onboardings.options(user);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.onboardings.get(user, id);
  }

  /** Start an onboarding from a template (the track's default when none is chosen). */
  @Post()
  @RequirePermission('emp:create')
  start(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(OnboardingStartSchema)) body: OnboardingStart) {
    return this.onboardings.start(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OnboardingUpdateSchema)) body: OnboardingUpdate) {
    return this.onboardings.update(user, meta, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OnboardingCancelSchema)) body: { reason: string | null; rowVersion: number }) {
    return this.onboardings.cancel(user, meta, id, body.reason, body.rowVersion);
  }

  @Patch(':id/tasks/:taskId')
  @RequirePermission('emp:edit')
  task(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('taskId', uuid) taskId: string, @Body(pipe(OnboardingTaskUpdateSchema)) body: OnboardingTaskUpdate) {
    return this.onboardings.updateTask(user, meta, id, taskId, body);
  }
}

/** /api/me/onboarding: My Profile › Onboarding & Policies (own checklist). */
@Controller('me/onboarding')
export class MyOnboardingController {
  constructor(private readonly onboardings: OnboardingsService) {}

  @Get()
  @RequirePermission('myonb:view')
  mine(@CurrentUser() user: SessionUser) {
    return this.onboardings.mine(user);
  }

  @Post('tasks/:id/complete')
  @HttpCode(200)
  @RequirePermission('myonb:edit')
  complete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(MyTaskCompleteSchema)) body: { note: string | null; rowVersion: number }) {
    return this.onboardings.completeMine(user, meta, id, body.note, body.rowVersion);
  }
}
