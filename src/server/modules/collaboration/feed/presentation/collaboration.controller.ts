import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CommentInputSchema, FeedQuerySchema, PostInputSchema, ReactionInputSchema, TagsInputSchema, type CommentInput, type FeedQuery, type PostInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ValidationError } from '../../../../core/domain/errors.js';
import { CollaborationService } from '../application/collaboration.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const RECORD_TYPE = /^[A-Z]{2,6}$/;
/** multer's in-memory file (no @types/multer in the project). */
type MulterFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const MAX = 10 * 1024 * 1024;
const upload = FileInterceptor('file', { limits: { fileSize: MAX + 1, files: 1 } });
const optionalUuid = z.uuid().optional().nullable().transform((v) => v ?? null);

/** /api/collaboration: Workspace › Activity (every company user; no permission resource — own data). */
@Controller('collaboration')
export class CollaborationController {
  constructor(private readonly collab: CollaborationService) {}

  @Get('feed')
  feed(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Query(pipe(FeedQuerySchema)) q: FeedQuery) {
    return this.collab.feed(user, meta, q);
  }

  @Get('people')
  people(@CurrentUser() user: SessionUser) {
    return this.collab.people(user);
  }

  @Post('posts')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PostInputSchema)) body: PostInput) {
    return this.collab.post(user, meta, body);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  async deletePost(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    await this.collab.deletePost(user, meta, id);
  }

  @Post('comments')
  comment(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(CommentInputSchema)) body: CommentInput) {
    return this.collab.comment(user, meta, body);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  async deleteComment(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    await this.collab.deleteComment(user, meta, id);
  }

  /** Toggles the reaction ({ added }). */
  @Post('reactions')
  @HttpCode(200)
  react(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ReactionInputSchema)) body: { emoji: string; activityEventId: string | null; commentId: string | null }) {
    return this.collab.react(user, meta, body);
  }

  /** multipart: file + activityEventId or commentId. */
  @Post('attachments')
  @UseInterceptors(upload)
  attach(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @UploadedFile() file: MulterFile | undefined, @Body() body: { activityEventId?: string; commentId?: string }) {
    if (!file) throw new ValidationError('Choose a file to upload', { file: ['Required'] });
    const target = z.object({ activityEventId: optionalUuid, commentId: optionalUuid }).parse({ activityEventId: body.activityEventId || null, commentId: body.commentId || null });
    return this.collab.attach(user, meta, { originalName: file.originalname, mimeType: file.mimetype, size: file.size, buffer: file.buffer }, target);
  }

  @Get('tags')
  allTags(@CurrentUser() user: SessionUser) {
    return this.collab.allTags(user);
  }

  @Get('tags/:recordType/:recordId')
  tags(@CurrentUser() user: SessionUser, @Param('recordType') recordType: string, @Param('recordId', uuid) recordId: string) {
    if (!RECORD_TYPE.test(recordType)) throw new ValidationError('Unknown record type', { recordType: ['Like INV'] });
    return this.collab.tags(user, recordType, recordId);
  }

  @Put('tags/:recordType/:recordId')
  setTags(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('recordType') recordType: string, @Param('recordId', uuid) recordId: string, @Body(pipe(TagsInputSchema)) body: { tags: string[] }) {
    if (!RECORD_TYPE.test(recordType)) throw new ValidationError('Unknown record type', { recordType: ['Like INV'] });
    return this.collab.setTags(user, meta, recordType, recordId, body.tags);
  }
}
