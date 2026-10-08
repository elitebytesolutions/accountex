import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  LeaveAccrueQuerySchema, LeaveAdjustmentQuerySchema, LeaveAdjustmentSchema, LeaveBalanceQuerySchema, LeaveYearEndCloseSchema, LeaveYearEndReverseSchema,
  LeaveYearQuerySchema, type LeaveAdjustmentInput, type LeaveBalanceQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { LeaveBalancesService } from '../application/leave-balances.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const yearParam = pipe(z.string().regex(/^\d{4}-\d{2}-01$/, 'Use the leave year start (YYYY-MM-01)'));

/** /api/hr/leave-balances: HR › Leave › Balances and the accrual run. */
@Controller('hr/leave-balances')
export class LeaveBalancesController {
  constructor(private readonly balances: LeaveBalancesService) {}

  @Get()
  @RequirePermission('lv:view')
  view(@CurrentUser() user: SessionUser, @Query(pipe(LeaveBalanceQuerySchema)) q: LeaveBalanceQuery) {
    return this.balances.view(user, q);
  }

  /** Accrual for a month (?month=YYYY-MM), idempotent per employee, type and month. */
  @Post('accrue')
  @HttpCode(200)
  @RequirePermission('lv:edit')
  accrue(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Query(pipe(LeaveAccrueQuerySchema)) q: { month: string; employeeId?: string }) {
    return this.balances.accrue(user, meta, q.month, q.employeeId);
  }
}

/** /api/hr/leave-adjustments: the append-only adjustments trail (manual, opening, comp-off). */
@Controller('hr/leave-adjustments')
export class LeaveAdjustmentsController {
  constructor(private readonly balances: LeaveBalancesService) {}

  @Get()
  @RequirePermission('lv:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(LeaveAdjustmentQuerySchema)) q: z.infer<typeof LeaveAdjustmentQuerySchema>) {
    return this.balances.adjustments(user, q);
  }

  @Get('comp-off-claims/:employeeId')
  @RequirePermission('lv:view')
  compOff(@CurrentUser() user: SessionUser, @Param('employeeId', uuid) employeeId: string) {
    return this.balances.compOffClaims(user, employeeId);
  }

  @Post()
  @RequirePermission('lv:edit')
  add(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(LeaveAdjustmentSchema)) body: LeaveAdjustmentInput) {
    return this.balances.addAdjustment(user, meta, body);
  }
}

/** /api/hr/leave-year-end: preview, close and reverse a leave year. */
@Controller('hr/leave-year-end')
export class LeaveYearEndController {
  constructor(private readonly balances: LeaveBalancesService) {}

  @Get()
  @RequirePermission('lv:view')
  view(@CurrentUser() user: SessionUser, @Query(pipe(LeaveYearQuerySchema)) q: { year?: string }) {
    return this.balances.yearEnd(user, q.year);
  }

  @Post(':year/close')
  @HttpCode(200)
  @RequirePermission('lv:approve')
  close(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('year', yearParam) year: string, @Body(pipe(LeaveYearEndCloseSchema)) body: z.infer<typeof LeaveYearEndCloseSchema>) {
    return this.balances.close(user, meta, year, body);
  }

  @Post(':id/reverse')
  @HttpCode(200)
  @RequirePermission('lv:approve')
  reverse(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeaveYearEndReverseSchema)) body: { reason: string; rowVersion: number }) {
    return this.balances.reverse(user, meta, id, body.reason, body.rowVersion);
  }
}
