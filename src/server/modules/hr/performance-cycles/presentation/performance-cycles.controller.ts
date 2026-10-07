import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  PerformanceCycleCreateSchema, PerformanceCycleUpdateSchema, RowVersionSchema, TalentListQuerySchema,
  type PerformanceCycleCreate, type PerformanceCycleUpdate, type SessionUser, type TalentListQuery,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PerformanceCyclesService } from '../application/performance-cycles.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/performance-cycles: Workforce › Talent › Performance (appraisal cycles). There are no perf:* permissions: emp:* applies. */
@Controller('hr/performance-cycles')
export class PerformanceCyclesController {
  constructor(private readonly cycles: PerformanceCyclesService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(TalentListQuerySchema)) q: TalentListQuery) {
    return this.cycles.list(user, q);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.cycles.get(user, id);
  }

  @Post()
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PerformanceCycleCreateSchema)) body: PerformanceCycleCreate) {
    return this.cycles.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PerformanceCycleUpdateSchema)) body: PerformanceCycleUpdate) {
    return this.cycles.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['open', 'advance', 'close']))) action: 'open' | 'advance' | 'close', @Body(version) body: { rowVersion: number }) {
    return this.cycles[action](user, meta, id, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.cycles.delete(user, meta, id, q.rowVersion);
  }
}
