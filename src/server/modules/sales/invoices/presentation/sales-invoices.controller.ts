import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema, SalesCommentSchema, SalesInvoiceInputSchema, SalesInvoiceUpdateSchema, SalesQuerySchema, SalesReasonSchema, SalesRejectSchema, SalesVoucherSchema,
  type SalesInvoiceInput, type SalesQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SalesInvoicesService } from '../application/sales-invoices.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/sales/invoices: Sales › Invoices. */
@Controller('sales/invoices')
export class SalesInvoicesController {
  constructor(private readonly invoices: SalesInvoicesService) {}

  @Get()
  @RequirePermission('sinv:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(SalesQuerySchema)) q: SalesQuery) {
    return this.invoices.list(user, q);
  }

  /** sinv:view, or the approver who can act on the invoice's current approval step. */
  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.invoices.view(user, id);
  }

  @Post()
  @RequirePermission('sinv:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(SalesInvoiceInputSchema)) body: SalesInvoiceInput) {
    return this.invoices.create(user, meta, body);
  }

  @Post('from-challan/:challanId')
  @RequirePermission('sinv:create')
  fromChallan(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('challanId', uuid) challanId: string) {
    return this.invoices.fromChallan(user, meta, challanId);
  }

  @Patch(':id')
  @RequirePermission('sinv:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesInvoiceUpdateSchema)) body: SalesInvoiceInput & { rowVersion: number }) {
    return this.invoices.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('sinv:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.invoices.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('sinv:create')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.invoices.submit(user, meta, id, body.rowVersion);
  }

  @Post(':id/recall')
  @HttpCode(200)
  @RequirePermission('sinv:create')
  recall(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.invoices.recall(user, meta, id, body.rowVersion);
  }

  /** No route permission: eligibility is the approval engine's. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesCommentSchema)) body: { comment: string | null }) {
    return this.invoices.approve(user, meta, id, body.comment ?? null);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesRejectSchema)) body: { reason: string }) {
    return this.invoices.reject(user, meta, id, body.reason);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('sinv:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.invoices.post(user, meta, id, body.rowVersion);
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermission('sinv:post')
  void(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.invoices.void(user, meta, id, body.rowVersion, body.reason);
  }
}

/** /api/sales/vouchers: Sales › Sales Voucher (counter sale), saved as a COUNTER invoice. */
@Controller('sales/vouchers')
export class SalesVouchersController {
  constructor(private readonly invoices: SalesInvoicesService) {}

  @Post()
  @RequirePermission('sinv:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(SalesVoucherSchema)) body: SalesInvoiceInput & { post: boolean }) {
    return this.invoices.voucher(user, meta, body);
  }
}
