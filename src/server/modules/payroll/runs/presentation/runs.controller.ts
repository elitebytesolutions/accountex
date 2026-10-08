import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  PayrollAdjustmentsSchema, RunApproveSchema, RunChecklistSchema, RunCreateSchema, RunListQuerySchema, RunPaySchema, RunPostSchema, RunPreviewQuerySchema,
  RunReasonSchema, RunUpdateSchema, type PayrollAdjustmentsInput, type RunCreate, type RunPay, type RunUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RunsService } from '../application/runs.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const MonthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Choose the month') });

/** /api/payroll/runs and /api/payroll/overview: Workforce › Payroll (overview, run wizard). */
@Controller('payroll')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get('overview')
  @RequirePermission('prun:view')
  overview(@CurrentUser() user: SessionUser) {
    return this.runs.overview(user);
  }

  @Get('runs')
  @RequirePermission('prun:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(RunListQuerySchema)) q: z.infer<typeof RunListQuerySchema>) {
    return this.runs.list(user, q);
  }

  @Get('runs/options')
  @RequirePermission('prun:view')
  options(@CurrentUser() user: SessionUser) {
    return this.runs.options(user);
  }

  @Get('runs/preview')
  @RequirePermission('prun:view')
  preview(@CurrentUser() user: SessionUser, @Query(pipe(RunPreviewQuerySchema)) q: z.infer<typeof RunPreviewQuerySchema>) {
    return this.runs.preview(user, q);
  }

  @Post('runs')
  @RequirePermission('prun:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(RunCreateSchema)) body: RunCreate) {
    return this.runs.create(user, meta, body);
  }

  /** Phase 30 overtime screen: push the month's approved overtime into its open run. */
  @Post('runs/push-overtime')
  @HttpCode(200)
  @RequirePermission('prun:edit')
  pushOvertime(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(MonthSchema)) body: { month: string }) {
    return this.runs.pushOvertime(user, meta, body.month);
  }

  @Get('runs/:id')
  @RequirePermission('prun:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.runs.get(user, id);
  }

  @Patch('runs/:id')
  @RequirePermission('prun:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunUpdateSchema)) body: RunUpdate) {
    return this.runs.update(user, meta, id, body);
  }

  @Post('runs/:id/sync-inputs')
  @HttpCode(200)
  @RequirePermission('prun:edit')
  async sync(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return (await this.runs.syncInputs(user, meta, id)).run;
  }

  @Put('runs/:id/adjustments')
  @RequirePermission('prun:edit')
  adjustments(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PayrollAdjustmentsSchema)) body: PayrollAdjustmentsInput) {
    return this.runs.saveAdjustments(user, meta, id, body);
  }

  @Post('runs/:id/calculate')
  @HttpCode(200)
  @RequirePermission('prun:edit')
  calculate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.runs.calculate(user, meta, id);
  }

  @Put('runs/:id/checklist')
  @RequirePermission('prun:view')
  checklist(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunChecklistSchema)) body: z.infer<typeof RunChecklistSchema>) {
    return this.runs.checklist(user, meta, id, body.itemKey, body.isDone);
  }

  @Post('runs/:id/submit')
  @HttpCode(200)
  @RequirePermission('prun:edit')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.runs.submit(user, meta, id);
  }

  /** The approval engine decides who may approve (the step's approvers; never the preparer). */
  @Post('runs/:id/approve')
  @HttpCode(200)
  @RequirePermission('prun:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunApproveSchema)) body: z.infer<typeof RunApproveSchema>) {
    return this.runs.approve(user, meta, id, body.comment);
  }

  @Post('runs/:id/reject')
  @HttpCode(200)
  @RequirePermission('prun:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunReasonSchema)) body: { reason: string }) {
    return this.runs.reject(user, meta, id, body.reason);
  }

  @Post('runs/:id/send-back')
  @HttpCode(200)
  @RequirePermission('prun:view')
  sendBack(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunReasonSchema)) body: { reason: string }) {
    return this.runs.sendBack(user, meta, id, body.reason);
  }

  @Post('runs/:id/post')
  @HttpCode(200)
  @RequirePermission('prun:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunPostSchema)) body: z.infer<typeof RunPostSchema>) {
    return this.runs.post(user, meta, id, body);
  }

  @Post('runs/:id/pay')
  @HttpCode(200)
  @RequirePermission('prun:post')
  pay(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunPaySchema)) body: RunPay) {
    return this.runs.pay(user, meta, id, body);
  }

  @Post('runs/:id/cancel')
  @HttpCode(200)
  @RequirePermission('prun:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunReasonSchema)) body: { reason: string }) {
    return this.runs.cancel(user, meta, id, body.reason);
  }

  @Post('runs/:id/reverse')
  @HttpCode(200)
  @RequirePermission('prun:post')
  reverse(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RunReasonSchema)) body: { reason: string }) {
    return this.runs.reverse(user, meta, id, body.reason);
  }

  @Get('runs/:id/bank-advice')
  @RequirePermission('prun:export')
  async bankAdvice(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.runs.bankAdvice(user, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
    return f.body;
  }
}
