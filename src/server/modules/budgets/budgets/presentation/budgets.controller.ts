import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BudgetInputSchema, BudgetLinesSchema, BudgetQuerySchema, BudgetVarianceQuerySchema, RowVersionSchema,
  type BudgetInput, type BudgetLinesInput, type BudgetQuery, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { BudgetsService } from '../application/budgets.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);

/** /api/accounting/budgets: Budgeting › Budgets and Budget vs Actual. */
@Controller('accounting/budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get('options')
  @RequirePermission('bud:view')
  options(@CurrentUser() user: SessionUser) {
    return this.budgets.options(user);
  }

  @Get()
  @RequirePermission('bud:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(BudgetQuerySchema)) q: BudgetQuery) {
    return this.budgets.list(user, q);
  }

  @Get(':id')
  @RequirePermission('bud:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Query('version') v?: string) {
    return this.budgets.get(user, id, v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  }

  @Get(':id/variance')
  @RequirePermission('bud:view')
  variance(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Query(pipe(BudgetVarianceQuerySchema)) q: { version?: string; from: number; to: number }) {
    return this.budgets.variance(user, id, q.version ?? null, q.from, Math.max(q.from, q.to));
  }

  @Post()
  @RequirePermission('bud:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BudgetInputSchema)) body: BudgetInput) {
    return this.budgets.create(user, meta, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('bud:delete')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.budgets.remove(user, meta, id, q.rowVersion);
  }

  /** A new draft version copied from the current one. */
  @Post(':id/versions')
  @RequirePermission('bud:create')
  newVersion(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.budgets.newVersion(user, meta, id);
  }

  @Put('versions/:versionId/lines')
  @RequirePermission('bud:edit')
  lines(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('versionId', uuid) versionId: string, @Body(pipe(BudgetLinesSchema)) body: BudgetLinesInput) {
    return this.budgets.saveLines(user, meta, versionId, body);
  }

  @Post('versions/:versionId/submit')
  @HttpCode(200)
  @RequirePermission('bud:edit')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('versionId', uuid) versionId: string) {
    return this.budgets.submit(user, meta, versionId);
  }

  @Post('versions/:versionId/approve')
  @HttpCode(200)
  @RequirePermission('bud:approve')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('versionId', uuid) versionId: string) {
    return this.budgets.approve(user, meta, versionId);
  }
}
