import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema, SalesOptionalReasonSchema, SalesOrderConfirmSchema, SalesOrderInputSchema, SalesOrderUpdateSchema, SalesQuerySchema, SalesReasonSchema, SalesRejectSchema,
  type SalesOrderInput, type SalesQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SalesOrdersService } from '../application/sales-orders.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/sales/orders: Sales › Sales Orders. */
@Controller('sales/orders')
export class SalesOrdersController {
  constructor(private readonly orders: SalesOrdersService) {}

  @Get()
  @RequirePermission('quo:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(SalesQuerySchema)) q: SalesQuery) {
    return this.orders.list(user, q);
  }

  /** Confirmed orders with lines still to deliver (New challan). */
  @Get('deliverable')
  @RequirePermission('sinv:view')
  deliverable(@CurrentUser() user: SessionUser) {
    return this.orders.deliverable(user);
  }

  @Get(':id')
  @RequirePermission('quo:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.orders.get(user, id);
  }

  @Post()
  @RequirePermission('quo:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(SalesOrderInputSchema)) body: SalesOrderInput) {
    return this.orders.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('quo:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesOrderUpdateSchema)) body: SalesOrderInput & { rowVersion: number }) {
    return this.orders.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('quo:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.orders.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('quo:create')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.orders.submit(user, meta, id, body.rowVersion);
  }

  @Post(':id/recall')
  @HttpCode(200)
  @RequirePermission('quo:create')
  recall(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.orders.recall(user, meta, id, body.rowVersion);
  }

  /** No route permission: eligibility is the approval engine's; with no workflow, quo:approve confirms directly. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesOrderConfirmSchema)) body: { comment: string | null; overrideCredit: boolean }) {
    return this.orders.approve(user, meta, id, body.comment ?? null, body.overrideCredit);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesRejectSchema)) body: { reason: string }) {
    return this.orders.reject(user, meta, id, body.reason);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission('quo:edit')
  close(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesOptionalReasonSchema)) body: { rowVersion: number; reason: string | null }) {
    return this.orders.close(user, meta, id, body.rowVersion, body.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('quo:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.orders.cancel(user, meta, id, body.rowVersion, body.reason);
  }
}
