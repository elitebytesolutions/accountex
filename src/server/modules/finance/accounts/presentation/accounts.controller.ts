import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  AccountBulkStatusSchema,
  AccountCreateSchema,
  AccountUpdateSchema,
  LedgerViewSaveSchema,
  RowVersionSchema,
  type AccountBulkStatus,
  type AccountCreate,
  type AccountUpdate,
  type LedgerViewSave,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { AccountsService } from '../application/accounts.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const LedgerQuerySchema = z.object({ from: z.iso.date(), to: z.iso.date() });
const ApplyTemplateSchema = z.object({ templateId: z.uuid() });
const ViewUpdateSchema = LedgerViewSaveSchema.and(RowVersionSchema);

/** /api/accounting/accounts, account templates, ledger and saved ledger views. */
@Controller('accounting')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('accounts')
  @RequirePermission('coa:view')
  list(@CurrentUser() user: SessionUser) {
    return this.accounts.list(user);
  }

  /** Codes of deleted accounts, so the add form never suggests one (codes are never reused). */
  @Get('accounts/retired-codes')
  @RequirePermission('coa:view')
  retiredCodes(@CurrentUser() user: SessionUser) {
    return this.accounts.retiredCodes(user);
  }

  @Get('account-templates')
  @RequirePermission('coa:view')
  templates() {
    return this.accounts.templates();
  }

  @Post('accounts/apply-template')
  @HttpCode(200)
  @RequirePermission('coa:create')
  applyTemplate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ApplyTemplateSchema)) body: { templateId: string }) {
    return this.accounts.applyTemplate(user, meta, body.templateId);
  }

  @Post('accounts/bulk-status')
  @HttpCode(200)
  @RequirePermission('coa:edit')
  bulkStatus(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(AccountBulkStatusSchema)) body: AccountBulkStatus) {
    return this.accounts.setStatus(user, meta, body);
  }

  @Get('accounts/:id')
  @RequirePermission('coa:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.accounts.get(user, id);
  }

  @Get('accounts/:id/ledger')
  @RequirePermission('coa:view')
  ledger(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(LedgerQuerySchema)) q: { from: string; to: string }) {
    return this.accounts.ledger(user, id, q.from, q.to);
  }

  @Post('accounts')
  @RequirePermission('coa:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(AccountCreateSchema)) body: AccountCreate) {
    return this.accounts.create(user, meta, body);
  }

  @Patch('accounts/:id')
  @RequirePermission('coa:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(AccountUpdateSchema)) body: AccountUpdate) {
    return this.accounts.update(user, meta, id, body);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @RequirePermission('coa:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.accounts.delete(user, meta, id, q.rowVersion);
  }

  @Get('ledger-views')
  @RequirePermission('coa:view')
  views(@CurrentUser() user: SessionUser) {
    return this.accounts.ledgerViews(user);
  }

  @Post('ledger-views')
  @RequirePermission('coa:view')
  createView(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(LedgerViewSaveSchema)) body: LedgerViewSave) {
    return this.accounts.saveLedgerView(user, meta, body);
  }

  @Patch('ledger-views/:id')
  @RequirePermission('coa:view')
  updateView(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ViewUpdateSchema)) body: LedgerViewSave & { rowVersion: number }) {
    const { rowVersion, ...view } = body;
    return this.accounts.saveLedgerView(user, meta, view, id, rowVersion);
  }

  @Delete('ledger-views/:id')
  @HttpCode(204)
  @RequirePermission('coa:view')
  async deleteView(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.accounts.deleteLedgerView(user, meta, id, q.rowVersion);
  }
}
