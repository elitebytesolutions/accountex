import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PoInputSchema, PoUpdateSchema, PurchaseCommentSchema, PurchaseQuerySchema, PurchaseReasonSchema, PurchaseRejectSchema, RowVersionSchema, type PoInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PurchaseOrdersService } from '../application/purchase-orders.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/purchases/orders: Purchases & Payables › Purchase Orders. */
@Controller('purchases/orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  @RequirePermission('po:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(PurchaseQuerySchema)) q: z.infer<typeof PurchaseQuerySchema>) {
    return this.orders.list(user, q);
  }

  @Get(':id')
  @RequirePermission('po:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.orders.get(user, id);
  }

  @Post()
  @RequirePermission('po:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PoInputSchema)) body: PoInput) {
    return this.orders.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('po:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PoUpdateSchema)) body: PoInput & { rowVersion: number }) {
    return this.orders.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('po:create')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.orders.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('po:create')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.orders.submit(user, meta, id, body.rowVersion);
  }

  @Post(':id/recall')
  @HttpCode(200)
  @RequirePermission('po:create')
  recall(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.orders.recall(user, meta, id, body.rowVersion);
  }

  /** No route permission: eligibility is the approval engine's (approvers may hold no purchasing role); with no workflow, po:approve. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseCommentSchema)) body: { comment?: string }) {
    return this.orders.approve(user, meta, id, body.comment ?? null);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseRejectSchema)) body: { reason: string }) {
    return this.orders.reject(user, meta, id, body.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('po:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.orders.cancel(user, meta, id, body.rowVersion, body.reason);
  }
}
