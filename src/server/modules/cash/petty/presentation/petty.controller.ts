import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PettyVoucherQuerySchema, PettyVoucherSchema, ReplenishSchema, RowVersionSchema, type PettyVoucherInput, type ReplenishInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PettyService } from '../application/petty.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const WithReason = RowVersionSchema.extend({ reason: z.string().trim().max(300).optional() });

/** /api/cash/petty: petty cash expense vouchers and fund top-ups (the funds themselves are /api/cash/petty-funds). */
@Controller('cash/petty')
export class PettyController {
  constructor(private readonly petty: PettyService) {}

  @Get('vouchers')
  @RequirePermission('cash:view')
  vouchers(@CurrentUser() user: SessionUser, @Query(pipe(PettyVoucherQuerySchema)) q: z.infer<typeof PettyVoucherQuerySchema>) {
    return this.petty.vouchers(user, q);
  }

  @Get('vouchers/:id')
  @RequirePermission('cash:view')
  voucher(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.petty.voucher(user, id);
  }

  @Post('vouchers')
  @RequirePermission('cash:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PettyVoucherSchema)) body: PettyVoucherInput) {
    return this.petty.create(user, meta, body);
  }

  @Patch('vouchers/:id')
  @RequirePermission('cash:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PettyVoucherSchema.and(RowVersionSchema))) body: PettyVoucherInput & { rowVersion: number }) {
    return this.petty.update(user, meta, id, body);
  }

  @Post('vouchers/:id/void')
  @HttpCode(200)
  @RequirePermission('cash:edit')
  void(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(WithReason)) body: z.infer<typeof WithReason>) {
    return this.petty.void(user, meta, id, body.rowVersion, body.reason ?? null);
  }

  @Get('replenishments')
  @RequirePermission('cash:view')
  replenishments(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ fund: z.uuid().optional() }))) q: { fund?: string }) {
    return this.petty.replenishments(user, q.fund ?? null);
  }

  @Post('funds/:id/replenish')
  @RequirePermission('cash:post')
  replenish(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReplenishSchema)) body: ReplenishInput) {
    return this.petty.replenish(user, meta, id, body);
  }

  @Post('replenishments/:id/cancel')
  @HttpCode(200)
  @RequirePermission('cash:post')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(WithReason)) body: z.infer<typeof WithReason>) {
    return this.petty.cancelReplenishment(user, meta, id, body.rowVersion, body.reason ?? null);
  }
}
