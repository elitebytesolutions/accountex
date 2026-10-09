import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CommissionCalcSchema, CreditDecisionSchema, CreditHoldSchema, CreditOverrideInputSchema, DeliveryUpdateSchema, DistributionQuerySchema, DistributionReasonSchema,
  DistributionRowVersionSchema, LoadSheetInputSchema, LoadSheetUpdateSchema, RecoveryGenerateSchema, RecoveryLinesSchema, RecoveryPostSchema, RouteSettlementSaveSchema,
  SalesmanTargetInputSchema, SalesmanTargetUpdateSchema, type CreditOverrideInput, type LoadSheetInput, type RouteSettlementSave, type SalesmanTargetInput, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CreditControlService } from '../../credit/application/credit-control.service.js';
import { LoadSheetsService } from '../../load-sheets/application/load-sheets.service.js';
import { RecoverySheetsService } from '../../recovery/application/recovery-sheets.service.js';
import { RouteSettlementsService } from '../../settlements/application/route-settlements.service.js';
import { TargetsService } from '../../targets/application/targets.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(DistributionRowVersionSchema);
const reason = pipe(DistributionReasonSchema);
const query = pipe(DistributionQuerySchema);
type Q = z.infer<typeof DistributionQuerySchema>;
type Rv = { rowVersion: number };
type Rs = { rowVersion: number; reason: string };
type U = SessionUser;
type M = RequestMeta;
const CandidatesSchema = z.object({ route: z.uuid('Choose the route'), date: z.iso.date() });

/** /api/distribution/load-sheets: route invoices → draft → approve → dispatch (gate pass) → deliveries; cancel. */
@Controller('distribution')
export class LoadSheetsController {
  constructor(private readonly s: LoadSheetsService) {}
  @Get('ops-options') @RequirePermission('route:view') options(@CurrentUser() u: U) { return this.s.options(u); }
  @Get('load-sheets/candidates') @RequirePermission('loadsht:view') candidates(@CurrentUser() u: U, @Query(pipe(CandidatesSchema)) q: z.infer<typeof CandidatesSchema>) { return this.s.candidates(u, q.route, q.date); }
  @Get('load-sheets') @RequirePermission('loadsht:view') list(@CurrentUser() u: U, @Query(query) q: Q) { return this.s.list(u, q); }
  @Get('load-sheets/:id') @RequirePermission('loadsht:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post('load-sheets') @RequirePermission('loadsht:create') create(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(LoadSheetInputSchema)) b: LoadSheetInput) { return this.s.create(u, m, b); }
  @Patch('load-sheets/:id') @RequirePermission('loadsht:edit') update(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(LoadSheetUpdateSchema)) b: LoadSheetInput & Rv) { return this.s.update(u, m, id, b); }
  @Delete('load-sheets/:id') @HttpCode(204) @RequirePermission('loadsht:create') async remove(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post('load-sheets/:id/approve') @HttpCode(200) @RequirePermission('loadsht:approve') approve(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.approve(u, m, id, b.rowVersion); }
  @Post('load-sheets/:id/dispatch') @HttpCode(200) @RequirePermission('loadsht:post') dispatch(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.dispatch(u, m, id, b.rowVersion); }
  @Post('load-sheets/:id/cancel') @HttpCode(200) @RequirePermission('loadsht:post') cancel(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancel(u, m, id, b.rowVersion, b.reason); }
  @Patch('load-sheets/:id/invoices/:invoiceId/delivery') @RequirePermission('delivery:edit') delivery(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Param('invoiceId', uuid) inv: string, @Body(pipe(DeliveryUpdateSchema)) b: z.infer<typeof DeliveryUpdateSchema>) { return this.s.delivery(u, m, id, inv, b.state, b.reason ?? null); }
}

/** /api/distribution/settlements: per-invoice cash / cheques / returns, cash count; post (settle:approve). */
@Controller('distribution/settlements')
export class RouteSettlementsController {
  constructor(private readonly s: RouteSettlementsService) {}
  @Get() @RequirePermission('settle:view') list(@CurrentUser() u: U, @Query(query) q: Q) { return this.s.list(u, q); }
  @Get(':id') @RequirePermission('settle:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Put(':id') @RequirePermission('settle:edit') save(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(RouteSettlementSaveSchema)) b: RouteSettlementSave) { return this.s.save(u, m, id, b); }
  @Post(':id/post') @HttpCode(200) @RequirePermission('settle:approve') post(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.post(u, m, id, b.rowVersion); }
}

/** /api/distribution/recovery-sheets: generate for a route, record collections / promises, post (receipts). */
@Controller('distribution/recovery-sheets')
export class RecoverySheetsController {
  constructor(private readonly s: RecoverySheetsService) {}
  @Get() @RequirePermission('recov:view') list(@CurrentUser() u: U, @Query(query) q: Q) { return this.s.list(u, q); }
  @Get(':id') @RequirePermission('recov:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.get(u, id); }
  @Post('generate') @RequirePermission('recov:create') generate(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(RecoveryGenerateSchema)) b: z.infer<typeof RecoveryGenerateSchema>) { return this.s.generate(u, m, b); }
  @Put(':id/lines') @RequirePermission('recov:edit') lines(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(RecoveryLinesSchema)) b: z.infer<typeof RecoveryLinesSchema>) { return this.s.saveLines(u, m, id, b); }
  @Post(':id/post') @HttpCode(200) @RequirePermission('recov:post') post(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(RecoveryPostSchema)) b: z.infer<typeof RecoveryPostSchema>) { return this.s.post(u, m, id, b.rowVersion, b.cashAccountId); }
}

