import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  DebitNoteApplySchema, DebitNoteInputSchema, DebitNoteRefundSchema, DebitNoteUpdateSchema, PurchaseQuerySchema, PurchaseReasonSchema, RowVersionSchema,
  type DebitNoteInput, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { DebitNotesService } from '../application/debit-notes.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/purchases/debit-notes: Purchases › Debit Notes. */
@Controller('purchases/debit-notes')
export class DebitNotesController {
  constructor(private readonly notes: DebitNotesService) {}

  @Get()
  @RequirePermission('bill:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(PurchaseQuerySchema)) q: z.infer<typeof PurchaseQuerySchema>) {
    return this.notes.list(user, q);
  }

  @Get(':id')
  @RequirePermission('bill:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.notes.get(user, id);
  }

  @Post()
  @RequirePermission('bill:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(DebitNoteInputSchema)) body: DebitNoteInput) {
    return this.notes.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('bill:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DebitNoteUpdateSchema)) body: DebitNoteInput & { rowVersion: number }) {
    return this.notes.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('bill:create')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.notes.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('bill:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.notes.post(user, meta, id, body.rowVersion);
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermission('bill:post')
  void(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PurchaseReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.notes.void(user, meta, id, body.rowVersion, body.reason);
  }

  @Post(':id/refund')
  @HttpCode(200)
  @RequirePermission('bill:post')
  refund(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DebitNoteRefundSchema)) body: z.infer<typeof DebitNoteRefundSchema>) {
    return this.notes.refund(user, meta, id, body);
  }

  @Post(':id/apply')
  @HttpCode(200)
  @RequirePermission('bill:post')
  apply(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DebitNoteApplySchema)) body: z.infer<typeof DebitNoteApplySchema>) {
    return this.notes.apply(user, meta, id, body);
  }
}
