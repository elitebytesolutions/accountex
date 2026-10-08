import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  IncidentDeclareSchema, IncidentListQuerySchema, IncidentPostmortemSchema, IncidentPostUpdateSchema,
  type AdminSession, type IncidentDeclare, type IncidentListQuery, type IncidentPostmortem, type IncidentPostUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { IncidentsService } from '../application/incidents.service.js';

/** /api/admin/incidents: Status & Incidents › incidents (Phase 43). */
@AdminRoute()
@Controller('admin/incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  /** ?days=90 (default): incidents started in that window plus every open one, newest first, with their updates. */
  @Get()
  list(@Query(new ZodValidationPipe(IncidentListQuerySchema)) q: IncidentListQuery) {
    return this.incidents.list(q.days);
  }

  /** The status page as tenants see it (90-day component bars, uptime, open incidents). */
  @Get('status')
  status() {
    return this.incidents.statusPage();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.incidents.get(id);
  }

  /** "Declare incident": INC-YYYY-NNN with its first update. */
  @Post()
  declare(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(IncidentDeclareSchema)) body: IncidentDeclare) {
    return this.incidents.declare(admin, meta, body);
  }

  /** "Post update": stage forward only; RESOLVED stamps resolvedAt. 409 INCIDENT_RESOLVED / INCIDENT_STAGE_ORDER. */
  @Post(':id/updates')
  @HttpCode(200)
  postUpdate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(IncidentPostUpdateSchema)) body: IncidentPostUpdate) {
    return this.incidents.postUpdate(admin, meta, id, body);
  }

  @Post(':id/postmortem')
  @HttpCode(200)
  postmortem(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(IncidentPostmortemSchema)) body: IncidentPostmortem) {
    return this.incidents.postmortem(admin, meta, id, body);
  }
}
