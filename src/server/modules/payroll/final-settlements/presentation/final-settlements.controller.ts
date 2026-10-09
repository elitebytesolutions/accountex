import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  SettlementCommentSchema, SettlementPaySchema, SettlementQuerySchema, SettlementReasonSchema, SettlementStartSchema, SettlementUpdateSchema,
  type SessionUser, type SettlementPay, type SettlementQuery, type SettlementStart, type SettlementUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { FinalSettlementsService } from '../application/final-settlements.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/payroll/final-settlements: Workforce › Payroll › Final settlements (Phase 33). */
@Controller('payroll/final-settlements')
export class FinalSettlementsController {
  constructor(private readonly settlements: FinalSettlementsService) {}

  @Get()
  @RequirePermission('fs:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(SettlementQuerySchema)) q: SettlementQuery) {
    return this.settlements.list(user, q);
  }

  /** The settlement of an exit (offboarding drawer: "Start settlement" or "Open settlement"). */
  @Get('of-offboarding/:offboardingId')
  @RequirePermission('fs:view')
  async ofOffboarding(@CurrentUser() user: SessionUser, @Param('offboardingId', uuid) offboardingId: string) {
    return { settlement: await this.settlements.ofOffboarding(user, offboardingId) };
  }

  @Get(':id')
  @RequirePermission('fs:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.settlements.get(user, id);
  }

  @Get(':id/options')
  @RequirePermission('fs:view')
  options(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.settlements.options(user, id);
  }

  /** From an exit: 409 FINAL_SETTLEMENT_EXISTS when it already has one. Created and calculated together. */
  @Post()
  @RequirePermission('fs:create')
  start(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(SettlementStartSchema)) body: SettlementStart) {
    return this.settlements.start(user, meta, body.offboardingId);
  }

  @Post(':id/calculate')
  @HttpCode(200)
  @RequirePermission('fs:edit')
  calculate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.settlements.calculate(user, meta, id);
  }

  @Patch(':id')
  @RequirePermission('fs:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SettlementUpdateSchema)) body: SettlementUpdate) {
    return this.settlements.update(user, meta, id, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('fs:edit')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.settlements.submit(user, meta, id);
  }

  /** Approve posts the JV. 403 FINAL_SETTLEMENT_PREPARER for the preparer. Workflow approvers act without fs:approve. */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('fs:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SettlementCommentSchema)) body: { comment: string | null }) {
    return this.settlements.approve(user, meta, id, body.comment);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('fs:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SettlementReasonSchema)) body: { reason: string }) {
    return this.settlements.reject(user, meta, id, body.reason);
  }

  @Post(':id/send-back')
  @HttpCode(200)
  @RequirePermission('fs:view')
  sendBack(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SettlementReasonSchema)) body: { reason: string }) {
    return this.settlements.sendBack(user, meta, id, body.reason);
  }

  /** Bank payment voucher Dr salaries payable / Cr bank. */
  @Post(':id/pay')
  @HttpCode(200)
  @RequirePermission('fs:post')
  pay(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SettlementPaySchema)) body: SettlementPay) {
    return this.settlements.pay(user, meta, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('fs:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SettlementReasonSchema)) body: { reason: string }) {
    return this.settlements.cancel(user, meta, id, body.reason);
  }
}
