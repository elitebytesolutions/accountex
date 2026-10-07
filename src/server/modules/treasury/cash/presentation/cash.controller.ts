import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CashAccountCreateSchema,
  CashAccountUpdateSchema,
  CashCategoryCreateSchema,
  CashCategoryUpdateSchema,
  ExpenseCategoryCreateSchema,
  ExpenseCategoryUpdateSchema,
  RowVersionSchema,
  type CashAccountCreate,
  type CashAccountUpdate,
  type CashCategoryCreate,
  type CashCategoryUpdate,
  type ExpenseCategoryCreate,
  type ExpenseCategoryUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CashService } from '../application/cash.service.js';
import type { CashTable } from '../application/cash-store.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const activeAction = new ZodValidationPipe(z.enum(['activate', 'deactivate']));
const TABLE: Record<string, CashTable> = { accounts: 'cashAccounts', categories: 'cashCategories', 'expense-categories': 'expenseCategories' };
const resource = new ZodValidationPipe(z.enum(['accounts', 'categories', 'expense-categories']));

/** /api/cash/accounts, /api/cash/categories and /api/cash/expense-categories: Cash › Cash Setup. */
@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('accounts')
  @RequirePermission('cash:view')
  accounts(@CurrentUser() user: SessionUser) {
    return this.cash.accounts(user);
  }

  @Post('accounts')
  @RequirePermission('cash:create')
  createAccount(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(CashAccountCreateSchema)) body: CashAccountCreate) {
    return this.cash.createAccount(user, meta, body);
  }

  @Patch('accounts/:id')
  @RequirePermission('cash:edit')
  updateAccount(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(CashAccountUpdateSchema)) body: CashAccountUpdate) {
    return this.cash.updateAccount(user, meta, id, body);
  }

  @Get('categories')
  @RequirePermission('cash:view')
  categories(@CurrentUser() user: SessionUser) {
    return this.cash.categories(user);
  }

  @Post('categories')
  @RequirePermission('cash:create')
  createCategory(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(CashCategoryCreateSchema)) body: CashCategoryCreate) {
    return this.cash.createCategory(user, meta, body);
  }

  @Patch('categories/:id')
  @RequirePermission('cash:edit')
  updateCategory(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(CashCategoryUpdateSchema)) body: CashCategoryUpdate) {
    return this.cash.updateCategory(user, meta, id, body);
  }

  @Get('expense-categories')
  @RequirePermission('cash:view')
  expenseCategories(@CurrentUser() user: SessionUser) {
    return this.cash.expenseCategories(user);
  }

  @Post('expense-categories')
  @RequirePermission('cash:create')
  createExpenseCategory(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ExpenseCategoryCreateSchema)) body: ExpenseCategoryCreate) {
    return this.cash.createExpenseCategory(user, meta, body);
  }

  @Patch('expense-categories/:id')
  @RequirePermission('cash:edit')
  updateExpenseCategory(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ExpenseCategoryUpdateSchema)) body: ExpenseCategoryUpdate) {
    return this.cash.updateExpenseCategory(user, meta, id, body);
  }

  /** POST /cash/{accounts|categories|expense-categories}/:id/{activate|deactivate} */
  @Post(':resource/:id/:action')
  @HttpCode(200)
  @RequirePermission('cash:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('resource', resource) res: string, @Param('id', uuid) id: string, @Param('action', activeAction) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.cash.setActive(user, meta, TABLE[res]!, id, action === 'activate', body.rowVersion);
  }

  /** DELETE /cash/{accounts|categories|expense-categories}/:id?rowVersion: soft delete when nothing uses it. */
  @Delete(':resource/:id')
  @HttpCode(204)
  @RequirePermission('cash:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('resource', resource) res: string, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.cash.delete(user, meta, TABLE[res]!, id, q.rowVersion);
  }
}
