import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  PayoutCalculateQuerySchema, PayoutCancelSchema, PayoutListQuerySchema, PayoutPaySchema, ResellerAttributionSchema,
  type AdminSession, type PayoutPay, type ResellerAttributionInput,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { PayoutsService } from '../application/payouts.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/payouts: reseller commission payouts (Phase 41). */
@AdminRoute()
@Controller('admin/payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  list(@Query(pipe(PayoutListQuerySchema)) q: { partnerId?: string; month?: string }) {
    return this.payouts.list(q);
  }

  @Post('calculate')
  @HttpCode(200)
  calculate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Query(pipe(PayoutCalculateQuerySchema)) q: { month?: string }) {
    return this.payouts.calculate(admin, meta, q.month);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.payouts.get(id);
  }

  @Post(':id/pay')
  @HttpCode(200)
  pay(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PayoutPaySchema)) body: PayoutPay) {
    return this.payouts.pay(admin, meta, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PayoutCancelSchema)) body: { rowVersion: number }) {
    return this.payouts.cancel(admin, meta, id, body.rowVersion);
  }
}

/** /api/admin/resellers/:id/tenants: reseller–tenant attribution (the Resellers tab's "Attribute tenant"). */
@AdminRoute()
@Controller('admin/resellers')
export class ResellerAttributionController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get(':id/tenants')
  list(@Param('id', uuid) id: string) {
    return this.payouts.attributions(id);
  }

  @Post(':id/tenants')
  @HttpCode(200)
  attribute(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ResellerAttributionSchema)) body: ResellerAttributionInput) {
    return this.payouts.attribute(admin, meta, id, body);
  }
}
