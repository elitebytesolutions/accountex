import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  AnnouncementCreateSchema, AnnouncementListQuerySchema, AnnouncementPinSchema, AnnouncementPublishSchema, AnnouncementUpdateSchema,
  type AnnouncementCreate, type AnnouncementListQuery, type AnnouncementPin, type AnnouncementPublish, type AnnouncementUpdate,
} from '../../../../../shared/self-service/announcement.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { AnnouncementsService } from '../application/announcements.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/company/announcements: Workforce › Employee engagement › Announcements (HR staff, emp:*). No delete: archive instead. */
@Controller('company/announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(AnnouncementListQuerySchema)) q: AnnouncementListQuery) {
    return this.announcements.list(user, q.status);
  }

  @Get('options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.announcements.options(user);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.announcements.get(user, id);
  }

  @Post()
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(AnnouncementCreateSchema)) body: AnnouncementCreate) {
    return this.announcements.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AnnouncementUpdateSchema)) body: AnnouncementUpdate) {
    return this.announcements.update(user, meta, id, body);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  publish(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AnnouncementPublishSchema)) body: AnnouncementPublish) {
    return this.announcements.publish(user, meta, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  archive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.announcements.archive(user, meta, id, body.rowVersion);
  }

  @Post(':id/pin')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  pin(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AnnouncementPinSchema)) body: AnnouncementPin) {
    return this.announcements.pin(user, meta, id, body.isPinned, body.rowVersion);
  }
}

/** /api/me/announcements: the employee feed on My Profile › Directory (dir:view). */
@Controller('me/announcements')
export class MyAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @RequirePermission('dir:view')
  feed(@CurrentUser() user: SessionUser) {
    return this.announcements.feed(user);
  }
}
