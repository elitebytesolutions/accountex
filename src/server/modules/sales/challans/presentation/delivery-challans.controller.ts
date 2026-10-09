import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ChallanDeliverSchema, ChallanInputSchema, ChallanUpdateSchema, RowVersionSchema, SalesQuerySchema, SalesReasonSchema, type ChallanInput, type SalesQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { DeliveryChallansService } from '../application/delivery-challans.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/sales/challans: Sales › Delivery Challans. */
@Controller('sales/challans')
export class DeliveryChallansController {
  constructor(private readonly challans: DeliveryChallansService) {}

  @Get()
  @RequirePermission('sinv:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(SalesQuerySchema)) q: SalesQuery) {
    return this.challans.list(user, q);
  }

  @Get(':id')
  @RequirePermission('sinv:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.challans.get(user, id);
  }

  @Post()
  @RequirePermission('sinv:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ChallanInputSchema)) body: ChallanInput) {
    return this.challans.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('sinv:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ChallanUpdateSchema)) body: ChallanInput & { rowVersion: number }) {
    return this.challans.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('sinv:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.challans.remove(user, meta, id, q.rowVersion);
  }

  /** Stock leaves the warehouse at cost (Dr GDNI / Cr inventory). */
  @Post(':id/dispatch')
  @HttpCode(200)
  @RequirePermission('sinv:post')
  dispatch(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.challans.dispatch(user, meta, id, body.rowVersion);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  @RequirePermission('sinv:edit')
  deliver(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ChallanDeliverSchema)) body: { rowVersion: number; receivedBy: string | null }) {
    return this.challans.deliver(user, meta, id, body.rowVersion, body.receivedBy);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('sinv:post')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.challans.cancel(user, meta, id, body.rowVersion, body.reason);
  }
}
