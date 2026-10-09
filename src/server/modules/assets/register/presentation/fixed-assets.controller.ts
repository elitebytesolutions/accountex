import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  AssetDisposalInputSchema, AssetDisposalUpdateSchema, AssetOptionalReasonSchema, AssetQuerySchema, AssetReasonSchema, AssetTransferInputSchema, CapitaliseSchema,
  DepreciationRunInputSchema, FixedAssetInputSchema, FixedAssetUpdateSchema, RowVersionSchema,
  type AssetDisposalInput, type AssetQuery, type AssetTransferInput, type DepreciationRunInput, type FixedAssetInput, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { DepreciationRunsService } from '../../depreciation/application/depreciation-runs.service.js';
import { AssetMovementsService } from '../../movements/application/asset-movements.service.js';
import { FixedAssetsService } from '../application/fixed-assets.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/assets/depreciation-runs: Fixed Assets › Run Depreciation. */
@Controller('assets/depreciation-runs')
export class DepreciationRunsController {
  constructor(private readonly runs: DepreciationRunsService) {}

  @Get()
  @RequirePermission('fa:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(AssetQuerySchema)) q: AssetQuery) {
    return this.runs.list(user, q);
  }

  @Get(':id')
  @RequirePermission('fa:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.runs.get(user, id);
  }

  /** Creates and computes the period's draft run. */
  @Post('preview')
  @HttpCode(200)
  @RequirePermission('fa:create')
  preview(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(DepreciationRunInputSchema)) body: DepreciationRunInput) {
    return this.runs.preview(user, meta, body);
  }

  @Post(':id/recompute')
  @HttpCode(200)
  @RequirePermission('fa:edit')
  recompute(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.runs.recompute(user, meta, id, body.rowVersion);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('fa:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.runs.post(user, meta, id, body.rowVersion);
  }

  @Post(':id/reverse')
  @HttpCode(200)
  @RequirePermission('fa:post')
  reverse(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AssetReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.runs.reverse(user, meta, id, body.rowVersion, body.reason);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('fa:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.runs.remove(user, meta, id, q.rowVersion);
  }
}

/** /api/assets/transfers: asset transfers (requested from the asset; approval completes them). */
@Controller('assets/transfers')
export class AssetTransfersController {
  constructor(private readonly movements: AssetMovementsService) {}

  @Get()
  @RequirePermission('fa:view')
  list(@CurrentUser() user: SessionUser, @Query('asset') asset?: string, @Query('status') status?: string) {
    return this.movements.transfers(user, asset && /^[0-9a-f-]{36}$/i.test(asset) ? asset : null, status ?? null);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('fa:approve')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.movements.approveTransfer(user, meta, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('fa:approve')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AssetOptionalReasonSchema)) body: { reason: string | null }) {
    return this.movements.rejectTransfer(user, meta, id, body.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('fa:edit')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AssetOptionalReasonSchema)) body: { reason: string | null }) {
    return this.movements.cancelTransfer(user, meta, id, body.reason);
  }
}

/** /api/assets/disposals: Fixed Assets › Disposals. */
@Controller('assets/disposals')
export class AssetDisposalsController {
  constructor(private readonly movements: AssetMovementsService) {}

  @Get()
  @RequirePermission('fa:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(AssetQuerySchema)) q: AssetQuery) {
    return this.movements.disposals(user, q);
  }

  @Get(':id')
  @RequirePermission('fa:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.movements.disposal(user, id);
  }

  @Post()
  @RequirePermission('fa:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(AssetDisposalInputSchema)) body: AssetDisposalInput) {
    return this.movements.createDisposal(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('fa:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AssetDisposalUpdateSchema)) body: AssetDisposalInput & { rowVersion: number }) {
    return this.movements.updateDisposal(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('fa:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.movements.deleteDisposal(user, meta, id, q.rowVersion);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('fa:edit')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.movements.submitDisposal(user, meta, id, body.rowVersion);
  }

  /** Approve and post (gain / loss posting). */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('fa:approve', 'fa:post')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.movements.approveDisposal(user, meta, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('fa:post')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AssetReasonSchema)) body: { rowVersion: number; reason: string }) {
    return this.movements.cancelDisposal(user, meta, id, body.rowVersion, body.reason);
  }
}

/** /api/assets: Fixed Assets › Register (registered after the /assets/<word> controllers so their paths win). */
@Controller('assets')
export class FixedAssetsController {
  constructor(private readonly assets: FixedAssetsService, private readonly movements: AssetMovementsService) {}

  @Get('options')
  @RequirePermission('fa:view')
  options(@CurrentUser() user: SessionUser) {
    return this.assets.options(user);
  }

  /** Posted vendor bill lines not yet on an asset. */
  @Get('capitalisable-lines')
  @RequirePermission('fa:view')
  lines(@CurrentUser() user: SessionUser, @Query('search') search?: string) {
    return this.assets.capitalisableLines(user, search?.trim() || null);
  }

  @Get()
  @RequirePermission('fa:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(AssetQuerySchema)) q: AssetQuery) {
    return this.assets.list(user, q);
  }

  /** With the depreciation schedule (GET /assets/:id/schedule is the same data). */
  @Get(':id')
  @RequirePermission('fa:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.assets.get(user, id);
  }

  @Get(':id/schedule')
  @RequirePermission('fa:view')
  async schedule(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return (await this.assets.get(user, id)).schedule;
  }

  @Post()
  @RequirePermission('fa:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(FixedAssetInputSchema)) body: FixedAssetInput) {
    return this.assets.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('fa:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(FixedAssetUpdateSchema)) body: FixedAssetInput & { rowVersion: number }) {
    return this.assets.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('fa:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.assets.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/capitalise')
  @HttpCode(200)
  @RequirePermission('fa:post')
  capitalise(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CapitaliseSchema)) body: { rowVersion: number; billLineId: string | null }) {
    return this.assets.capitalise(user, meta, id, body.rowVersion, body.billLineId);
  }

  @Post(':id/transfer')
  @RequirePermission('fa:edit')
  transfer(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AssetTransferInputSchema)) body: AssetTransferInput) {
    return this.movements.requestTransfer(user, meta, id, body);
  }
}