/** /api/distribution/targets and /commissions: targets, calculate, approve, post (accrual), send to payroll. */
@Controller('distribution')
export class TargetsController {
  constructor(private readonly s: TargetsService) {}
  @Get('targets') @RequirePermission('target:view') overview(@CurrentUser() u: U) { return this.s.overview(u); }
  @Post('targets') @RequirePermission('target:create') create(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(SalesmanTargetInputSchema)) b: SalesmanTargetInput) { return this.s.create(u, m, b); }
  @Patch('targets/:id') @RequirePermission('target:edit') update(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(SalesmanTargetUpdateSchema)) b: SalesmanTargetInput & Rv) { return this.s.update(u, m, id, b); }
  @Delete('targets/:id') @HttpCode(204) @RequirePermission('target:edit') async remove(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.remove(u, m, id, q.rowVersion); }
  @Post('commissions/calculate') @HttpCode(200) @RequirePermission('target:edit') calculate(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(CommissionCalcSchema)) b: z.infer<typeof CommissionCalcSchema>) { return this.s.calculate(u, m, b); }
  @Post('commissions/:id/approve') @HttpCode(200) @RequirePermission('target:approve') approve(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.approve(u, m, id, b.rowVersion); }
  @Post('commissions/:id/post') @HttpCode(200) @RequirePermission('target:post') post(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.post(u, m, id, b.rowVersion); }
  @Post('commissions/:id/cancel') @HttpCode(200) @RequirePermission('target:approve') cancel(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.cancel(u, m, id, b.rowVersion); }
  @Post('commissions/:id/send-to-payroll') @HttpCode(200) @RequirePermission('target:post') payroll(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.sendToPayroll(u, m, id, b.rowVersion); }
}

/** /api/receivables/credit: overview, holds, override requests and decisions. */
@Controller('receivables/credit')
export class CreditControlController {
  constructor(private readonly s: CreditControlService) {}
  @Get() @RequirePermission('crovr:view') overview(@CurrentUser() u: U) { return this.s.overview(u); }
  @Post('holds/:customerId/place') @HttpCode(200) @RequirePermission('crovr:approve') place(@CurrentUser() u: U, @ReqMeta() m: M, @Param('customerId', uuid) id: string, @Body(pipe(CreditHoldSchema)) b: z.infer<typeof CreditHoldSchema>) { return this.s.hold(u, m, id, true, b.reason, b.notes ?? null); }
  @Post('holds/:customerId/release') @HttpCode(200) @RequirePermission('crovr:approve') release(@CurrentUser() u: U, @ReqMeta() m: M, @Param('customerId', uuid) id: string, @Body(pipe(CreditHoldSchema)) b: z.infer<typeof CreditHoldSchema>) { return this.s.hold(u, m, id, false, b.reason, b.notes ?? null); }
  @Post('overrides') @RequirePermission('crovr:view') request(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(CreditOverrideInputSchema)) b: CreditOverrideInput) { return this.s.request(u, m, b); }
  @Post('overrides/:id/approve') @HttpCode(200) @RequirePermission('crovr:approve') approve(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(CreditDecisionSchema)) b: z.infer<typeof CreditDecisionSchema>) { return this.s.approve(u, m, id, b.comment ?? null); }
  @Post('overrides/:id/reject') @HttpCode(200) @RequirePermission('crovr:approve') reject(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(CreditDecisionSchema)) b: z.infer<typeof CreditDecisionSchema>) { return this.s.reject(u, m, id, b.comment ?? null); }
}
