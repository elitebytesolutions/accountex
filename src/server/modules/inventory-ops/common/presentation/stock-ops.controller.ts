import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  AdjustmentInputSchema, AdjustmentUpdateSchema, CountApproveSchema, CountEntrySchema, CountInputSchema, PurchaseCommentSchema, PurchaseRejectSchema, RowVersionSchema,
  StockEntryInputSchema, StockEntryUpdateSchema, StockOpsQuerySchema, StockReasonSchema, TransferInputSchema, TransferReceiveSchema, TransferUpdateSchema,
  type AdjustmentInput, type CountInput, type SessionUser, type StockEntryInput, type TransferInput,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PermissionDeniedError } from '../../../../core/domain/errors.js';
import { StockAdjustmentsService } from '../../adjustments/application/stock-adjustments.service.js';
import { StockCountsService } from '../../counts/application/stock-counts.service.js';
import { StockEntriesService } from '../../entries/application/stock-entries.service.js';
import { StockTransfersService } from '../../transfers/application/stock-transfers.service.js';
import { StockOpsStore } from '../application/stock-ops-store.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);
const reason = pipe(StockReasonSchema);
type Q = z.infer<typeof StockOpsQuerySchema>;
type Rv = { rowVersion: number };
type Rs = { rowVersion: number; reason: string };
const VIEW = ['adj:view', 'xfer:view', 'cnt:view'];

/** /api/inventory/ops/...: options and on-hand stock for the stock-operation screens. */
@Controller('inventory/ops')
export class StockOpsController {
  constructor(private readonly store: StockOpsStore) {}

  @Get('options')
  options(@CurrentUser() user: SessionUser) {
    if (!VIEW.some((p) => user.permissions.includes(p))) throw new PermissionDeniedError('You do not have permission to do this.');
    return this.store.options(user.tenantId);
  }

  @Get('on-hand')
  onHand(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ warehouse: z.uuid() }))) q: { warehouse: string }) {
    if (!VIEW.some((p) => user.permissions.includes(p))) throw new PermissionDeniedError('You do not have permission to do this.');
    return this.store.onHand(user.tenantId, q.warehouse);
  }
}

/** /api/inventory/stock-in-out: Stock › Stock In / Out. */
@Controller('inventory/stock-in-out')
export class StockEntriesController {
  constructor(private readonly s: StockEntriesService) {}
  @Get() @RequirePermission('adj:view') list(@CurrentUser() u: SessionUser, @Query(pipe(StockOpsQuerySchema)) q: Q) { return this.s.list(u, q); }
  @Get(':id') @RequirePermission('adj:view') get(@CurrentUser() u: SessionUser, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post() @RequirePermission('adj:create') create(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Body(pipe(StockEntryInputSchema)) b: StockEntryInput) { return this.s.create(u, m, b); }
  @Patch(':id') @RequirePermission('adj:edit') update(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(StockEntryUpdateSchema)) b: StockEntryInput & Rv) { return this.s.update(u, m, id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('adj:create') async remove(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post(':id/post') @HttpCode(200) @RequirePermission('adj:post') post(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.post(u, m, id, b.rowVersion); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('adj:post') cancel(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancel(u, m, id, b.rowVersion, b.reason); }
}

/** /api/inventory/transfers: Stock › Stock Transfer. */
@Controller('inventory/transfers')
export class StockTransfersController {
  constructor(private readonly s: StockTransfersService) {}
  @Get() @RequirePermission('xfer:view') list(@CurrentUser() u: SessionUser, @Query(pipe(StockOpsQuerySchema)) q: Q) { return this.s.list(u, q); }
  @Get(':id') @RequirePermission('xfer:view') get(@CurrentUser() u: SessionUser, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post() @RequirePermission('xfer:create') create(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Body(pipe(TransferInputSchema)) b: TransferInput) { return this.s.create(u, m, b); }
  @Patch(':id') @RequirePermission('xfer:edit') update(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TransferUpdateSchema)) b: TransferInput & Rv) { return this.s.update(u, m, id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('xfer:create') async remove(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post(':id/dispatch') @HttpCode(200) @RequirePermission('xfer:post') dispatch(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.dispatch(u, m, id, b.rowVersion); }
  @Post(':id/receive') @HttpCode(200) @RequirePermission('xfer:post') receive(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TransferReceiveSchema)) b: z.infer<typeof TransferReceiveSchema>) { return this.s.receive(u, m, id, b); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('xfer:post') cancel(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancel(u, m, id, b.rowVersion, b.reason); }
}

/** /api/inventory/adjustments: Stock › Stock Adjustments. */
@Controller('inventory/adjustments')
export class StockAdjustmentsController {
  constructor(private readonly s: StockAdjustmentsService) {}
  @Get() @RequirePermission('adj:view') list(@CurrentUser() u: SessionUser, @Query(pipe(StockOpsQuerySchema)) q: Q) { return this.s.list(u, q); }
  @Get(':id') @RequirePermission('adj:view') get(@CurrentUser() u: SessionUser, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post() @RequirePermission('adj:create') create(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Body(pipe(AdjustmentInputSchema)) b: AdjustmentInput) { return this.s.create(u, m, b); }
  @Patch(':id') @RequirePermission('adj:edit') update(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AdjustmentUpdateSchema)) b: AdjustmentInput & Rv) { return this.s.update(u, m, id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('adj:create') async remove(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post(':id/submit') @HttpCode(200) @RequirePermission('adj:create') submit(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.submit(u, m, id, b.rowVersion); }
  /** No route permission: the approval engine decides who can act. */
  @Post(':id/approve') @HttpCode(200) approve(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseCommentSchema)) b: { comment?: string }) { return this.s.approve(u, m, id, b.comment ?? null); }
  @Post(':id/reject') @HttpCode(200) reject(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseRejectSchema)) b: { reason: string }) { return this.s.reject(u, m, id, b.reason); }
  @Post(':id/post') @HttpCode(200) @RequirePermission('adj:post') post(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.post(u, m, id, b.rowVersion); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('adj:post') cancel(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancel(u, m, id, b.rowVersion, b.reason); }
}

/** /api/inventory/counts: Stock › Stock Count. */
@Controller('inventory/counts')
export class StockCountsController {
  constructor(private readonly s: StockCountsService) {}
  @Get() @RequirePermission('cnt:view') list(@CurrentUser() u: SessionUser, @Query(pipe(StockOpsQuerySchema)) q: Q) { return this.s.list(u, q); }
  @Get(':id') @RequirePermission('cnt:view') get(@CurrentUser() u: SessionUser, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post() @RequirePermission('cnt:create') create(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Body(pipe(CountInputSchema)) b: CountInput) { return this.s.create(u, m, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('cnt:create') async remove(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post(':id/freeze') @HttpCode(200) @RequirePermission('cnt:create') freeze(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.freeze(u, m, id, b.rowVersion); }
  @Post(':id/lines') @HttpCode(200) @RequirePermission('cnt:edit') enter(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CountEntrySchema)) b: z.infer<typeof CountEntrySchema>) { return this.s.enter(u, m, id, b); }
  @Post(':id/approve') @HttpCode(200) @RequirePermission('cnt:approve') approve(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CountApproveSchema)) b: z.infer<typeof CountApproveSchema>) { return this.s.approve(u, m, id, b.rowVersion, b.comment); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('cnt:post') cancel(@CurrentUser() u: SessionUser, @ReqMeta() m: RequestMeta, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancel(u, m, id, b.rowVersion, b.reason); }
}
