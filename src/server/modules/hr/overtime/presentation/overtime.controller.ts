import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { OvertimeCreateSchema, OvertimeUpdateSchema, RowVersionSchema, type OvertimeCreate, type OvertimeUpdate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OvertimeService } from '../application/overtime.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/overtime-policies: Workforce › Time & Attendance › Overtime. Deleting needs att:approve (there is no att:delete). */
@Controller('hr/overtime-policies')
export class OvertimeController {
  constructor(private readonly policies: OvertimeService) {}

  @Get()
  @RequirePermission('att:view')
  list(@CurrentUser() user: SessionUser) {
    return this.policies.list(user);
  }

  @Get('grades')
  @RequirePermission('att:view')
  grades(@CurrentUser() user: SessionUser) {
    return this.policies.grades(user);
  }

  @Post()
  @RequirePermission('att:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(OvertimeCreateSchema)) body: OvertimeCreate) {
    return this.policies.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('att:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OvertimeUpdateSchema)) body: OvertimeUpdate) {
    return this.policies.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('att:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.policies.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('att:approve')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.policies.delete(user, meta, id, q.rowVersion);
  }
}
