import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import { ShopAreaCreateSchema, ShopAreaUpdateSchema, type ShopAreaCreate, type ShopAreaUpdate } from '../../../../../shared/distribution/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ShopAreasService } from '../application/shop-areas.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/distribution/shop-areas: "Manage areas" on Wholesale › Routes & Salesmen (route:* permissions). */
@Controller('distribution/shop-areas')
export class ShopAreasController {
  constructor(private readonly areas: ShopAreasService) {}

  @Get()
  @RequirePermission('route:view')
  list(@CurrentUser() user: SessionUser) {
    return this.areas.list(user);
  }

  @Post()
  @RequirePermission('route:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ShopAreaCreateSchema)) body: ShopAreaCreate) {
    return this.areas.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('route:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ShopAreaUpdateSchema)) body: ShopAreaUpdate) {
    return this.areas.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('route:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.areas.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('route:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.areas.delete(user, meta, id, q.rowVersion);
  }
}
