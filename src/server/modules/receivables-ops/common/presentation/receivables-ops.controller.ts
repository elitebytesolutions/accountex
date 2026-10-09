import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  AgeingQuerySchema, CreditNoteInputSchema, CreditNoteUpdateSchema, CustomerReceiptInputSchema, PosSaleSchema, PosShiftCloseSchema, PosShiftOpenSchema,
  ReceiptAllocationsSchema, ReceiptVoidSchema, ReceivablesQuerySchema, ReceivablesReasonSchema, ReceivablesRowVersionSchema, RecurringInvoiceInputSchema,
  RecurringInvoiceUpdateSchema, SalesReturnInputSchema, SalesReturnUpdateSchema, StatementQuerySchema, type CreditNoteInput, type CustomerReceiptInput,
  type PosSaleInput, type PosShiftOpenInput, type RecurringInvoiceInput, type SalesReturnInput, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CreditNotesService } from '../../credit-notes/application/credit-notes.service.js';
import { PosService } from '../../pos/application/pos.service.js';
import { CustomerReceiptsService } from '../../receipts/application/customer-receipts.service.js';
import { RecurringInvoicesService } from '../../recurring/application/recurring-invoices.service.js';
import { ArReportsService } from '../../reports/application/ar-reports.service.js';
import { SalesReturnsService } from '../../returns/application/sales-returns.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(ReceivablesRowVersionSchema);
const reason = pipe(ReceivablesReasonSchema);
const query = pipe(ReceivablesQuerySchema);
type Q = z.infer<typeof ReceivablesQuerySchema>;
type Rv = { rowVersion: number };
type Rs = { rowVersion: number; reason: string };
type U = SessionUser;
type M = RequestMeta;

/** /api/sales/receivables-options: customers, products, cash / bank accounts and the lookups the Phase 24 screens use. */
@Controller('sales')
export class ReceivablesOptionsController {
  constructor(private readonly s: ArReportsService) {}
  /** Any of sinv:view, rcpt:view, pos:create (checked in the service: the guard needs every listed code). */
  @Get('receivables-options') options(@CurrentUser() u: U) { return this.s.options(u); }
}

