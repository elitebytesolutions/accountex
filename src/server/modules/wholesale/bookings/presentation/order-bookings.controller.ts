import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BookingIdsSchema, BookingInputSchema, BookingUpdateSchema, RowVersionSchema, WholesaleQuerySchema, WholesaleReasonSchema,
  type BookingInput, type SessionUser, type WholesaleQuery,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OrderBookingsService } from '../application/order-bookings.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/distribution/bookings: Wholesale › Order Bookings (order bookers see their own routes only). */
@Controller('distribution/bookings')
export class OrderBookingsController {
  constructor(private readonly bookings: OrderBookingsService) {}

  @Get()
  @RequirePermission('booking:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(WholesaleQuerySchema)) q: WholesaleQuery) {
    return this.bookings.list(user, q);
  }

  @Get(':id')
  @RequirePermission('booking:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.bookings.get(user, id);
  }

  @Post()
  @RequirePermission('booking:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BookingInputSchema)) body: BookingInput) {
    return this.bookings.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('booking:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(BookingUpdateSchema)) body: BookingInput & { rowVersion: number }) {
    return this.bookings.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('booking:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.bookings.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('booking:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(WholesaleReasonSchema)) body: { rowVersion: number; reason: string | null }) {
    return this.bookings.cancel(user, meta, id, body.rowVersion, body.reason);
  }

  @Post('check-stock')
  @HttpCode(200)
  @RequirePermission('booking:approve')
  checkStock(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BookingIdsSchema)) body: { ids: string[] }) {
    return this.bookings.checkStock(user, meta, body.ids);
  }

  /** Approve = convert into posted wholesale invoices (shortages to back-orders, or held). */
  @Post('convert')
  @HttpCode(200)
  @RequirePermission('booking:approve')
  convert(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BookingIdsSchema)) body: { ids: string[]; allowPartial: boolean }) {
    return this.bookings.convert(user, meta, body.ids, body.allowPartial);
  }
}
