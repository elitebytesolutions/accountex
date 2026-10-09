import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BounceSchema, ChequeActionSchema, ChequeBatchSchema, ChequeBatchUpdateSchema, ChequeQuerySchema, ChequeSchema, ChequeUpdateSchema, ReplaceSchema, RowVersionSchema,
  type BounceInput, type ChequeAction, type ChequeBatchInput, type ChequeInput, type ChequeQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ChequeBatchesService } from '../application/cheque-batches.service.js';
import { ChequesService } from '../application/cheques.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const action = pipe(ChequeActionSchema);
const version = pipe(RowVersionSchema);

/** /api/bank/cheques: Receive & Issue Cheques and the Cheque Register. */
@Controller('bank/cheques')
export class ChequesController {
  constructor(private readonly cheques: ChequesService) {}

  @Get()
  @RequirePermission('bank:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(ChequeQuerySchema)) q: ChequeQuery) {
    return this.cheques.list(user, q);
  }

  @Get(':id')
  @RequirePermission('bank:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.cheques.get(user, id);
  }

  @Post()
  @RequirePermission('bank:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ChequeSchema)) body: ChequeInput) {
    return this.cheques.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('bank:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ChequeUpdateSchema)) body: ChequeInput & { rowVersion: number }) {
    return this.cheques.update(user, meta, id, body);
  }

  @Post(':id/deposit')
  @HttpCode(200)
  @RequirePermission('bank:post')
  deposit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: ChequeAction) {
    return this.cheques.deposit(user, meta, id, body);
  }

  @Post(':id/present')
  @HttpCode(200)
  @RequirePermission('bank:post')
  present(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: ChequeAction) {
    return this.cheques.present(user, meta, id, body);
  }

  @Post(':id/clear')
  @HttpCode(200)
  @RequirePermission('bank:post')
  clear(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: ChequeAction) {
    return this.cheques.clear(user, meta, id, body);
  }

  @Post(':id/bounce')
  @HttpCode(200)
  @RequirePermission('bank:post')
  bounce(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(BounceSchema)) body: BounceInput) {
    return this.cheques.bounce(user, meta, id, body);
  }

  @Post(':id/re-present')
  @HttpCode(200)
  @RequirePermission('bank:post')
  represent(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: ChequeAction) {
    return this.cheques.represent(user, meta, id, body);
  }

  @Post(':id/stop')
  @HttpCode(200)
  @RequirePermission('bank:post')
  stop(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: ChequeAction) {
    return this.cheques.stop(user, meta, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('bank:post')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: ChequeAction) {
    return this.cheques.cancel(user, meta, id, body);
  }

  @Post(':id/replace')
  @RequirePermission('bank:post')
  replace(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReplaceSchema)) body: z.infer<typeof ReplaceSchema>) {
    return this.cheques.replace(user, meta, id, body);
  }
}

/** /api/bank/cheque-batches: Cheque Voucher (Bulk). */
@Controller('bank/cheque-batches')
export class ChequeBatchesController {
  constructor(private readonly batches: ChequeBatchesService) {}

  @Get()
  @RequirePermission('bank:view')
  list(@CurrentUser() user: SessionUser) {
    return this.batches.list(user);
  }

  @Get(':id')
  @RequirePermission('bank:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.batches.get(user, id);
  }

  @Post()
  @RequirePermission('bank:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ChequeBatchSchema)) body: ChequeBatchInput) {
    return this.batches.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('bank:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ChequeBatchUpdateSchema)) body: ChequeBatchInput & { rowVersion: number }) {
    return this.batches.update(user, meta, id, body);
  }

  @Post(':id/validate')
  @HttpCode(200)
  @RequirePermission('bank:create')
  validate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.batches.validate(user, meta, id, body.rowVersion);
  }

  @Post(':id/generate')
  @HttpCode(200)
  @RequirePermission('bank:post')
  generate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.batches.generate(user, meta, id, body.rowVersion);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('bank:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema.extend({ reason: z.string().trim().max(200).optional() }))) body: { rowVersion: number; reason?: string }) {
    return this.batches.cancel(user, meta, id, body.rowVersion, body.reason ?? null);
  }
}