/** /api/sales/returns: draft → post (stock back in, credit note) → cancel. */
@Controller('sales/returns')
export class SalesReturnsController {
  constructor(private readonly s: SalesReturnsService) {}
  @Get() @RequirePermission('sinv:view') list(@CurrentUser() u: U, @Query(query) q: Q) { return this.s.list(u, q); }
  @Get('invoice/:invoiceId') @RequirePermission('sinv:view') returnable(@CurrentUser() u: U, @Param('invoiceId', uuid) id: string) { return this.s.returnable(u, id); }
  @Get(':id') @RequirePermission('sinv:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post() @RequirePermission('sinv:create') create(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(SalesReturnInputSchema)) b: SalesReturnInput) { return this.s.create(u, m, b); }
  @Patch(':id') @RequirePermission('sinv:edit') update(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(SalesReturnUpdateSchema)) b: SalesReturnInput & Rv) { return this.s.update(u, m, id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('sinv:delete') async remove(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post(':id/post') @HttpCode(200) @RequirePermission('sinv:post') post(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.post(u, m, id, b.rowVersion); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('sinv:post') cancel(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancel(u, m, id, b.rowVersion, b.reason); }
}

/** /api/sales/credit-notes: draft → post (applied to the invoice or kept as customer credit) → cancel. */
@Controller('sales/credit-notes')
export class CreditNotesController {
  constructor(private readonly s: CreditNotesService) {}
  @Get() @RequirePermission('sinv:view') list(@CurrentUser() u: U, @Query(query) q: Q) { return this.s.list(u, q); }
  @Get(':id') @RequirePermission('sinv:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post() @RequirePermission('sinv:create') create(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(CreditNoteInputSchema)) b: CreditNoteInput) { return this.s.create(u, m, b); }
  @Patch(':id') @RequirePermission('sinv:edit') update(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(CreditNoteUpdateSchema)) b: CreditNoteInput & Rv) { return this.s.update(u, m, id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('sinv:delete') async remove(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post(':id/post') @HttpCode(200) @RequirePermission('sinv:post') post(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.post(u, m, id, b.rowVersion); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('sinv:post') cancel(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancel(u, m, id, b.rowVersion, b.reason); }
}

/** /api/receivables/receipts (recorded and posted in one step), allocations, void; /open-items; AR ageing and statement. */
@Controller('receivables')
export class CustomerReceiptsController {
  constructor(private readonly s: CustomerReceiptsService, private readonly r: ArReportsService) {}
  @Get('receipts') @RequirePermission('rcpt:view') list(@CurrentUser() u: U, @Query(query) q: Q) { return this.s.list(u, q); }
  @Get('receipts/:id') @RequirePermission('rcpt:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post('receipts') @RequirePermission('rcpt:post') create(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(CustomerReceiptInputSchema)) b: CustomerReceiptInput) { return this.s.create(u, m, b); }
  @Put('receipts/:id/allocations') @RequirePermission('rcpt:edit') allocate(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(ReceiptAllocationsSchema)) b: z.infer<typeof ReceiptAllocationsSchema>) { return this.s.allocate(u, m, id, b.rowVersion, b.allocations); }
  @Post('receipts/:id/void') @HttpCode(200) @RequirePermission('rcpt:post') void(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(ReceiptVoidSchema)) b: Rs) { return this.s.void(u, m, id, b.rowVersion, b.reason); }
  @Get('open-items') @RequirePermission('rcpt:view') openItems(@CurrentUser() u: U, @Query('customer', uuid) customer: string) { return this.s.openItems(u, customer); }
  @Get('ageing') @RequirePermission('rcpt:view') ageing(@CurrentUser() u: U, @Query(pipe(AgeingQuerySchema)) q: z.infer<typeof AgeingQuerySchema>) { return this.r.ageing(u, q); }
  @Get('statement') @RequirePermission('rcpt:view') statement(@CurrentUser() u: U, @Query(pipe(StatementQuerySchema)) q: z.infer<typeof StatementQuerySchema>) { return this.r.statement(u, q); }
}

/** /api/sales/recurring-invoices: profiles, run-now / pause / resume (plus the hourly job). */
@Controller('sales/recurring-invoices')
export class RecurringInvoicesController {
  constructor(private readonly s: RecurringInvoicesService) {}
  @Get() @RequirePermission('sinv:view') list(@CurrentUser() u: U, @Query(query) q: Q) { return this.s.list(u, q); }
  @Get(':id') @RequirePermission('sinv:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post() @RequirePermission('sinv:create') create(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(RecurringInvoiceInputSchema)) b: RecurringInvoiceInput) { return this.s.create(u, m, b); }
  @Patch(':id') @RequirePermission('sinv:edit') update(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(RecurringInvoiceUpdateSchema)) b: RecurringInvoiceInput & Rv) { return this.s.update(u, m, id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission('sinv:delete') async remove(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post(':id/run-now') @HttpCode(200) @RequirePermission('sinv:post') runNow(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.runNow(u, m, id, b.rowVersion); }
  @Post(':id/pause') @HttpCode(200) @RequirePermission('sinv:edit') pause(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.pause(u, m, id, b.rowVersion); }
  @Post(':id/resume') @HttpCode(200) @RequirePermission('sinv:edit') resume(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.resume(u, m, id, b.rowVersion); }
}

/** /api/sales/pos: session, shifts open / close / report, sale (invoice + payments), hold / resume / discard. */
@Controller('sales/pos')
export class PosController {
  constructor(private readonly s: PosService) {}
  @Get('session') @RequirePermission('pos:create') session(@CurrentUser() u: U) { return this.s.session(u); }
  @Get('shifts') @RequirePermission('pos:view') shifts(@CurrentUser() u: U, @Query(query) q: Q) { return this.s.listShifts(u, q); }
  @Get('shifts/:id') @RequirePermission('pos:view') report(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.report(u, id); }
  @Post('shifts/open') @RequirePermission('pos:create') open(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(PosShiftOpenSchema)) b: PosShiftOpenInput) { return this.s.open(u, m, b); }
  @Post('shifts/:id/close') @HttpCode(200) @RequirePermission('pos:create') close(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(PosShiftCloseSchema)) b: z.infer<typeof PosShiftCloseSchema>) { return this.s.close(u, m, id, b); }
  @Post('sales') @RequirePermission('pos:create') sale(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(PosSaleSchema)) b: PosSaleInput) { return this.s.sale(u, m, b); }
  @Delete('sales/:id') @HttpCode(204) @RequirePermission('pos:create') async discard(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string) { await this.s.discard(u, m, id); }
}
