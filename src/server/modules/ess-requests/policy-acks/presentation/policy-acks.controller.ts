import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { SessionUser } from '../../../../../shared/index.js';
import { PolicyAcknowledgeSchema, type PolicyAcknowledge } from '../../../../../shared/self-service/policy-ack.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PolicyAcksService } from '../application/policy-acks.service.js';

const uuid = new ParseUUIDPipe();

/** /api/me/policies and /api/me/team/policy-status: My Profile › Onboarding & Policies, and My Team. */
@Controller('me')
export class MyPoliciesController {
  constructor(private readonly acks: PolicyAcksService) {}

  @Get('policies')
  @RequirePermission('myonb:view')
  mine(@CurrentUser() user: SessionUser) {
    return this.acks.mine(user);
  }

  /** 201 when signed now, 200 when this version was already acknowledged. */
  @Post('policies/:id/acknowledge')
  @RequirePermission('myonb:edit')
  async acknowledge(
    @CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(PolicyAcknowledgeSchema)) body: PolicyAcknowledge, @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.acks.acknowledge(user, meta, id, body);
    res.status(r.created ? 201 : 200);
    return r.acknowledgement;
  }

  @Get('team/policy-status')
  @RequirePermission('myteam:view')
  team(@CurrentUser() user: SessionUser) {
    return this.acks.team(user);
  }
}

/** /api/hr/policies/:id/acknowledgements: Workforce › Talent › Policies (who signed a version, who hasn't). */
@Controller('hr/policies')
export class PolicyAcknowledgementsController {
  constructor(private readonly acks: PolicyAcksService) {}

  @Get(':id/acknowledgements')
  @RequirePermission('emp:view')
  report(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.acks.report(user, id);
  }
}
