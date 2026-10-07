import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  PollCreateSchema, PollUpdateSchema, PulseSurveyCreateSchema, PulseSurveyUpdateSchema,
  type PollCreate, type PollUpdate, type PulseSurveyCreate, type PulseSurveyUpdate,
} from '../../../../../shared/self-service/engagement.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { EngagementSetupService } from '../application/engagement-setup.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const move = pipe(z.enum(['open', 'close']));

/** /api/company/polls and /api/company/pulse-surveys: Workforce › Employee engagement › Polls & surveys (HR staff, emp:*). */
@Controller('company')
export class EngagementController {
  constructor(private readonly engagement: EngagementSetupService) {}

  @Get('engagement-options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.engagement.options(user);
  }

  @Get('polls')
  @RequirePermission('emp:view')
  polls(@CurrentUser() user: SessionUser) {
    return this.engagement.polls(user);
  }

  @Post('polls')
  @RequirePermission('emp:create')
  createPoll(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PollCreateSchema)) body: PollCreate) {
    return this.engagement.createPoll(user, meta, body);
  }

  @Patch('polls/:id')
  @RequirePermission('emp:edit')
  updatePoll(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PollUpdateSchema)) body: PollUpdate) {
    return this.engagement.updatePoll(user, meta, id, body);
  }

  @Post('polls/:id/:action')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  movePoll(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', move) action: 'open' | 'close', @Body(version) body: { rowVersion: number }) {
    return this.engagement.movePoll(user, meta, id, action, body.rowVersion);
  }

  @Delete('polls/:id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async deletePoll(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.engagement.deletePoll(user, meta, id, q.rowVersion);
  }

  @Get('pulse-surveys')
  @RequirePermission('emp:view')
  surveys(@CurrentUser() user: SessionUser) {
    return this.engagement.surveys(user);
  }

  @Post('pulse-surveys')
  @RequirePermission('emp:create')
  createSurvey(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PulseSurveyCreateSchema)) body: PulseSurveyCreate) {
    return this.engagement.createSurvey(user, meta, body);
  }

  @Patch('pulse-surveys/:id')
  @RequirePermission('emp:edit')
  updateSurvey(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PulseSurveyUpdateSchema)) body: PulseSurveyUpdate) {
    return this.engagement.updateSurvey(user, meta, id, body);
  }

  @Post('pulse-surveys/:id/:action')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  moveSurvey(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', move) action: 'open' | 'close', @Body(version) body: { rowVersion: number }) {
    return this.engagement.moveSurvey(user, meta, id, action, body.rowVersion);
  }

  @Delete('pulse-surveys/:id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async deleteSurvey(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.engagement.deleteSurvey(user, meta, id, q.rowVersion);
  }
}

/** /api/me/engagement: the open poll / pulse cards on My Profile › Kudos & Pulse (mykudos:view). */
@Controller('me/engagement')
export class MyEngagementController {
  constructor(private readonly engagement: EngagementSetupService) {}

  @Get()
  @RequirePermission('mykudos:view')
  mine(@CurrentUser() user: SessionUser) {
    return this.engagement.mine(user);
  }
}
