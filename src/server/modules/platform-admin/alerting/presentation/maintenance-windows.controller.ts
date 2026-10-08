import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  AlertRuleVersionSchema,
  MaintenanceWindowCreateSchema,
  MaintenanceWindowListQuerySchema,
  MaintenanceWindowUpdateSchema,
  type AdminSession,
  type AlertRuleVersion,
  type MaintenanceWindowCreate,
  type MaintenanceWindowListQuery,
  type MaintenanceWindowUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { MaintenanceWindowsService } from '../application/maintenance-windows.service.js';

/** /api/admin/maintenance-windows: Status & Incidents › Schedule maintenance / Upcoming windows. */
@AdminRoute()
@Controller('admin/maintenance-windows')
export class MaintenanceWindowsController {
  constructor(private readonly windows: MaintenanceWindowsService) {}

  /** ?scope=upcoming (default) | all */
  @Get()
  list(@Query(new ZodValidationPipe(MaintenanceWindowListQuerySchema)) q: MaintenanceWindowListQuery) {
    return this.windows.list(q.scope === 'upcoming');
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.windows.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(MaintenanceWindowCreateSchema)) body: MaintenanceWindowCreate) {
    return this.windows.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(MaintenanceWindowUpdateSchema)) body: MaintenanceWindowUpdate) {
    return this.windows.update(admin, meta, id, body);
  }

  @Post(':id/cancel')
  cancel(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(AlertRuleVersionSchema)) body: AlertRuleVersion) {
    return this.windows.cancel(admin, meta, id, body);
  }
}
