import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CouponCreateSchema, CouponStatusInputSchema, CouponUpdateSchema, RowVersionSchema,
  type AdminSession, type CouponCreate, type CouponStatusInput, type CouponUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { CouponsService } from '../application/coupons.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/coupons: subscription coupons (Partners & Coupons › Coupons). Redemptions are read-only. */
@AdminRoute()
@Controller('admin/coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list() {
    return this.coupons.list();
  }

  /** Resellers a coupon can belong to (Phase 38 manages them). */
  @Get('partners')
  partners() {
    return this.coupons.partners();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.coupons.get(id);
  }

  @Get(':id/redemptions')
  redemptions(@Param('id', uuid) id: string) {
    return this.coupons.redemptions(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(CouponCreateSchema)) body: CouponCreate) {
    return this.coupons.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CouponUpdateSchema)) body: CouponUpdate) {
    return this.coupons.update(admin, meta, id, body);
  }

  @Post(':id/pause')
  @HttpCode(200)
  pause(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CouponStatusInputSchema)) body: CouponStatusInput) {
    return this.coupons.pause(admin, meta, id, body.rowVersion);
  }

  @Post(':id/resume')
  @HttpCode(200)
  resume(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CouponStatusInputSchema)) body: CouponStatusInput) {
    return this.coupons.resume(admin, meta, id, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.coupons.delete(admin, meta, id, q.rowVersion);
  }
}
