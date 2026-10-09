import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  QuotationConvertSchema, QuotationInputSchema, QuotationUpdateSchema, RowVersionSchema, SalesQuerySchema, SalesReasonSchema,
  type QuotationConvertInput, type QuotationInput, type SalesQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { QuotationsService } from '../application/quotations.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/sales/quotations: Sales › Quotations. */
@Controller('sales/quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  @RequirePermission('quo:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(SalesQuerySchema)) q: SalesQuery) {
    return this.quotations.list(user, q);
  }

  @Get(':id')
  @RequirePermission('quo:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.quotations.get(user, id);
  }

  @Post()
  @RequirePermission('quo:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(QuotationInputSchema)) body: QuotationInput) {
    return this.quotations.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('quo:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(QuotationUpdateSchema)) body: QuotationInput & { rowVersion: number }) {
    return this.quotations.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('quo:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.quotations.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/send')
  @HttpCode(200)
  @RequirePermission('quo:edit')
  send(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.quotations.send(user, meta, id, body.rowVersion);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @RequirePermission('quo:edit')
  accept(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.quotations.accept(user, meta, id, body.rowVersion);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('quo:edit')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.quotations.reject(user, meta, id, body.rowVersion, body.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('quo:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.quotations.cancel(user, meta, id, body.rowVersion, body.reason);
  }

  @Post(':id/revise')
  @HttpCode(200)
  @RequirePermission('quo:create')
  revise(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.quotations.revise(user, meta, id);
  }

  @Post(':id/convert-to-order')
  @HttpCode(200)
  @RequirePermission('quo:create')
  convert(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(QuotationConvertSchema)) body: QuotationConvertInput & { rowVersion: number }) {
    return this.quotations.convert(user, meta, id, body);
  }
}
