import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  AssemblyInputSchema, AssemblyUpdateSchema, DemandConvertSchema, DemandGenerateSchema, DemandInputSchema, DemandQuerySchema, DemandUpdateSchema, PriceUpdateInputSchema,
  PrincipalClaimInputSchema, PrincipalClaimSettleSchema, PrincipalClaimUpdateSchema, RowVersionSchema, StockReasonSchema, StockVoucherInputSchema, StockVoucherUpdateSchema,
  TargetInputSchema, TargetUpdateSchema, type AssemblyInput, type DemandInput, type PriceUpdateInput, type PrincipalClaimInput, type SessionUser, type StockVoucherInput, type TargetInput,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { DemandService } from '../application/demand.service.js';
import { StockVouchersService } from '../application/stock-vouchers.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);
const reason = pipe(StockReasonSchema);
type Q = z.infer<typeof DemandQuerySchema>;
type Rv = { rowVersion: number };
type Rs = { rowVersion: number; reason: string };
type U = SessionUser;
type M = RequestMeta;

/** /api/inventory/stock-vouchers (breakage, gift, sample, internal use) and /api/inventory/assembly-vouchers. */
@Controller('inventory')
export class StockVouchersController {
  constructor(private readonly s: StockVouchersService) {}
  @Get('demand-options') @RequirePermission('item:view') options(@CurrentUser() u: U) { return this.s.options(u); }

  @Get('stock-vouchers') @RequirePermission('adj:view') list(@CurrentUser() u: U, @Query(pipe(DemandQuerySchema)) q: Q) { return this.s.listVouchers(u, q); }
  @Get('stock-vouchers/:id') @RequirePermission('adj:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.getVoucher(u, id); }
  @Post('stock-vouchers') @RequirePermission('adj:create') create(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(StockVoucherInputSchema)) b: StockVoucherInput) { return this.s.createVoucher(u, m, b); }
  @Patch('stock-vouchers/:id') @RequirePermission('adj:edit') update(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(StockVoucherUpdateSchema)) b: StockVoucherInput & Rv) { return this.s.updateVoucher(u, m, id, b); }
  @Delete('stock-vouchers/:id') @HttpCode(204) @RequirePermission('adj:create') async remove(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.removeVoucher(u, m, id, q.rowVersion); }
  @Post('stock-vouchers/:id/post') @HttpCode(200) @RequirePermission('adj:post') post(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.postVoucher(u, m, id, b.rowVersion); }
  @Post('stock-vouchers/:id/cancel') @HttpCode(200) @RequirePermission('adj:post') cancel(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancelVoucher(u, m, id, b.rowVersion, b.reason); }

  @Get('assembly-vouchers') @RequirePermission('adj:view') listA(@CurrentUser() u: U, @Query(pipe(DemandQuerySchema)) q: Q) { return this.s.listAssemblies(u, q); }
  @Get('assembly-vouchers/:id') @RequirePermission('adj:view') getA(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.getAssembly(u, id); }
  @Post('assembly-vouchers') @RequirePermission('adj:create') createA(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(AssemblyInputSchema)) b: AssemblyInput) { return this.s.createAssembly(u, m, b); }
  @Patch('assembly-vouchers/:id') @RequirePermission('adj:edit') updateA(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(AssemblyUpdateSchema)) b: AssemblyInput & Rv) { return this.s.updateAssembly(u, m, id, b); }
  @Delete('assembly-vouchers/:id') @HttpCode(204) @RequirePermission('adj:create') async removeA(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.removeAssembly(u, m, id, q.rowVersion); }
  @Post('assembly-vouchers/:id/post') @HttpCode(200) @RequirePermission('adj:post') postA(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.postAssembly(u, m, id, b.rowVersion); }
  @Post('assembly-vouchers/:id/cancel') @HttpCode(200) @RequirePermission('adj:post') cancelA(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancelAssembly(u, m, id, b.rowVersion, b.reason); }
}

