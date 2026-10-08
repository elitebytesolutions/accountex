import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  AlertRuleVersionSchema,
  AuditAlertRuleCreateSchema,
  AuditAlertRuleUpdateSchema,
  PlatformAuditLogQuerySchema,
  UsageAlertRuleCreateSchema,
  UsageAlertRuleUpdateSchema,
  type AdminSession,
  type AlertRuleVersion,
  type AuditAlertRuleCreate,
  type AuditAlertRuleUpdate,
  type PlatformAuditLogQuery,
  type UsageAlertRuleCreate,
  type UsageAlertRuleUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { AuditAlertRulesService, UsageAlertRulesService } from '../application/alert-rules.service.js';

const version = new ZodValidationPipe(AlertRuleVersionSchema);

/** /api/admin/usage-alert-rules: Usage & Quotas › Alert rules. */
@AdminRoute()
@Controller('admin/usage-alert-rules')
export class UsageAlertRulesController {
  constructor(private readonly rules: UsageAlertRulesService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  /** Meters (Phase 40 seeds them), plans and add-ons for the rule modal. */
  @Get('options')
  options() {
    return this.rules.options();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rules.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(UsageAlertRuleCreateSchema)) body: UsageAlertRuleCreate) {
    return this.rules.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(UsageAlertRuleUpdateSchema)) body: UsageAlertRuleUpdate) {
    return this.rules.update(admin, meta, id, body);
  }

  @Post(':id/enable')
  enable(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(version) body: AlertRuleVersion) {
    return this.rules.setEnabled(admin, meta, id, true, body);
  }

  @Post(':id/disable')
  disable(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(version) body: AlertRuleVersion) {
    return this.rules.setEnabled(admin, meta, id, false, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.rules.delete(admin, meta, id);
  }
}

/** /api/admin/audit-alert-rules: Platform Audit Log › Alert rules. */
@AdminRoute()
@Controller('admin/audit-alert-rules')
export class AuditAlertRulesController {
  constructor(private readonly rules: AuditAlertRulesService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rules.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(AuditAlertRuleCreateSchema)) body: AuditAlertRuleCreate) {
    return this.rules.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(AuditAlertRuleUpdateSchema)) body: AuditAlertRuleUpdate) {
    return this.rules.update(admin, meta, id, body);
  }

  @Post(':id/activate')
  activate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(version) body: AlertRuleVersion) {
    return this.rules.setActive(admin, meta, id, true, body);
  }

  @Post(':id/deactivate')
  deactivate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(version) body: AlertRuleVersion) {
    return this.rules.setActive(admin, meta, id, false, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.rules.delete(admin, meta, id);
  }
}

/** /api/admin/audit-log: the platform audit log table (read-only history, Platform.PlatformAuditLogs). */
@AdminRoute()
@Controller('admin/audit-log')
export class PlatformAuditLogController {
  constructor(private readonly rules: AuditAlertRulesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(PlatformAuditLogQuerySchema)) q: PlatformAuditLogQuery) {
    return this.rules.auditLog(q);
  }
}
