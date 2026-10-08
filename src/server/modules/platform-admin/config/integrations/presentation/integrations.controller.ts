import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ApiKeyActionSchema, ApiKeyCreateSchema, RowVersionSchema, WebhookCreateSchema, WebhookUpdateSchema,
  type AdminSession, type ApiKeyAction, type ApiKeyCreate, type WebhookCreate, type WebhookUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ApiKeysService } from '../application/api-keys.service.js';
import { WebhooksService } from '../application/webhooks.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const TenantQuerySchema = z.object({ tenantId: z.uuid('Choose a tenant') });

/** /api/admin/api-keys: per-tenant API keys (System › API & Webhooks). The secret is returned once. */
@AdminRoute()
@Controller('admin/api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  /** Tenant picker of the page. */
  @Get('tenants')
  tenants() {
    return this.keys.tenants();
  }

  @Get()
  list(@Query(pipe(TenantQuerySchema)) q: { tenantId: string }) {
    return this.keys.list(q.tenantId);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(ApiKeyCreateSchema)) body: ApiKeyCreate) {
    return this.keys.create(admin, meta, body);
  }

  @Post(':id/rotate')
  @HttpCode(200)
  rotate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ApiKeyActionSchema)) body: ApiKeyAction) {
    return this.keys.rotate(admin, meta, id, body.rowVersion);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ApiKeyActionSchema)) body: ApiKeyAction) {
    return this.keys.revoke(admin, meta, id, body.rowVersion);
  }
}

/** /api/admin/webhooks: per-tenant webhook endpoints, test events and the delivery log with replay. */
@AdminRoute()
@Controller('admin/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(@Query(pipe(TenantQuerySchema)) q: { tenantId: string }) {
    return this.webhooks.list(q.tenantId);
  }

  /** Every delivery of a tenant's endpoints (newest first, last 100). */
  @Get('deliveries')
  tenantDeliveries(@Query(pipe(TenantQuerySchema)) q: { tenantId: string }) {
    return this.webhooks.deliveries({ tenantId: q.tenantId });
  }

  @Post('deliveries/:id/replay')
  @HttpCode(200)
  replay(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.webhooks.replay(admin, meta, id);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.webhooks.get(id);
  }

  @Get(':id/deliveries')
  deliveries(@Param('id', uuid) id: string) {
    return this.webhooks.deliveries({ endpointId: id });
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(WebhookCreateSchema)) body: WebhookCreate) {
    return this.webhooks.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(WebhookUpdateSchema)) body: WebhookUpdate) {
    return this.webhooks.update(admin, meta, id, body);
  }

  /** A signed HTTPS POST of a `ping` event (10 s timeout), recorded as a delivery. */
  @Post(':id/test')
  @HttpCode(200)
  test(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.webhooks.test(admin, meta, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.webhooks.delete(admin, meta, id, q.rowVersion);
  }
}
