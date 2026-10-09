import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RecurringSchema, RowVersionSchema, type RecurringInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RecurringService } from '../application/recurring.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const UpdateSchema = RecurringSchema.extend(RowVersionSchema.shape);
const RunSchema = z.object({ date: z.iso.date().optional() });

/** /api/accounting/recurring-vouchers: Finance › Accounts › Recurring. */
@Controller('accounting/recurring-vouchers')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  @RequirePermission('vch:view')
  list(@CurrentUser() user: SessionUser) {
    return this.recurring.list(user);
  }

  @Post('run-due')
  @HttpCode(200)
  @RequirePermission('vch:post')
  runDue(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.recurring.runDue(user, meta);
  }

  @Get(':id')
  @RequirePermission('vch:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.recurring.get(user, id);
  }

  @Get(':id/runs')
  @RequirePermission('vch:view')
  runs(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.recurring.runs(user, id);
  }

  @Post()
  @RequirePermission('vch:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(RecurringSchema)) body: RecurringInput) {
    return this.recurring.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('vch:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(UpdateSchema)) body: RecurringInput & { rowVersion: number }) {
    return this.recurring.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('vch:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.recurring.delete(user, meta, id, q.rowVersion);
  }

  @Post(':id/pause')
  @HttpCode(200)
  @RequirePermission('vch:edit')
  pause(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.recurring.pause(user, meta, id, body.rowVersion);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @RequirePermission('vch:edit')
  resume(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.recurring.resume(user, meta, id, body.rowVersion);
  }

  @Post(':id/run-now')
  @HttpCode(200)
  @RequirePermission('vch:post')
  runNow(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(RunSchema)) body: z.infer<typeof RunSchema>) {
    return this.recurring.runNow(user, meta, id, body.date);
  }
}
