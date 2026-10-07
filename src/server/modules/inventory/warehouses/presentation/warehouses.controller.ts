import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BinCreateSchema,
  BinGenerateSchema,
  BinUpdateSchema,
  RowVersionSchema,
  WarehouseCreateSchema,
  WarehouseUpdateSchema,
  type BinCreate,
  type BinGenerate,
  type BinUpdate,
  type SessionUser,
  type WarehouseCreate,
  type WarehouseUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { WarehousesService } from '../application/warehouses.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/inventory/warehouses and /api/inventory/bins: Inventory › Warehouses. */
@Controller('inventory')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get('warehouses')
  @RequirePermission('wh:view')
  list(@CurrentUser() user: SessionUser) {
    return this.warehouses.list(user);
  }

  @Get('warehouses/form-options')
  @RequirePermission('wh:view')
  formOptions(@CurrentUser() user: SessionUser) {
    return this.warehouses.formOptions(user);
  }

  @Post('warehouses')
  @RequirePermission('wh:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(WarehouseCreateSchema)) body: WarehouseCreate) {
    return this.warehouses.create(user, meta, body);
  }

  @Patch('warehouses/:id')
  @RequirePermission('wh:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(WarehouseUpdateSchema)) body: WarehouseUpdate) {
    return this.warehouses.update(user, meta, id, body);
  }

  @Post('warehouses/:id/bins')
  @RequirePermission('wh:edit')
  addBin(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BinCreateSchema)) body: BinCreate) {
    return this.warehouses.addBin(user, meta, id, body);
  }

  @Post('warehouses/:id/bins/generate')
  @RequirePermission('wh:edit')
  generateBins(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BinGenerateSchema)) body: BinGenerate) {
    return this.warehouses.generateBins(user, meta, id, body);
  }

  @Post('warehouses/:id/:action')
  @HttpCode(200)
  @RequirePermission('wh:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.warehouses.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('warehouses/:id')
  @HttpCode(204)
  @RequirePermission('wh:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.warehouses.delete(user, meta, id, q.rowVersion);
  }

  @Patch('bins/:id')
  @RequirePermission('wh:edit')
  updateBin(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BinUpdateSchema)) body: BinUpdate) {
    return this.warehouses.updateBin(user, meta, id, body);
  }

  @Delete('bins/:id')
  @HttpCode(204)
  @RequirePermission('wh:delete')
  async deleteBin(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.warehouses.deleteBin(user, meta, id, q.rowVersion);
  }
}
