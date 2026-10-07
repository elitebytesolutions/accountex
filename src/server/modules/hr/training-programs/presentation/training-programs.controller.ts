import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema, TalentListQuerySchema, TrainingProgramCreateSchema, TrainingProgramUpdateSchema, TrainingStatusSchema,
  type SessionUser, type TalentListQuery, type TrainingProgramCreate, type TrainingProgramUpdate, type TrainingStatusInput,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { TrainingProgramsService } from '../application/training-programs.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/training-programs: Workforce › Talent › Training (program catalogue). There are no trn:* permissions: emp:* applies. */
@Controller('hr/training-programs')
export class TrainingProgramsController {
  constructor(private readonly programs: TrainingProgramsService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(TalentListQuerySchema)) q: TalentListQuery) {
    return this.programs.list(user, q);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.programs.get(user, id);
  }

  @Post()
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(TrainingProgramCreateSchema)) body: TrainingProgramCreate) {
    return this.programs.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TrainingProgramUpdateSchema)) body: TrainingProgramUpdate) {
    return this.programs.update(user, meta, id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  status(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TrainingStatusSchema)) body: TrainingStatusInput) {
    return this.programs.setStatus(user, meta, id, body.status, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.programs.delete(user, meta, id, q.rowVersion);
  }
}
