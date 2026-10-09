import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ReconAdjustSchema, ReconCreateSchema, ReconMatchSchema, ReconUnmatchSchema, ReconUpdateSchema, RowVersionSchema, type ReconCreate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ReconciliationsService } from '../application/reconciliations.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/bank/reconciliations: Finance › Bank › Bank Reconciliation. */
@Controller('bank/reconciliations')
export class ReconciliationsController {
  constructor(private readonly recons: ReconciliationsService) {}

  @Get()
  @RequirePermission('recon:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ account: z.uuid().optional() }))) q: { account?: string }) {
    return this.recons.list(user, q.account ?? null);
  }

  @Get(':id')
  @RequirePermission('recon:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.recons.get(user, id);
  }

  @Post()
  @RequirePermission('recon:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ReconCreateSchema)) body: ReconCreate) {
    return this.recons.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('recon:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReconUpdateSchema)) body: z.infer<typeof ReconUpdateSchema>) {
    return this.recons.update(user, meta, id, body);
  }

  @Post(':id/match')
  @HttpCode(200)
  @RequirePermission('recon:edit')
  match(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReconMatchSchema)) body: z.infer<typeof ReconMatchSchema>) {
    return this.recons.match(user, meta, id, body);
  }

  @Post(':id/unmatch')
  @HttpCode(200)
  @RequirePermission('recon:edit')
  unmatch(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReconUnmatchSchema)) body: z.infer<typeof ReconUnmatchSchema>) {
    return this.recons.unmatch(user, meta, id, body);
  }

  @Post(':id/auto-match')
  @HttpCode(200)
  @RequirePermission('recon:edit')
  autoMatch(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.recons.autoMatch(user, meta, id, body.rowVersion);
  }

  @Post(':id/adjustments')
  @HttpCode(200)
  @RequirePermission('recon:edit')
  adjustments(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReconAdjustSchema)) body: z.infer<typeof ReconAdjustSchema>) {
    return this.recons.adjustments(user, meta, id, body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('recon:post')
  complete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.recons.complete(user, meta, id, body.rowVersion);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @RequirePermission('recon:approve')
  reopen(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.recons.reopen(user, meta, id, body.rowVersion);
  }
}
