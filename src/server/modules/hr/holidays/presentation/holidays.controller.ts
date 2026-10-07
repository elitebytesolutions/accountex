import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  HolidayCreateSchema, HolidayListQuerySchema, HolidayStatusSchema, HolidayUpdateSchema, RowVersionSchema,
  type HolidayCreate, type HolidayListQuery, type HolidayUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { HolidaysService } from '../application/holidays.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/holidays: Workforce › Time & Attendance › Holidays. Deleting needs att:approve (there is no att:delete). */
@Controller('hr/holidays')
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get()
  @RequirePermission('att:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(HolidayListQuerySchema)) q: HolidayListQuery) {
    return this.holidays.list(user, q);
  }

  @Post()
  @RequirePermission('att:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(HolidayCreateSchema)) body: HolidayCreate) {
    return this.holidays.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('att:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(HolidayUpdateSchema)) body: HolidayUpdate) {
    return this.holidays.update(user, meta, id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('att:edit')
  status(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(HolidayStatusSchema)) body: { status: string; rowVersion: number }) {
    return this.holidays.setStatus(user, meta, id, body.status, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('att:approve')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.holidays.delete(user, meta, id, q.rowVersion);
  }
}
