import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  DecisionSchema, OpenShiftSchema, PublishSchema, RosterSaveSchema, RowVersionSchema, SwapReasonSchema, SwapSchema, WeekQuerySchema,
  type OpenShiftInput, type RosterSave, type SessionUser, type SwapInput,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RostersService } from '../application/rosters.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const Week = z.object({ week: z.iso.date('Use a date') });
const StatusQuery = z.object({ status: z.string().trim().max(20).optional() });

/** /api/hr/rosters: HR › Shifts & Roster › weekly roster (draft, then publish). */
@Controller('hr/rosters')
export class RostersController {
  constructor(private readonly rosters: RostersService) {}

  @Get()
  @RequirePermission('att:view')
  week(@CurrentUser() user: SessionUser, @Query(pipe(WeekQuerySchema)) q: z.infer<typeof WeekQuerySchema>) {
    return this.rosters.week(user, q);
  }

  @Put()
  @RequirePermission('att:edit')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Query(pipe(Week)) q: { week: string }, @Body(pipe(RosterSaveSchema)) body: RosterSave) {
    return this.rosters.save(user, meta, q.week, body);
  }

  @Post('publish')
  @HttpCode(200)
  @RequirePermission('att:approve')
  publish(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Query(pipe(Week)) q: { week: string }, @Body(pipe(PublishSchema)) body: { department?: string }) {
    return this.rosters.publish(user, meta, q.week, body.department);
  }
}

/** /api/hr/shift-swaps: swaps for HR; decisions follow the approval engine (no workflow: att:approve). */
@Controller('hr/shift-swaps')
export class ShiftSwapsController {
  constructor(private readonly rosters: RostersService) {}

  @Get()
  @RequirePermission('att:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(StatusQuery)) q: { status?: string }) {
    return this.rosters.swapList(user, q);
  }

  @Get(':id')
  @RequirePermission('att:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.rosters.getSwap(user, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('att:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DecisionSchema)) body: { comment: string | null }) {
    return this.rosters.approveSwap(user, meta, id, body.comment);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('att:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SwapReasonSchema)) body: { reason: string }) {
    return this.rosters.rejectSwap(user, meta, id, body.reason);
  }
}

/** /api/hr/open-shifts: extra shifts HR offers with limited slots; HR confirms each pick-up. */
@Controller('hr/open-shifts')
export class OpenShiftsController {
  constructor(private readonly rosters: RostersService) {}

  @Get()
  @RequirePermission('att:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(StatusQuery)) q: { status?: string }) {
    return this.rosters.openList(user, q);
  }

  @Post()
  @RequirePermission('att:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(OpenShiftSchema)) body: OpenShiftInput) {
    return this.rosters.postOpen(user, meta, body);
  }

  @Post('claims/:claimId/:action')
  @HttpCode(200)
  @RequirePermission('att:edit')
  decide(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('claimId', uuid) claimId: string, @Param('action', pipe(z.enum(['confirm', 'decline']))) action: 'confirm' | 'decline') {
    return this.rosters.decideClaim(user, meta, claimId, action === 'confirm');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('att:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.rosters.cancelOpen(user, meta, id, body.rowVersion);
  }
}

/** /api/me/shifts, /api/me/shift-swaps, /api/me/open-shifts: My Profile › Shifts (own roster, swaps, pick-ups). */
@Controller('me')
export class MyShiftsController {
  constructor(private readonly rosters: RostersService) {}

  @Get('shifts')
  @RequirePermission('myshift:view')
  mine(@CurrentUser() user: SessionUser, @Query(pipe(Week.partial())) q: { week?: string }) {
    return this.rosters.mine(user, q.week);
  }

  @Post('shift-swaps')
  @RequirePermission('myshift:create')
  request(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(SwapSchema)) body: SwapInput) {
    return this.rosters.requestSwap(user, meta, body);
  }

  @Post('shift-swaps/:id/accept')
  @HttpCode(200)
  @RequirePermission('myshift:create')
  accept(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.rosters.answerSwap(user, meta, id, true, null);
  }

  @Post('shift-swaps/:id/decline')
  @HttpCode(200)
  @RequirePermission('myshift:create')
  decline(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SwapReasonSchema)) body: { reason: string }) {
    return this.rosters.answerSwap(user, meta, id, false, body.reason);
  }

  @Post('shift-swaps/:id/withdraw')
  @HttpCode(200)
  @RequirePermission('myshift:create')
  withdraw(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.rosters.withdrawSwap(user, meta, id, body.rowVersion);
  }

  /** A line manager decides a team swap here (the approval engine's current step decides who may). */
  @Post('shift-swaps/:id/approve')
  @HttpCode(200)
  @RequirePermission('myshift:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DecisionSchema)) body: { comment: string | null }) {
    return this.rosters.approveSwap(user, meta, id, body.comment, true);
  }

  @Post('shift-swaps/:id/reject')
  @HttpCode(200)
  @RequirePermission('myshift:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SwapReasonSchema)) body: { reason: string }) {
    return this.rosters.rejectSwap(user, meta, id, body.reason, true);
  }

  @Post('open-shifts/:id/claim')
  @HttpCode(200)
  @RequirePermission('myshift:create')
  claim(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.rosters.claimOpen(user, meta, id);
  }

  @Post('open-shifts/:id/withdraw')
  @HttpCode(200)
  @RequirePermission('myshift:create')
  withdrawClaim(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.rosters.withdrawClaim(user, meta, id);
  }
}
