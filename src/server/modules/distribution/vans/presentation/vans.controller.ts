import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  VanCreateSchema, VanStatusChangeSchema, VanUpdateSchema, type VanCreate, type VanStatusChange, type VanUpdate,
} from '../../../../../shared/distribution/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { VansService } from '../application/vans.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/distribution/vans: the Vans panel on Wholesale › Routes & Salesmen (van:* permissions). */
@Controller('distribution/vans')
export class VansController {
  constructor(private readonly vans: VansService) {}

  @Get()
  @RequirePermission('van:view')
  list(@CurrentUser() user: SessionUser) {
    return this.vans.list(user);
  }

  /** VAN-type warehouses a van can be linked to. */
  @Get('warehouses')
  @RequirePermission('van:view')
  warehouses(@CurrentUser() user: SessionUser) {
    return this.vans.warehouses(user);
  }

  @Post()
  @RequirePermission('van:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(VanCreateSchema)) body: VanCreate) {
    return this.vans.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('van:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(VanUpdateSchema)) body: VanUpdate) {
    return this.vans.update(user, meta, id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('van:edit')
  setStatus(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(VanStatusChangeSchema)) body: VanStatusChange) {
    return this.vans.setStatus(user, meta, id, body);
  }

  /** "Create van stock location": a VAN-type warehouse for this van, linked to it (409 VAN_HAS_STOCK_LOCATION if it has one). */
  @Post(':id/stock-location')
  @HttpCode(200)
  @RequirePermission('van:edit')
  createStockLocation(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.vans.createStockLocation(user, meta, id, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('van:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.vans.delete(user, meta, id, q.rowVersion);
  }
}
