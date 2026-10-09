import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { LcAllocateSchema, LcInputSchema, LcUpdateSchema, PurchaseQuerySchema, PurchaseReasonSchema, RowVersionSchema, type LcInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { LandedCostService } from '../application/landed-cost.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/purchases/landed-cost: Purchases & Payables › Landed Cost (import shipments). */
@Controller('purchases/landed-cost')
export class LandedCostController {
  constructor(private readonly lc: LandedCostService) {}

  @Get()
  @RequirePermission('bill:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(PurchaseQuerySchema)) q: z.infer<typeof PurchaseQuerySchema>) {
    return this.lc.list(user, q);
  }

  @Get('import-grns')
  @RequirePermission('bill:view')
  importGrns(@CurrentUser() user: SessionUser) {
    return this.lc.importGrns(user);
  }

  @Get(':id')
  @RequirePermission('bill:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.lc.get(user, id);
  }

  @Post()
  @RequirePermission('bill:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(LcInputSchema)) body: LcInput) {
    return this.lc.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('bill:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LcUpdateSchema)) body: LcInput & { rowVersion: number }) {
    return this.lc.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('bill:create')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.lc.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/allocate')
  @HttpCode(200)
  @RequirePermission('bill:edit')
  allocate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LcAllocateSchema)) body: z.infer<typeof LcAllocateSchema>) {
    return this.lc.allocate(user, meta, id, body.rowVersion, body.basis);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('bill:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.lc.post(user, meta, id, body.rowVersion);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('bill:post')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.lc.cancel(user, meta, id, body.rowVersion, body.reason);
  }
}
