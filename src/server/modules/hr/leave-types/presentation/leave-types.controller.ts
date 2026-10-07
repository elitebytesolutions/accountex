import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { LeaveTypeCreateSchema, LeaveTypeUpdateSchema, RowVersionSchema, type LeaveTypeCreate, type LeaveTypeUpdate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { LeaveTypesService } from '../application/leave-types.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/leave-types: Workforce › Leave › Leave Policies. */
@Controller('hr/leave-types')
export class LeaveTypesController {
  constructor(private readonly types: LeaveTypesService) {}

  @Get()
  @RequirePermission('lv:view')
  list(@CurrentUser() user: SessionUser) {
    return this.types.list(user);
  }

  @Get('options')
  @RequirePermission('lv:view')
  options(@CurrentUser() user: SessionUser) {
    return this.types.options(user);
  }

  @Post()
  @RequirePermission('lv:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(LeaveTypeCreateSchema)) body: LeaveTypeCreate) {
    return this.types.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('lv:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeaveTypeUpdateSchema)) body: LeaveTypeUpdate) {
    return this.types.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('lv:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.types.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('lv:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.types.delete(user, meta, id, q.rowVersion);
  }
}