/** /api/inventory/demands, /principal-claims, /principal-targets, /price-updates. */
@Controller('inventory')
export class DemandController {
  constructor(private readonly s: DemandService) {}
  @Get('demands') @RequirePermission('item:view') list(@CurrentUser() u: U, @Query(pipe(DemandQuerySchema)) q: Q) { return this.s.listDemands(u, q); }
  @Post('demands/generate') @RequirePermission('item:edit') generate(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(DemandGenerateSchema)) b: z.infer<typeof DemandGenerateSchema>) { return this.s.generate(u, m, b); }
  @Get('demands/:id') @RequirePermission('item:view') get(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.getDemand(u, id); }
  @Post('demands') @RequirePermission('item:edit') create(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(DemandInputSchema)) b: DemandInput) { return this.s.createDemand(u, m, b); }
  @Patch('demands/:id') @RequirePermission('item:edit') update(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(DemandUpdateSchema)) b: DemandInput & Rv) { return this.s.updateDemand(u, m, id, b); }
  @Delete('demands/:id') @HttpCode(204) @RequirePermission('item:edit') async remove(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.removeDemand(u, m, id, q.rowVersion); }
  @Post('demands/:id/convert-to-po') @HttpCode(200) @RequirePermission('po:create') convert(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(DemandConvertSchema)) b: z.infer<typeof DemandConvertSchema>) { return this.s.convertToPo(u, m, id, b); }
  @Post('demands/:id/cancel') @HttpCode(200) @RequirePermission('item:edit') cancel(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancelDemand(u, m, id, b.rowVersion, b.reason); }

  @Get('principal-claims') @RequirePermission('item:view') listC(@CurrentUser() u: U, @Query(pipe(DemandQuerySchema)) q: Q) { return this.s.listClaims(u, q); }
  @Get('principal-claims/:id') @RequirePermission('item:view') getC(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.getClaim(u, id); }
  @Post('principal-claims') @RequirePermission('item:edit') createC(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(PrincipalClaimInputSchema)) b: PrincipalClaimInput) { return this.s.createClaim(u, m, b); }
  @Patch('principal-claims/:id') @RequirePermission('item:edit') updateC(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(PrincipalClaimUpdateSchema)) b: PrincipalClaimInput & Rv) { return this.s.updateClaim(u, m, id, b); }
  @Delete('principal-claims/:id') @HttpCode(204) @RequirePermission('item:edit') async removeC(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.removeClaim(u, m, id, q.rowVersion); }
  @Post('principal-claims/:id/submit') @HttpCode(200) @RequirePermission('item:edit') submitC(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.submitClaim(u, m, id, b.rowVersion); }
  @Post('principal-claims/:id/settle') @HttpCode(200) @RequirePermission('item:edit') settleC(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(PrincipalClaimSettleSchema)) b: z.infer<typeof PrincipalClaimSettleSchema>) { return this.s.settleClaim(u, m, id, b); }
  @Post('principal-claims/:id/cancel') @HttpCode(200) @RequirePermission('item:edit') cancelC(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(reason) b: Rs) { return this.s.cancelClaim(u, m, id, b.rowVersion, b.reason); }

  @Get('principal-targets') @RequirePermission('item:view') listT(@CurrentUser() u: U) { return this.s.listTargets(u); }
  @Post('principal-targets') @RequirePermission('item:edit') createT(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(TargetInputSchema)) b: TargetInput) { return this.s.saveTarget(u, m, b, null); }
  @Patch('principal-targets/:id') @RequirePermission('item:edit') updateT(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(pipe(TargetUpdateSchema)) b: TargetInput & Rv) { return this.s.saveTarget(u, m, b, id); }
  @Delete('principal-targets/:id') @HttpCode(204) @RequirePermission('item:edit') async removeT(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.removeTarget(u, m, id, q.rowVersion); }

  @Get('price-updates') @RequirePermission('item:view') listP(@CurrentUser() u: U, @Query(pipe(DemandQuerySchema)) q: Q) { return this.s.listPriceUpdates(u, q); }
  @Get('price-updates/:id') @RequirePermission('item:view') getP(@CurrentUser() u: U, @Param('id', uuid) id: string) { return this.s.getPriceUpdate(u, id); }
  @Post('price-updates') @RequirePermission('item:edit') createP(@CurrentUser() u: U, @ReqMeta() m: M, @Body(pipe(PriceUpdateInputSchema)) b: PriceUpdateInput) { return this.s.createPriceUpdate(u, m, b); }
  @Delete('price-updates/:id') @HttpCode(204) @RequirePermission('item:edit') async removeP(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Query(version) q: Rv) { await this.s.removePriceUpdate(u, m, id, q.rowVersion); }
  @Post('price-updates/:id/apply') @HttpCode(200) @RequirePermission('item:edit') applyP(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.applyPriceUpdate(u, m, id, b.rowVersion); }
  @Post('price-updates/:id/undo') @HttpCode(200) @RequirePermission('item:edit') undoP(@CurrentUser() u: U, @ReqMeta() m: M, @Param('id', uuid) id: string, @Body(version) b: Rv) { return this.s.undoPriceUpdate(u, m, id, b.rowVersion); }
}
