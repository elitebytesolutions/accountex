import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { DayCountSchema, RowVersionSchema, type DayCountInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { DayClosesService } from '../application/day-closes.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const DayQ = z.object({ account: z.uuid('Choose the cash account'), date: z.iso.date() });

/** /api/cash/day-closes: the daily cash count and day close (Cash Book rail, Cash Ledger). */
@Controller('cash/day-closes')
export class DayClosesController {
  constructor(private readonly closes: DayClosesService) {}

  @Get()
  @RequirePermission('cash:view')
  day(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(DayQ)) q: z.infer<typeof DayQ>) {
    return this.closes.day(user, q.account, q.date);
  }

  @Put()
  @RequirePermission('cash:create')
  count(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(DayCountSchema)) body: DayCountInput) {
    return this.closes.count(user, meta, body);
  }

  @Post(':id/lock')
  @HttpCode(200)
  @RequirePermission('cash:post')
  lock(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.closes.lock(user, meta, id, body.rowVersion);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @RequirePermission('cash:approve')
  reopen(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.closes.reopen(user, meta, id, body.rowVersion);
  }
}
