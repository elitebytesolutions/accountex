import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PurchaseQuerySchema, PurchaseReasonSchema, PurchaseReturnInputSchema, PurchaseReturnUpdateSchema, RowVersionSchema, type PurchaseReturnInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PurchaseReturnsService } from '../application/purchase-returns.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);
const Returnable = z.object({ bill: z.uuid(), except: z.uuid().optional() });
const BillsQuery = z.object({ vendor: z.uuid() });

/** /api/purchases/returns: Purchases › Purchase Returns. */
@Controller('purchases/returns')
export class PurchaseReturnsController {
  constructor(private readonly returns: PurchaseReturnsService) {}

  @Get()
  @RequirePermission('grn:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(PurchaseQuerySchema)) q: z.infer<typeof PurchaseQuerySchema>) {
    return this.returns.list(user, q);
  }

  /** A vendor's posted bills a return can reference (grn:view: storekeepers have no bill:view). */
  @Get('bills')
  @RequirePermission('grn:view')
  bills(@CurrentUser() user: SessionUser, @Query(pipe(BillsQuery)) q: z.infer<typeof BillsQuery>) {
    return this.returns.returnBills(user, q.vendor);
  }

  /** The bill's stock lines with the quantity that can still be returned. */
  @Get('returnable')
  @RequirePermission('grn:view')
  returnable(@CurrentUser() user: SessionUser, @Query(pipe(Returnable)) q: z.infer<typeof Returnable>) {
    return this.returns.returnable(user, q.bill, q.except ?? null);
  }

  @Get(':id')
  @RequirePermission('grn:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.returns.get(user, id);
  }

  @Post()
  @RequirePermission('grn:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PurchaseReturnInputSchema)) body: PurchaseReturnInput) {
    return this.returns.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('grn:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseReturnUpdateSchema)) body: PurchaseReturnInput & { rowVersion: number }) {
    return this.returns.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('grn:create')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.returns.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('grn:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.returns.post(user, meta, id, body.rowVersion);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('grn:post')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.returns.cancel(user, meta, id, body.rowVersion, body.reason);
  }
}
