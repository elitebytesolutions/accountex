import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  PlanCreateSchema, PlanFeaturesInputSchema, PlanLimitsInputSchema, PlanStatusInputSchema, PlanUpdateSchema, RowVersionSchema,
  type AdminSession, type PlanCreate, type PlanFeaturesInput, type PlanLimitsInput, type PlanStatusInput, type PlanUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { PlansService } from '../application/plans.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/plans: Super Admin › Billing › Plans & Pricing. */
@AdminRoute()
@Controller('admin/plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  /** Usage meters a limit can be set on (seeded by Phase 40; empty until then). */
  @Get('usage-meters')
  usageMeters() {
    return this.plans.usageMeters();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.plans.get(id);
  }

  @Get(':id/versions')
  versions(@Param('id', uuid) id: string) {
    return this.plans.versions(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(PlanCreateSchema)) body: PlanCreate) {
    return this.plans.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PlanUpdateSchema)) body: PlanUpdate) {
    return this.plans.update(admin, meta, id, body);
  }

  @Put(':id/features')
  features(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PlanFeaturesInputSchema)) body: PlanFeaturesInput) {
    return this.plans.setFeatures(admin, meta, id, body);
  }

  @Put(':id/limits')
  limits(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PlanLimitsInputSchema)) body: PlanLimitsInput) {
    return this.plans.setLimits(admin, meta, id, body);
  }

  @Post(':id/retire')
  @HttpCode(200)
  retire(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PlanStatusInputSchema)) body: PlanStatusInput) {
    return this.plans.retire(admin, meta, id, body.rowVersion);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PlanStatusInputSchema)) body: PlanStatusInput) {
    return this.plans.reactivate(admin, meta, id, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.plans.delete(admin, meta, id, q.rowVersion);
  }
}
