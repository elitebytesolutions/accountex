import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ReverseSchema, RowVersionSchema, VoucherListQuerySchema, VoucherSchema, type SessionUser, type VoucherInput, type VoucherListQuery } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { VouchersService } from '../application/vouchers.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const UpdateSchema = VoucherSchema.extend(RowVersionSchema.shape);
const PostSchema = RowVersionSchema.extend({ postingDate: z.iso.date().optional() });

/** /api/accounting/vouchers: Finance › Accounts › Vouchers. */
@Controller('accounting/vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get()
  @RequirePermission('vch:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(VoucherListQuerySchema)) q: VoucherListQuery) {
    return this.vouchers.list(user, q);
  }

  @Get('options')
  @RequirePermission('vch:view')
  options(@CurrentUser() user: SessionUser) {
    return this.vouchers.options(user);
  }

  @Get(':id')
  @RequirePermission('vch:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.vouchers.get(user, id);
  }

  @Post()
  @RequirePermission('vch:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(VoucherSchema)) body: VoucherInput) {
    return this.vouchers.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('vch:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(UpdateSchema)) body: VoucherInput & { rowVersion: number }) {
    return this.vouchers.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('vch:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.vouchers.delete(user, meta, id, q.rowVersion);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('vch:create')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.vouchers.submit(user, meta, id, body.rowVersion);
  }

  @Post(':id/recall')
  @HttpCode(200)
  @RequirePermission('vch:create')
  recall(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.vouchers.recall(user, meta, id, body.rowVersion);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('vch:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PostSchema)) body: z.infer<typeof PostSchema>) {
    return this.vouchers.post(user, meta, id, body.rowVersion, body.postingDate);
  }

  @Post(':id/reverse')
  @RequirePermission('vch:post')
  reverse(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReverseSchema)) body: z.infer<typeof ReverseSchema>) {
    return this.vouchers.reverse(user, meta, id, { ...body, remarks: body.remarks ?? null });
  }

  @Post(':id/duplicate')
  @RequirePermission('vch:create')
  duplicate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.vouchers.duplicate(user, meta, id);
  }

  @Post(':id/comment')
  @HttpCode(200)
  @RequirePermission('vch:view')
  comment(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(z.object({ comment: z.string().trim().min(1).max(1000) }))) body: { comment: string }) {
    return this.vouchers.comment(user, meta, id, body.comment);
  }

  @Post(':id/printed')
  @HttpCode(204)
  @RequirePermission('vch:view')
  async printed(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    await this.vouchers.printed(user, meta, id);
  }
}
