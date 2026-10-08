import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { PayGroupCreateSchema, PayGroupUpdateSchema, RowVersionSchema, TaxYearSchema, type PayGroupCreate, type PayGroupUpdate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PayGroupsService } from '../application/pay-groups.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const year = pipe(z.string().regex(/^\d{4}-\d{2}$/, 'Like 2026-27'));

/** /api/payroll/pay-groups and /api/payroll/tax-slabs: the Pay groups and Tax slabs tabs of Salary Structures. */
@Controller('payroll')
export class PayGroupsController {
  constructor(private readonly groups: PayGroupsService) {}

  @Get('pay-groups')
  @RequirePermission('prun:view')
  list(@CurrentUser() user: SessionUser) {
    return this.groups.list(user);
  }

  @Post('pay-groups')
  @RequirePermission('prun:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PayGroupCreateSchema)) body: PayGroupCreate) {
    return this.groups.create(user, meta, body);
  }

  @Patch('pay-groups/:id')
  @RequirePermission('prun:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PayGroupUpdateSchema)) body: PayGroupUpdate) {
    return this.groups.update(user, meta, id, body);
  }

  @Post('pay-groups/:id/:action')
  @HttpCode(200)
  @RequirePermission('prun:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.groups.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('pay-groups/:id')
  @HttpCode(204)
  @RequirePermission('prun:edit')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.groups.delete(user, meta, id, q.rowVersion);
  }

  @Get('tax-slabs')
  @RequirePermission('prun:view')
  years(@CurrentUser() user: SessionUser) {
    return this.groups.taxYears(user);
  }

  @Put('tax-slabs/:year')
  @RequirePermission('prun:edit')
  saveYear(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('year', year) y: string, @Body(pipe(TaxYearSchema)) body: z.infer<typeof TaxYearSchema>) {
    return this.groups.saveYear(user, meta, y, body.slabs);
  }

  @Post('tax-slabs/:year/copy-to/:next')
  @RequirePermission('prun:edit')
  copy(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('year', year) y: string, @Param('next', year) next: string) {
    return this.groups.copyYear(user, meta, y, next);
  }

  @Delete('tax-slabs/:year')
  @HttpCode(204)
  @RequirePermission('prun:edit')
  async deleteYear(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('year', year) y: string) {
    await this.groups.deleteYear(user, meta, y);
  }
}
