import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  FBR_AUTHORITIES, FbrAuthorityBodySchema, FbrBacklogSkipSchema, FbrSubmissionQuerySchema, type FbrAuthority, type FbrSubmissionQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { FbrSubmissionsService } from '../application/fbr-submissions.service.js';

const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const uuid = new ParseUUIDPipe();
const AuthorityQuery = z.object({ authority: z.enum(FBR_AUTHORITIES).default('FBR') });

/**
 * /api/tax/fbr/*: FBR submissions (Phase 28) next to the settings (Phase 5, GET /tax/fbr and PUT /tax/fbr/:authority).
 * Sending is off until the company switches it on; Sync / Test / Retry answer FBR_NOT_CONNECTED until then.
 */
@Controller('tax/fbr')
export class FbrSubmissionsController {
  constructor(private readonly fbr: FbrSubmissionsService) {}

  @Get('submissions')
  @RequirePermission('tax:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(FbrSubmissionQuerySchema)) q: FbrSubmissionQuery) {
    return this.fbr.list(user, q);
  }

  @Get('submissions/:id')
  @RequirePermission('tax:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.fbr.get(user, id);
  }

  @Post('submissions/:id/retry')
  @HttpCode(200)
  @RequirePermission('tax:edit')
  retry(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.fbr.retry(user, meta, id);
  }

  @Post('submissions/:id/requeue')
  @HttpCode(200)
  @RequirePermission('tax:edit')
  requeue(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.fbr.requeue(user, meta, id);
  }

  /** Sending state: off / live / simulator, connection, and what is waiting (backlog). */
  @Get('state')
  @RequirePermission('tax:view')
  state(@CurrentUser() user: SessionUser, @Query(pipe(AuthorityQuery)) q: { authority: FbrAuthority }) {
    return this.fbr.state(user, q.authority);
  }

  @Get('connection-events')
  @RequirePermission('tax:view')
  events(@CurrentUser() user: SessionUser, @Query(pipe(AuthorityQuery)) q: { authority: FbrAuthority }) {
    return this.fbr.events(user, q.authority);
  }

  @Post('test-connection')
  @HttpCode(200)
  @RequirePermission('tax:edit')
  test(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(FbrAuthorityBodySchema)) body: { authority: FbrAuthority }) {
    return this.fbr.test(user, meta, body.authority);
  }

  /** Sync now: the due submissions. */
  @Post('sync')
  @HttpCode(200)
  @RequirePermission('tax:edit')
  sync(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(FbrAuthorityBodySchema)) body: { authority: FbrAuthority }) {
    return this.fbr.sync(user, meta, body.authority, false);
  }

  /** Going live: send every waiting submission. */
  @Post('backlog/send')
  @HttpCode(200)
  @RequirePermission('tax:edit')
  sendBacklog(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(FbrAuthorityBodySchema)) body: { authority: FbrAuthority }) {
    return this.fbr.sync(user, meta, body.authority, true);
  }

  /** Going live: mark documents dated in a range as "not reported". */
  @Post('backlog/skip')
  @HttpCode(200)
  @RequirePermission('tax:edit')
  skip(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(FbrBacklogSkipSchema)) body: { authority: FbrAuthority; from: string; to: string }) {
    return this.fbr.skip(user, meta, body.authority, body.from, body.to);
  }
}
