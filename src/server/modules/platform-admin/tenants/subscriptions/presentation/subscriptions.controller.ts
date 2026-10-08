import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  SubscriptionActionSchema, SubscriptionCancelSchema, SubscriptionChangePlanSchema, SubscriptionCreateSchema, SubscriptionExtendTrialSchema,
  type AdminSession, type SubscriptionAction, type SubscriptionCancel, type SubscriptionChangePlan, type SubscriptionCreate, type SubscriptionExtendTrial,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { SubscriptionsService } from '../application/subscriptions.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/subscriptions: Billing › Subscriptions (Phase 40). */
@AdminRoute()
@Controller('admin/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  list() {
    return this.subscriptions.list();
  }

  @Post('run-renewals')
  @HttpCode(200)
  runRenewals(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta) {
    return this.subscriptions.runRenewals(admin, meta);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.subscriptions.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(SubscriptionCreateSchema)) body: SubscriptionCreate) {
    return this.subscriptions.create(admin, meta, body);
  }

  @Post(':id/change-plan')
  @HttpCode(200)
  changePlan(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SubscriptionChangePlanSchema)) body: SubscriptionChangePlan) {
    return this.subscriptions.changePlan(admin, meta, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SubscriptionCancelSchema)) body: SubscriptionCancel) {
    return this.subscriptions.cancel(admin, meta, id, body);
  }

  @Post(':id/renew')
  @HttpCode(200)
  renew(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SubscriptionActionSchema)) body: SubscriptionAction) {
    return this.subscriptions.renew(admin, meta, id, body.rowVersion, body.note);
  }

  @Post(':id/extend-trial')
  @HttpCode(200)
  extendTrial(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SubscriptionExtendTrialSchema)) body: SubscriptionExtendTrial) {
    return this.subscriptions.extendTrial(admin, meta, id, body);
  }
}
