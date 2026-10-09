import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  LetterRequestCreateSchema, LetterRequestIssueSchema, LetterRequestQuerySchema, LetterRequestRejectSchema, LetterRequestUpdateSchema,
  type LetterRequestCreate, type LetterRequestIssue, type LetterRequestQuery, type LetterRequestReject, type LetterRequestUpdate,
} from '../../../../../shared/self-service/letter-request.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { LetterRequestsService } from '../application/letter-requests.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/me/letter-requests: My Profile › Letters & Requests (own requests only). */
@Controller('me/letter-requests')
export class MyLetterRequestsController {
  constructor(private readonly requests: LetterRequestsService) {}

  @Get()
  @RequirePermission('myreq:view')
  list(@CurrentUser() user: SessionUser) {
    return this.requests.myList(user);
  }

  @Get(':id')
  @RequirePermission('myreq:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.requests.myGet(user, id);
  }

  @Post()
  @RequirePermission('myreq:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(LetterRequestCreateSchema)) body: LetterRequestCreate) {
    return this.requests.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('myreq:create')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LetterRequestUpdateSchema)) body: LetterRequestUpdate) {
    return this.requests.update(user, meta, id, body);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @RequirePermission('myreq:create')
  withdraw(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.requests.withdraw(user, meta, id, body.rowVersion);
  }
}

/** /api/hr/letter-requests: HR's queue of letter requests — review, issue (Phase 33 letter) or reject. */
@Controller('hr/letter-requests')
export class LetterRequestsController {
  constructor(private readonly requests: LetterRequestsService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(LetterRequestQuerySchema)) q: LetterRequestQuery) {
    return this.requests.list(user, q);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.requests.get(user, id);
  }

  @Post(':id/review')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  review(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.requests.review(user, meta, id, body.rowVersion);
  }

  @Post(':id/issue')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  issue(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LetterRequestIssueSchema)) body: LetterRequestIssue) {
    return this.requests.issue(user, meta, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LetterRequestRejectSchema)) body: LetterRequestReject) {
    return this.requests.reject(user, meta, id, body);
  }
}
