import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema, TrainingBoardQuerySchema, TrainingCompleteSchema, TrainingEnrolmentUpdateSchema, TrainingEnrolSchema, TrainingSessionCreateSchema, TrainingSessionUpdateSchema,
  type SessionUser, type TrainingBoardQuery, type TrainingComplete, type TrainingEnrol, type TrainingEnrolmentUpdate, type TrainingSessionCreate, type TrainingSessionUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { TrainingService } from '../application/training.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/training: board (KPIs, sessions, expiring certifications, enrolments), enrolment and completion. emp:* applies. */
@Controller('hr/training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  @RequirePermission('emp:view')
  board(@CurrentUser() user: SessionUser, @Query(pipe(TrainingBoardQuerySchema)) q: TrainingBoardQuery) {
    return this.training.board(user, q);
  }

  @Get('options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.training.options(user);
  }

  @Patch('sessions/:id')
  @RequirePermission('emp:edit')
  updateSession(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TrainingSessionUpdateSchema)) body: TrainingSessionUpdate) {
    return this.training.updateSession(user, meta, id, body);
  }

  @Post('enrol')
  @HttpCode(200)
  @RequirePermission('emp:create')
  enrol(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(TrainingEnrolSchema)) body: TrainingEnrol) {
    return this.training.enrol(user, meta, body);
  }

  @Patch('enrolments/:id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TrainingEnrolmentUpdateSchema)) body: TrainingEnrolmentUpdate) {
    return this.training.updateEnrolment(user, meta, id, body);
  }

  @Post('enrolments/:id/complete')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  complete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TrainingCompleteSchema)) body: TrainingComplete) {
    return this.training.complete(user, meta, id, body);
  }

  @Post('enrolments/:id/withdraw')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  withdraw(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.training.withdraw(user, meta, id, body.rowVersion);
  }
}

/** /api/hr/training-programs/:id/sessions: schedule a session under a programme. */
@Controller('hr/training-programs')
export class TrainingSessionsController {
  constructor(private readonly training: TrainingService) {}

  @Post(':id/sessions')
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TrainingSessionCreateSchema)) body: TrainingSessionCreate) {
    return this.training.createSession(user, meta, id, body);
  }
}
