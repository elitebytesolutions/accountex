import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, UsageOverrideCreateSchema, type AdminSession, type UsageOverrideCreate } from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { UsageService } from '../application/usage.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const TenantFilter = z.object({ tenantId: z.uuid().optional() });

/** /api/admin/usage: Billing › Usage & Quotas, per-company meters and limit overrides (Phase 40). */
@AdminRoute()
@Controller('admin/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  overview(@Query(pipe(TenantFilter)) q: { tenantId?: string }) {
    return this.usage.overview(q.tenantId);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(TenantFilter)) body: { tenantId?: string }) {
    return this.usage.refresh(admin, meta, body.tenantId);
  }

  @Post('overrides')
  addOverride(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(UsageOverrideCreateSchema)) body: UsageOverrideCreate) {
    return this.usage.addOverride(admin, meta, body);
  }

  @Post('overrides/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.usage.revokeOverride(admin, meta, id, body.rowVersion);
  }
}
