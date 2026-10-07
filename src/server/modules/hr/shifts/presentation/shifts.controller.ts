import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, ShiftCreateSchema, ShiftUpdateSchema, type SessionUser, type ShiftCreate, type ShiftUpdate } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ShiftsService } from '../application/shifts.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/shifts: Workforce › Time & Attendance › Shifts & Rosters. Deleting needs att:approve (there is no att:delete). */
@Controller('hr/shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  @RequirePermission('att:view')
  list(@CurrentUser() user: SessionUser) {
    return this.shifts.list(user);
  }

  @Post()
  @RequirePermission('att:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ShiftCreateSchema)) body: ShiftCreate) {
    return this.shifts.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('att:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ShiftUpdateSchema)) body: ShiftUpdate) {
    return this.shifts.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('att:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate', 'default']))) action: 'activate' | 'deactivate' | 'default', @Body(version) body: { rowVersion: number }) {
    return action === 'default' ? this.shifts.makeDefault(user, meta, id, body.rowVersion) : this.shifts.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('att:approve')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.shifts.delete(user, meta, id, q.rowVersion);
  }
}
