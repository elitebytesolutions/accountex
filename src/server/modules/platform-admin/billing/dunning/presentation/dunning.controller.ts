import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  DunningAttemptSchema, DunningCloseSchema, DunningEscalateSchema, DunningPromiseSchema,
  type AdminSession, type DunningAttemptInput, type DunningClose, type DunningPromise,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { BillingJob } from '../../run/application/billing-job.js';
import { DunningService } from '../application/dunning.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/dunning: Billing › Dunning & Collections, the collections queue and dunning cases (Phase 41). */
@AdminRoute()
@Controller('admin/dunning')
export class DunningController {
  constructor(
    private readonly dunning: DunningService,
    private readonly job: BillingJob,
  ) {}

  @Get('queue')
  queue() {
    return this.dunning.queue();
  }

  /** Tenant 360 dunning panel: the company's open (or latest) case and the active policy. */
  @Get('tenants/:tenantId')
  tenant(@Param('tenantId', uuid) tenantId: string) {
    return this.dunning.tenantState(tenantId);
  }

  @Get('cases/:id')
  get(@Param('id', uuid) id: string) {
    return this.dunning.get(id);
  }

  /** Opens cases for overdue invoices and advances every open case now ("Retry all due"). */
  @Post('run')
  @HttpCode(200)
  run(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta) {
    return this.job.runNow(admin, meta, 'dunning');
  }

  @Post('cases/:id/attempt')
  @HttpCode(200)
  attempt(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DunningAttemptSchema)) body: DunningAttemptInput) {
    return this.dunning.attempt(admin, meta, id, body);
  }

  @Post('cases/:id/promise')
  @HttpCode(200)
  promise(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DunningPromiseSchema)) body: DunningPromise) {
    return this.dunning.promise(admin, meta, id, body);
  }

  @Post('cases/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DunningCloseSchema)) body: DunningClose) {
    return this.dunning.resolve(admin, meta, id, body);
  }

  @Post('cases/:id/write-off')
  @HttpCode(200)
  writeOff(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DunningCloseSchema)) body: DunningClose) {
    return this.dunning.writeOff(admin, meta, id, body);
  }

  @Post('cases/:id/escalate')
  @HttpCode(200)
  escalate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DunningEscalateSchema)) body: { rowVersion: number }) {
    return this.dunning.escalate(admin, meta, id, body.rowVersion);
  }
}
