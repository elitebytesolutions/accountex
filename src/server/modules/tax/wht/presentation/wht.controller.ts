import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema, WhtChallanInputSchema, WhtDeductionInputSchema, WhtQuerySchema, type SessionUser, type WhtChallanInput, type WhtDeductionInput, type WhtQuery,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { WhtService } from '../application/wht.service.js';

const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const uuid = new ParseUUIDPipe();
const month = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).transform((v) => (v.length === 7 ? `${v}-01` : v));
const SummaryQuery = z.object({ period: month.optional() });
const ChallanQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
const UnpaidQuery = z.object({ period: month, sections: z.string().min(1).transform((v) => v.split(',').filter(Boolean)) });
const CancelBody = z.object({ rowVersion: z.coerce.number().int().min(0), reason: z.string().trim().max(300).optional().nullable().transform((v) => v || null) });
const DeductionUpdate = WhtDeductionInputSchema.extend({ rowVersion: z.coerce.number().int().min(0) });

/** /api/tax/wht/challans: CPR payments of a month's deductions (listed before the register's /:id routes). */
@Controller('tax/wht/challans')
export class WhtChallansController {
  constructor(private readonly wht: WhtService) {}

  @Get()
  @RequirePermission('tax:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(ChallanQuery)) q: { from?: string; to?: string }) {
    return this.wht.listChallans(user, q.from ?? null, q.to ?? null);
  }

  /** The unpaid total a challan for these sections must carry. */
  @Get('unpaid')
  @RequirePermission('tax:view')
  unpaid(@CurrentUser() user: SessionUser, @Query(pipe(UnpaidQuery)) q: { period: string; sections: string[] }) {
    return this.wht.unpaid(user, q.period, q.sections);
  }

  /** Records a challan; with post: true (default) it is paid straight away (deductions PAID + BPV). */
  @Post()
  @RequirePermission('tax:post')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(WhtChallanInputSchema)) body: WhtChallanInput) {
    return this.wht.createChallan(user, meta, body);
  }

  @Get(':id')
  @RequirePermission('tax:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.wht.getChallan(user, id);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('tax:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.wht.postChallan(user, meta, id, body.rowVersion);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('tax:post')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CancelBody)) body: { rowVersion: number; reason: string | null }) {
    return this.wht.cancelChallan(user, meta, id, body.rowVersion, body.reason);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tax:edit')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.wht.removeChallan(user, meta, id, q.rowVersion);
  }
}

/** /api/tax/wht: Tax & Compliance › Withholding Tax — the register of tax deducted / collected / suffered. */
@Controller('tax/wht')
export class WhtController {
  constructor(private readonly wht: WhtService) {}

  @Get()
  @RequirePermission('tax:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(WhtQuerySchema)) q: WhtQuery) {
    return this.wht.list(user, q);
  }

  /** "Deductions by section" and the KPIs for a month. */
  @Get('summary')
  @RequirePermission('tax:view')
  summary(@CurrentUser() user: SessionUser, @Query(pipe(SummaryQuery)) q: { period?: string }) {
    return this.wht.summary(user, q.period);
  }

  @Post()
  @RequirePermission('tax:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(WhtDeductionInputSchema)) body: WhtDeductionInput) {
    return this.wht.create(user, meta, body);
  }

  @Get(':id')
  @RequirePermission('tax:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.wht.get(user, id);
  }

  @Patch(':id')
  @RequirePermission('tax:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DeductionUpdate)) body: WhtDeductionInput & { rowVersion: number }) {
    return this.wht.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tax:edit')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.wht.remove(user, meta, id, q.rowVersion);
  }
}
