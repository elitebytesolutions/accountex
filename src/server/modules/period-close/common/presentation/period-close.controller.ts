import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ReminderRunSchema, ReopenDecisionSchema, ReopenRequestInputSchema, StatementQuerySchemaBs, StatementQuerySchemaCf, StatementQuerySchemaPnl, YearEndAdjustmentInputSchema,
  YearEndCancelSchema, YearEndRunSchema, type ReopenRequestInput, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ReminderRunsService } from '../../reminders/application/reminder-runs.service.js';
import { ReopenRequestsService } from '../../reopen/application/reopen-requests.service.js';
import { StatementsService } from '../../statements/application/statements.service.js';
import { YearEndService } from '../../year-end/application/year-end.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const decision = pipe(ReopenDecisionSchema);
type U = SessionUser;
type M = RequestMeta;
type D = { comment?: string | null };

/** /api/accounting/period-reopen-requests: request (close:post), approve / reject (close:approve, not the requester), withdraw, re-close. */
@Controller('accounting/period-reopen-requests')
export class ReopenRequestsController {
  constructor(private readonly s: ReopenRequestsService) {}
  @Get() @RequirePermission('close:view') list(@CurrentUser() u: U) { return this.s.list(u); }
  @Post() @RequirePermission('close:post') request(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(ReopenRequestInputSchema)) b: ReopenRequestInput) { return this.s.request(u, m, b); }
  @Post(':id/approve') @HttpCode(200) @RequirePermission('close:approve') approve(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(decision) b: D) { return this.s.approve(u, m, id, b.comment ?? null); }
  @Post(':id/reject') @HttpCode(200) @RequirePermission('close:approve') reject(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(decision) b: D) { return this.s.reject(u, m, id, b.comment ?? null); }
  @Post(':id/cancel') @HttpCode(200) @RequirePermission('close:view') cancel(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(decision) b: D) { return this.s.cancel(u, m, id, b.comment ?? null); }
  @Post(':id/reclose') @HttpCode(200) @RequirePermission('close:approve') reclose(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string) { return this.s.reclose(u, m, id); }
}

/** /api/accounting/year-end/:fiscalYearId: checklist + figures, adjustments, dry run, final close (close:approve), cancel. */
@Controller('accounting/year-end')
export class YearEndController {
  constructor(private readonly s: YearEndService) {}
  @Get(':fy') @RequirePermission('close:view') get(@CurrentUser() u: U, @Param('fy', uuid) fy: string) { return this.s.get(u, fy); }
  @Post(':fy/adjustments') @RequirePermission('close:post') add(@CurrentUser() u: U, @ReqMeta() m: M, @Param('fy', uuid) fy: string, @Body(pipe(YearEndAdjustmentInputSchema)) b: z.infer<typeof YearEndAdjustmentInputSchema>) { return this.s.addAdjustment(u, m, fy, b); }
  @Post(':fy/adjustments/:id/post') @HttpCode(200) @RequirePermission('close:post') postAdj(@CurrentUser() u: U, @ReqMeta() m: M, @Param('fy', uuid) fy: string, @Param('id', uuid) id: string) { return this.s.postAdjustment(u, m, fy, id); }
  @Delete(':fy/adjustments/:id') @RequirePermission('close:post') removeAdj(@CurrentUser() u: U, @ReqMeta() m: M, @Param('fy', uuid) fy: string, @Param('id', uuid) id: string) { return this.s.removeAdjustment(u, m, fy, id); }
  @Post(':fy/dry-run') @HttpCode(200) @RequirePermission('close:post') dryRun(@CurrentUser() u: U, @ReqMeta() m: M, @Param('fy', uuid) fy: string) { return this.s.dryRun(u, m, fy); }
  @Post(':fy/close') @HttpCode(200) @RequirePermission('close:approve') close(@CurrentUser() u: U, @ReqMeta() m: M, @Param('fy', uuid) fy: string, @Body(pipe(YearEndRunSchema)) b: z.infer<typeof YearEndRunSchema>) { return this.s.close(u, m, fy, b.acknowledgeWarnings); }
  @Post('runs/:id/cancel') @HttpCode(200) @RequirePermission('close:approve') cancel(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(YearEndCancelSchema)) b: z.infer<typeof YearEndCancelSchema>) { return this.s.cancel(u, m, id, b.rowVersion, b.reason); }
}

/** /api/receivables/reminder-runs: due queue + outbox log; run now (all due, one customer, chosen invoices). */
@Controller('receivables/reminder-runs')
export class ReminderRunsController {
  constructor(private readonly s: ReminderRunsService) {}
  @Get() @RequirePermission('rcpt:view') overview(@CurrentUser() u: U) { return this.s.overview(u); }
  @Post() @HttpCode(200) @RequirePermission('rcpt:edit') run(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(ReminderRunSchema)) b: z.infer<typeof ReminderRunSchema>) { return this.s.run(u, m, b); }
}

/** /api/reports/financial-statements/{pnl,balance-sheet,cash-flow} (frep:view). */
@Controller('reports/financial-statements')
export class StatementsController {
  constructor(private readonly s: StatementsService) {}
  @Get('pnl') @RequirePermission('frep:view') pnl(@CurrentUser() u: U, @Query(pipe(StatementQuerySchemaPnl)) q: z.infer<typeof StatementQuerySchemaPnl>) { return this.s.pnl(u, q); }
  @Get('balance-sheet') @RequirePermission('frep:view') bs(@CurrentUser() u: U, @Query(pipe(StatementQuerySchemaBs)) q: z.infer<typeof StatementQuerySchemaBs>) { return this.s.balanceSheet(u, q); }
  @Get('cash-flow') @RequirePermission('frep:view') cf(@CurrentUser() u: U, @Query(pipe(StatementQuerySchemaCf)) q: z.infer<typeof StatementQuerySchemaCf>) { return this.s.cashFlow(u, q); }
}
