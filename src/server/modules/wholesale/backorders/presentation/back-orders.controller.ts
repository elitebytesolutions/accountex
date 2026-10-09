import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { BackOrderAllocateSchema, BackOrderCancelSchema, BackOrderIdsSchema, WholesaleQuerySchema, type SessionUser, type WholesaleQuery } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { BackOrdersService } from '../application/back-orders.service.js';

const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/distribution/back-orders: Wholesale › Back-orders. */
@Controller('distribution/back-orders')
export class BackOrdersController {
  constructor(private readonly backOrders: BackOrdersService) {}

  @Get()
  @RequirePermission('backord:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(WholesaleQuerySchema)) q: WholesaleQuery) {
    return this.backOrders.list(user, q);
  }

  /** Posted goods receipts with free stock for items that have open back-orders. */
  @Get('incoming')
  @RequirePermission('backord:view')
  incoming(@CurrentUser() user: SessionUser) {
    return this.backOrders.incoming(user);
  }

  @Post('allocate')
  @HttpCode(200)
  @RequirePermission('backord:edit')
  allocate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BackOrderAllocateSchema)) body: { grnLineId: string; policy: string; ids?: string[] | null }) {
    return this.backOrders.allocate(user, meta, body.grnLineId, body.policy, body.ids ?? null);
  }

  /** Invoices the allocated quantities, one wholesale invoice per shop. */
  @Post('convert')
  @HttpCode(200)
  @RequirePermission('backord:approve')
  convert(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BackOrderIdsSchema)) body: { ids: string[] }) {
    return this.backOrders.convert(user, meta, body.ids);
  }

  @Post('cancel')
  @HttpCode(200)
  @RequirePermission('backord:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BackOrderCancelSchema)) body: { ids: string[]; reason: string; note: string | null }) {
    return this.backOrders.cancel(user, meta, body.ids, body.reason, body.note);
  }
}
