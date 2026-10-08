import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  DecisionSchema, OvertimeClaimSchema, OvertimeClaimUpdateSchema, OvertimeQuerySchema, OvertimeRejectSchema,
  type OvertimeClaimInput, type OvertimeClaimUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OvertimeClaimsService } from '../application/overtime-claims.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const RateQuery = z.object({ employeeId: z.uuid(), date: z.iso.date() });
const CancelSchema = z.object({ rowVersion: z.coerce.number().int().min(0), reason: z.string().trim().max(300).optional().transform((x) => x || null) });

/** /api/hr/overtime-claims: HR › Time & Attendance › Overtime (claims; the policy is /hr/overtime-policies). */
@Controller('hr/overtime-claims')
export class OvertimeClaimsController {
  constructor(private readonly claims: OvertimeClaimsService) {}

  @Get()
  @RequirePermission('att:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(OvertimeQuerySchema)) q: z.infer<typeof OvertimeQuerySchema>) {
    return this.claims.list(user, q);
  }

  @Get('rate')
  @RequirePermission('att:view')
  rate(@CurrentUser() user: SessionUser, @Query(pipe(RateQuery)) q: z.infer<typeof RateQuery>) {
    return this.claims.rate(user, q.employeeId, q.date);
  }

  @Get(':id')
  @RequirePermission('att:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.claims.get(user, id);
  }

  @Post()
  @RequirePermission('att:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(OvertimeClaimSchema)) body: OvertimeClaimInput) {
    return this.claims.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('att:create')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OvertimeClaimUpdateSchema)) body: OvertimeClaimUpdate) {
    return this.claims.update(user, meta, id, body);
  }

  /** Eligibility is the approval engine's (the claim's current step); no workflow: att:approve. */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('att:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DecisionSchema)) body: { comment: string | null }) {
    return this.claims.approve(user, meta, id, body.comment);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('att:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OvertimeRejectSchema)) body: { reason: string }) {
    return this.claims.reject(user, meta, id, body.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('att:create')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CancelSchema)) body: z.infer<typeof CancelSchema>) {
    return this.claims.cancel(user, meta, id, body.rowVersion, body.reason);
  }
}
