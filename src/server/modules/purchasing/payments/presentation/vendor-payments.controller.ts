import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ApAgeingQuerySchema, PaymentAllocateSchema, PaymentRunSchema, PurchaseCommentSchema, PurchaseQuerySchema, PurchaseReasonSchema, PurchaseRejectSchema, RowVersionSchema,
  VendorPaymentInputSchema, VendorPaymentUpdateSchema, VendorStatementQuerySchema, type PaymentRunInput, type SessionUser, type VendorPaymentInput,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PayablesReportsService } from '../../reports/application/payables-reports.service.js';
import { VendorPaymentsService } from '../application/vendor-payments.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);
const OpenItemsQuery = z.object({ vendor: z.uuid().optional() });

/** /api/payables/...: Payables › Payments & Allocation, payment run, open items, AP Ageing and Vendor Statement. */
@Controller('payables')
export class VendorPaymentsController {
  constructor(
    private readonly payments: VendorPaymentsService,
    private readonly reports: PayablesReportsService,
  ) {}

  @Get('open-items')
  @RequirePermission('vpay:view')
  openItems(@CurrentUser() user: SessionUser, @Query(pipe(OpenItemsQuery)) q: z.infer<typeof OpenItemsQuery>) {
    return this.payments.openItems(user, q.vendor ?? null);
  }

  @Get('ageing')
  @RequirePermission('vpay:view')
  ageing(@CurrentUser() user: SessionUser, @Query(pipe(ApAgeingQuerySchema)) q: z.infer<typeof ApAgeingQuerySchema>) {
    return this.reports.ageing(user, q);
  }

  @Get('statement')
  @RequirePermission('vpay:view')
  statement(@CurrentUser() user: SessionUser, @Query(pipe(VendorStatementQuerySchema)) q: z.infer<typeof VendorStatementQuerySchema>) {
    return this.reports.statement(user, q);
  }

  @Post('payment-run')
  @HttpCode(200)
  @RequirePermission('vpay:create')
  paymentRun(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PaymentRunSchema)) body: PaymentRunInput) {
    return this.payments.paymentRun(user, meta, body);
  }

  @Post('allocations/:id/reverse')
  @HttpCode(200)
  @RequirePermission('vpay:edit')
  reverseAllocation(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.payments.reverseAllocation(user, meta, id);
  }

  @Get('payments')
  @RequirePermission('vpay:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(PurchaseQuerySchema)) q: z.infer<typeof PurchaseQuerySchema>) {
    return this.payments.list(user, q);
  }

  /** vpay:view, or the approver of the payment's current step (the approval inbox links here). */
  @Get('payments/:id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.payments.view(user, id);
  }

  @Post('payments')
  @RequirePermission('vpay:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(VendorPaymentInputSchema)) body: VendorPaymentInput) {
    return this.payments.create(user, meta, body);
  }

  @Patch('payments/:id')
  @RequirePermission('vpay:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(VendorPaymentUpdateSchema)) body: VendorPaymentInput & { rowVersion: number }) {
    return this.payments.update(user, meta, id, body);
  }

  @Delete('payments/:id')
  @HttpCode(204)
  @RequirePermission('vpay:create')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.payments.remove(user, meta, id, q.rowVersion);
  }

  @Post('payments/:id/submit')
  @HttpCode(200)
  @RequirePermission('vpay:create')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.payments.submit(user, meta, id, body.rowVersion);
  }

  @Post('payments/:id/recall')
  @HttpCode(200)
  @RequirePermission('vpay:create')
  recall(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.payments.recall(user, meta, id, body.rowVersion);
  }

  /** No route permission: the approval engine decides who can act on the current step. */
  @Post('payments/:id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseCommentSchema)) body: { comment?: string }) {
    return this.payments.approve(user, meta, id, body.comment ?? null);
  }

  @Post('payments/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseRejectSchema)) body: { reason: string }) {
    return this.payments.reject(user, meta, id, body.reason);
  }

  @Post('payments/:id/post')
  @HttpCode(200)
  @RequirePermission('vpay:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.payments.post(user, meta, id, body.rowVersion);
  }

  @Post('payments/:id/void')
  @HttpCode(200)
  @RequirePermission('vpay:post')
  void(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.payments.void(user, meta, id, body.rowVersion, body.reason);
  }

  @Put('payments/:id/allocations')
  @RequirePermission('vpay:edit')
  allocate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PaymentAllocateSchema)) body: z.infer<typeof PaymentAllocateSchema>) {
    return this.payments.allocate(user, meta, id, body);
  }
}
