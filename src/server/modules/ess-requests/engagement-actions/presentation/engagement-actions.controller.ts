import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import type { SessionUser } from '../../../../../shared/index.js';
import {
  AnnouncementReadSchema, ColleagueQuerySchema, DirectoryQuerySchema, KudosCreateSchema, KudosReactSchema, PollVoteSchema, PresenceSchema, PulseRespondSchema,
  type KudosCreate, type KudosReaction, type PresenceInput, type PulseRespond,
} from '../../../../../shared/self-service/engagement-actions.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { EngagementActionsService } from '../application/engagement-actions.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/me/kudos, /api/me/polls, /api/me/pulse-surveys, /api/me/presence, /api/me/directory: My Profile › Kudos & Pulse and Directory. */
@Controller('me')
export class MyEngagementActionsController {
  constructor(private readonly engagement: EngagementActionsService) {}

  @Get('kudos')
  @RequirePermission('mykudos:view')
  kudos(@CurrentUser() user: SessionUser) {
    return this.engagement.kudos(user);
  }

  @Get('kudos/colleagues')
  @RequirePermission('mykudos:view')
  colleagues(@CurrentUser() user: SessionUser, @Query(pipe(ColleagueQuerySchema)) q: { search?: string }) {
    return this.engagement.colleagues(user, q.search);
  }

  @Post('kudos')
  @RequirePermission('mykudos:create')
  give(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(KudosCreateSchema)) body: KudosCreate) {
    return this.engagement.giveKudos(user, meta, body);
  }

  @Post('kudos/:id/react')
  @HttpCode(200)
  @RequirePermission('mykudos:create')
  react(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(KudosReactSchema)) body: { reaction: KudosReaction }) {
    return this.engagement.react(user, meta, id, body.reaction);
  }

  @Get('engagement-state')
  @RequirePermission('mykudos:view')
  state(@CurrentUser() user: SessionUser) {
    return this.engagement.state(user);
  }

  @Post('polls/:id/vote')
  @HttpCode(200)
  @RequirePermission('mykudos:create')
  vote(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PollVoteSchema)) body: { optionId: string }) {
    return this.engagement.vote(user, meta, id, body.optionId);
  }

  @Post('pulse-surveys/:id/respond')
  @HttpCode(200)
  @RequirePermission('mykudos:create')
  respond(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PulseRespondSchema)) body: PulseRespond) {
    return this.engagement.respond(user, meta, id, body);
  }

  @Get('announcement-reads')
  @RequirePermission('dir:view')
  reads(@CurrentUser() user: SessionUser) {
    return this.engagement.reads(user);
  }

  @Put('presence')
  @RequirePermission('dir:view')
  presence(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PresenceSchema)) body: PresenceInput) {
    return this.engagement.setPresence(user, meta, body);
  }

  @Get('directory')
  @RequirePermission('dir:view')
  directory(@CurrentUser() user: SessionUser, @Query(pipe(DirectoryQuerySchema)) q: { search?: string; departmentId?: string }) {
    return this.engagement.directory(user, q);
  }
}

/** POST /api/company/announcements/:id/read: an employee's read receipt and RSVP (dir:view). */
@Controller('company/announcements')
export class AnnouncementReadsController {
  constructor(private readonly engagement: EngagementActionsService) {}

  @Post(':id/read')
  @HttpCode(200)
  @RequirePermission('dir:view')
  read(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AnnouncementReadSchema)) body: { rsvp?: string | null }) {
    return this.engagement.markRead(user, meta, id, body.rsvp);
  }
}
