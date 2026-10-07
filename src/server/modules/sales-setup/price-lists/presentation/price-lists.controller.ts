import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ListQuerySchema, PriceListBulkSchema, PriceListCopySchema, PriceListCreateSchema, PriceListRowsQuerySchema, PriceListUpdateSchema, PriceResolveQuerySchema,
  QuantityBreaksQuerySchema, QuantityBreaksSaveSchema, RowVersionSchema,
  type ListQuery, type PriceListBulk, type PriceListCopy, type PriceListCreate, type PriceListRowsQuery, type PriceListUpdate, type PriceResolveQuery,
  type QuantityBreaksQuery, type QuantityBreaksSave, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PriceListsService } from '../application/price-lists.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/**
 * /api/sales/price-lists (+ items, bulk, copy, resolve) and /api/sales/quantity-breaks: Sales › Price Lists & Schemes.
 * Viewing needs quo:view; changing prices needs quo:approve (decided for Phase 9), deleting quo:delete.
 */
@Controller('sales')
export class PriceListsController {
  constructor(private readonly lists: PriceListsService) {}

  @Get('price-lists')
  @RequirePermission('quo:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(ListQuerySchema)) q: ListQuery) {
    return this.lists.list(user, q);
  }

  @Get('price-lists/resolve')
  @RequirePermission('quo:view')
  resolve(@CurrentUser() user: SessionUser, @Query(pipe(PriceResolveQuerySchema)) q: PriceResolveQuery) {
    return this.lists.resolve(user, q);
  }

  @Get('price-lists/:id')
  @RequirePermission('quo:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.lists.get(user, id);
  }

  @Get('price-lists/:id/items')
  @RequirePermission('quo:view')
  items(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Query(pipe(PriceListRowsQuerySchema)) q: PriceListRowsQuery) {
    return this.lists.rows(user, id, q);
  }

  @Post('price-lists')
  @RequirePermission('quo:approve')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PriceListCreateSchema)) body: PriceListCreate) {
    return this.lists.create(user, meta, body);
  }

  @Patch('price-lists/:id')
  @RequirePermission('quo:approve')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PriceListUpdateSchema)) body: PriceListUpdate) {
    return this.lists.update(user, meta, id, body);
  }

  @Post('price-lists/:id/items/bulk')
  @HttpCode(200)
  @RequirePermission('quo:approve')
  bulk(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PriceListBulkSchema)) body: PriceListBulk) {
    return this.lists.bulk(user, meta, id, body);
  }

  @Post('price-lists/:id/copy')
  @RequirePermission('quo:approve')
  copy(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PriceListCopySchema)) body: PriceListCopy) {
    return this.lists.copy(user, meta, id, body);
  }

  @Post('price-lists/:id/:action')
  @HttpCode(200)
  @RequirePermission('quo:approve')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.lists.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('price-lists/:id')
  @HttpCode(204)
  @RequirePermission('quo:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.lists.delete(user, meta, id, q.rowVersion);
  }

  @Get('quantity-breaks')
  @RequirePermission('quo:view')
  breaks(@CurrentUser() user: SessionUser, @Query(pipe(QuantityBreaksQuerySchema)) q: QuantityBreaksQuery) {
    return this.lists.breaks(user, q);
  }

  @Get('quantity-breaks/items')
  @RequirePermission('quo:view')
  breakItems(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ priceList: z.uuid().optional().or(z.literal('')) }))) q: { priceList?: string }) {
    return this.lists.breakItems(user, q.priceList);
  }

  @Put('quantity-breaks')
  @RequirePermission('quo:approve')
  saveBreaks(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(QuantityBreaksSaveSchema)) body: QuantityBreaksSave) {
    return this.lists.saveBreaks(user, meta, body);
  }
}
