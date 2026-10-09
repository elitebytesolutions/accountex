import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { GrnInputSchema, GrnUpdateSchema, PurchaseQuerySchema, PurchaseReasonSchema, RowVersionSchema, type GrnInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { GrnsService } from '../application/grns.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/purchases/grns: Purchases & Payables › Goods Receipts. */
@Controller('purchases/grns')
export class GrnsController {
  constructor(private readonly grns: GrnsService) {}

  @Get()
  @RequirePermission('grn:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(PurchaseQuerySchema)) q: z.infer<typeof PurchaseQuerySchema>) {
    return this.grns.list(user, q);
  }

  @Get(':id')
  @RequirePermission('grn:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.grns.get(user, id);
  }

  @Post()
  @RequirePermission('grn:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(GrnInputSchema)) body: GrnInput) {
    return this.grns.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('grn:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(GrnUpdateSchema)) body: GrnInput & { rowVersion: number }) {
    return this.grns.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('grn:create')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.grns.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('grn:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.grns.post(user, meta, id, body.rowVersion);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('grn:post')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.grns.cancel(user, meta, id, body.rowVersion, body.reason);
  }
}
