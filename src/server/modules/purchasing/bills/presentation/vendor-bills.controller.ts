import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BillFromGrnSchema, BillInputSchema, BillUpdateSchema, PurchaseCommentSchema, PurchaseQuerySchema, PurchaseReasonSchema, PurchaseRejectSchema, PurchaseVoucherSchema, RowVersionSchema,
  type BillInput, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { VendorBillsService } from '../application/vendor-bills.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/purchases/bills: Purchases & Payables › Vendor Bills. */
@Controller('purchases/bills')
export class VendorBillsController {
  constructor(private readonly bills: VendorBillsService) {}

  @Get()
  @RequirePermission('bill:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(PurchaseQuerySchema)) q: z.infer<typeof PurchaseQuerySchema>) {
    return this.bills.list(user, q);
  }

  /** bill:view, or the approver of the bill's current step (the approval inbox links here). */
  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.bills.view(user, id);
  }

  @Post()
  @RequirePermission('bill:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BillInputSchema)) body: BillInput) {
    return this.bills.create(user, meta, body);
  }

  @Post('from-grn/:grnId')
  @RequirePermission('bill:create')
  fromGrn(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('grnId', uuid) grnId: string, @Body(pipe(BillFromGrnSchema)) body: z.infer<typeof BillFromGrnSchema>) {
    return this.bills.fromGrn(user, meta, grnId, body);
  }

  @Patch(':id')
  @RequirePermission('bill:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(BillUpdateSchema)) body: BillInput & { rowVersion: number }) {
    return this.bills.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('bill:create')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.bills.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('bill:create')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.bills.submit(user, meta, id, body.rowVersion);
  }

  @Post(':id/recall')
  @HttpCode(200)
  @RequirePermission('bill:create')
  recall(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.bills.recall(user, meta, id, body.rowVersion);
  }

  /** No route permission: eligibility is the approval engine's (approvers may hold no purchasing role); with no workflow, bill:approve. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseCommentSchema)) body: { comment?: string }) {
    return this.bills.approve(user, meta, id, body.comment ?? null);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseRejectSchema)) body: { reason: string }) {
    return this.bills.reject(user, meta, id, body.reason);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('bill:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.bills.post(user, meta, id, body.rowVersion);
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermission('bill:post')
  void(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.bills.void(user, meta, id, body.rowVersion, body.reason);
  }
}

/** /api/purchases/vouchers: the counter purchase voucher (a COUNTER bill, saved and posted in one step). */
@Controller('purchases/vouchers')
export class PurchaseVouchersController {
  constructor(private readonly bills: VendorBillsService) {}

  @Post()
  @RequirePermission('bill:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PurchaseVoucherSchema)) body: BillInput & { post: boolean }) {
    return this.bills.voucher(user, meta, body);
  }
}
