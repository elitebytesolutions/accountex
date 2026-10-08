import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ClearanceDecisionSchema, ExitInterviewSchema, OffboardingCreateSchema, OffboardingQuerySchema, OffboardingUpdateSchema, OffboardingWithdrawSchema, RowVersionSchema,
  type ExitInterviewInput, type OffboardingCreate, type OffboardingUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OffboardingsService } from '../application/offboardings.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/offboardings: Workforce › Talent › Offboarding & Exits. */
@Controller('hr/offboardings')
export class OffboardingsController {
  constructor(private readonly offboardings: OffboardingsService) {}

  @Get()
  @RequirePermission('emp:view')
  board(@CurrentUser() user: SessionUser, @Query(pipe(OffboardingQuerySchema)) q: { status: string }) {
    return this.offboardings.board(user, q.status);
  }

  @Get('options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.offboardings.options(user);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.offboardings.get(user, id);
  }

  @Post()
  @RequirePermission('emp:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(OffboardingCreateSchema)) body: OffboardingCreate) {
    return this.offboardings.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OffboardingUpdateSchema)) body: OffboardingUpdate) {
    return this.offboardings.update(user, meta, id, body);
  }

  @Post(':id/clearance/:itemId/:action')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  clear(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('itemId', uuid) itemId: string,
    @Param('action', pipe(z.enum(['clear', 'waive']))) action: 'clear' | 'waive', @Body(pipe(ClearanceDecisionSchema)) body: { remarks: string | null }) {
    return this.offboardings.clear(user, meta, id, itemId, action === 'clear' ? 'CLEARED' : 'WAIVED', body.remarks);
  }

  @Put(':id/exit-interview')
  @RequirePermission('emp:edit')
  interview(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ExitInterviewSchema)) body: ExitInterviewInput) {
    return this.offboardings.saveInterview(user, meta, id, body);
  }

  /** Every clearance item cleared or waived → employee EXITED, login suspended (409 for the company's default user). */
  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  complete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.offboardings.complete(user, meta, id, body.rowVersion);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  withdraw(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OffboardingWithdrawSchema)) body: { reason: string | null; rowVersion: number }) {
    return this.offboardings.withdraw(user, meta, id, body.reason, body.rowVersion);
  }
}
