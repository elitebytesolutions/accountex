import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ManualAttendanceSchema, MonthSchema, ProcessSchema, PunchSchema, RegisterQuerySchema, TodayQuerySchema, WaiveSchema,
  type ManualAttendanceInput, type PunchInput, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { AttendanceService } from '../application/attendance.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/attendance: HR › Time & Attendance (today, monthly register, manual marking, processing, payroll lock). */
@Controller('hr/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('options')
  @RequirePermission('att:view')
  options(@CurrentUser() user: SessionUser) {
    return this.attendance.options(user);
  }

  @Get('today')
  @RequirePermission('att:view')
  today(@CurrentUser() user: SessionUser, @Query(pipe(TodayQuerySchema)) q: z.infer<typeof TodayQuerySchema>) {
    return this.attendance.today(user, q);
  }

  @Get('register')
  @RequirePermission('att:view')
  register(@CurrentUser() user: SessionUser, @Query(pipe(RegisterQuerySchema)) q: z.infer<typeof RegisterQuerySchema>) {
    return this.attendance.register(user, q);
  }

  @Get('days/:id')
  @RequirePermission('att:view')
  day(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.attendance.day(user, id);
  }

  @Post('days/:id/waive-late')
  @HttpCode(200)
  @RequirePermission('att:edit')
  waive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(WaiveSchema)) body: z.infer<typeof WaiveSchema>) {
    return this.attendance.waive(user, meta, id, body.rowVersion, body.reason);
  }

  @Post('manual')
  @HttpCode(200)
  @RequirePermission('att:create')
  manual(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ManualAttendanceSchema)) body: ManualAttendanceInput) {
    return this.attendance.manual(user, meta, body);
  }

  @Post('process')
  @HttpCode(200)
  @RequirePermission('att:edit')
  process(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Query(pipe(ProcessSchema)) q: z.infer<typeof ProcessSchema>) {
    return this.attendance.process(user, meta, q);
  }

  @Post('register/lock')
  @HttpCode(200)
  @RequirePermission('att:approve')
  lock(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Query(pipe(MonthSchema)) q: { month: string }) {
    return this.attendance.lock(user, meta, q.month);
  }

  @Post('register/unlock')
  @HttpCode(200)
  @RequirePermission('att:approve')
  unlock(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Query(pipe(MonthSchema)) q: { month: string }) {
    return this.attendance.unlock(user, meta, q.month);
  }
}

/** /api/me/attendance: My Profile › Attendance and the My Day punch card (own attendance only). */
@Controller('me/attendance')
export class MyAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @RequirePermission('myatt:view')
  mine(@CurrentUser() user: SessionUser, @Query(pipe(MonthSchema.partial())) q: { month?: string }) {
    return this.attendance.my(user, q.month);
  }

  @Post('punch')
  @HttpCode(200)
  @RequirePermission('myatt:create')
  punch(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PunchSchema)) body: PunchInput) {
    return this.attendance.punch(user, meta, body);
  }
}
