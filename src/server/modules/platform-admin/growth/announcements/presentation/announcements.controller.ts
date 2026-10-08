import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  PlatformAnnouncementActionSchema, PlatformAnnouncementCreateSchema, PlatformAnnouncementListQuerySchema, PlatformAnnouncementScheduleSchema,
  PlatformAnnouncementTargetsSchema, PlatformAnnouncementUpdateSchema,
  type AdminSession, type PlatformAnnouncementAction, type PlatformAnnouncementCreate, type PlatformAnnouncementSchedule,
  type PlatformAnnouncementTargetsInput, type PlatformAnnouncementUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { AnnouncementsService } from '../application/announcements.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const action = pipe(z.enum(['publish', 'archive']));

/** /api/admin/announcements: Operations › Support › Announcements (Phase 42). 409 ANNOUNCEMENT_NOT_DRAFT on published content. */
@AdminRoute()
@Controller('admin/announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Query(pipe(PlatformAnnouncementListQuerySchema)) q: { status?: string; type?: string }) {
    return this.announcements.list(admin, meta, q);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.announcements.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(PlatformAnnouncementCreateSchema)) body: PlatformAnnouncementCreate) {
    return this.announcements.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PlatformAnnouncementUpdateSchema)) body: PlatformAnnouncementUpdate) {
    return this.announcements.update(admin, meta, id, body);
  }

  @Put(':id/targets')
  targets(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PlatformAnnouncementTargetsSchema)) body: PlatformAnnouncementTargetsInput) {
    return this.announcements.setTargets(admin, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    await this.announcements.remove(admin, meta, id);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  schedule(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PlatformAnnouncementScheduleSchema)) body: PlatformAnnouncementSchedule) {
    return this.announcements.schedule(admin, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  act(
    @CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string,
    @Param('action', action) act: PlatformAnnouncementAction, @Body(pipe(PlatformAnnouncementActionSchema)) body: { rowVersion: number },
  ) {
    return this.announcements.act(admin, meta, id, act, body.rowVersion);
  }
}
