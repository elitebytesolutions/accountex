import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BankAccountCreateSchema,
  BankAccountStatusSchema,
  BankAccountUpdateSchema,
  BankCreateSchema,
  BankUpdateSchema,
  ChequeBookCreateSchema,
  ChequeBookUpdateSchema,
  RowVersionSchema,
  type BankAccountCreate,
  type BankAccountStatusAction,
  type BankAccountUpdate,
  type BankCreate,
  type BankUpdate,
  type ChequeBookCreate,
  type ChequeBookUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { BanksService } from '../application/banks.service.js';
import { ChequeBooksService } from '../application/cheque-books.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const BooksQuerySchema = z.object({ bankAccountId: z.uuid().optional() });

/** /api/bank/banks, /api/bank/accounts and /api/bank/cheque-books: Bank › Bank Accounts. */
@Controller('bank')
export class BanksController {
  constructor(
    private readonly banks: BanksService,
    private readonly books: ChequeBooksService,
  ) {}

  // ------------------------------------------------------------ Banks
  @Get('banks')
  @RequirePermission('bank:view')
  listBanks(@CurrentUser() user: SessionUser) {
    return this.banks.banks(user);
  }

  @Post('banks')
  @RequirePermission('bank:create')
  createBank(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(BankCreateSchema)) body: BankCreate) {
    return this.banks.createBank(user, meta, body);
  }

  @Patch('banks/:id')
  @RequirePermission('bank:edit')
  updateBank(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BankUpdateSchema)) body: BankUpdate) {
    return this.banks.updateBank(user, meta, id, body);
  }

  @Post('banks/:id/:action')
  @HttpCode(200)
  @RequirePermission('bank:edit')
  bankAction(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.banks.setBankActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('banks/:id')
  @HttpCode(204)
  @RequirePermission('bank:delete')
  async deleteBank(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.banks.deleteBank(user, meta, id, q.rowVersion);
  }

  // ------------------------------------------------------------ Bank accounts
  @Get('accounts')
  @RequirePermission('bank:view')
  listAccounts(@CurrentUser() user: SessionUser) {
    return this.banks.accounts(user);
  }

  @Get('accounts/:id')
  @RequirePermission('bank:view')
  getAccount(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.banks.account(user, id);
  }

  @Post('accounts')
  @RequirePermission('bank:create')
  createAccount(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(BankAccountCreateSchema)) body: BankAccountCreate) {
    return this.banks.createAccount(user, meta, body);
  }

  @Patch('accounts/:id')
  @RequirePermission('bank:edit')
  updateAccount(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BankAccountUpdateSchema)) body: BankAccountUpdate) {
    return this.banks.updateAccount(user, meta, id, body);
  }

  @Post('accounts/:id/:action')
  @HttpCode(200)
  @RequirePermission('bank:edit')
  accountAction(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['dormant', 'activate', 'close']))) action: 'dormant' | 'activate' | 'close', @Body(new ZodValidationPipe(BankAccountStatusSchema)) body: BankAccountStatusAction) {
    return this.banks.setAccountStatus(user, meta, id, action, body.rowVersion, body.closedOn);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @RequirePermission('bank:delete')
  async deleteAccount(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.banks.deleteAccount(user, meta, id, q.rowVersion);
  }

  // ------------------------------------------------------------ Cheque books
  @Get('cheque-books')
  @RequirePermission('bank:view')
  listBooks(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(BooksQuerySchema)) q: { bankAccountId?: string }) {
    return this.books.list(user, q.bankAccountId);
  }

  @Post('cheque-books')
  @RequirePermission('bank:create')
  createBook(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ChequeBookCreateSchema)) body: ChequeBookCreate) {
    return this.books.create(user, meta, body);
  }

  @Patch('cheque-books/:id')
  @RequirePermission('bank:edit')
  updateBook(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ChequeBookUpdateSchema)) body: ChequeBookUpdate) {
    return this.books.update(user, meta, id, body);
  }

  @Post('cheque-books/:id/:action')
  @HttpCode(200)
  @RequirePermission('bank:edit')
  bookAction(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'cancel']))) action: 'activate' | 'cancel', @Body(version) body: { rowVersion: number }) {
    return this.books.setStatus(user, meta, id, action, body.rowVersion);
  }

  @Delete('cheque-books/:id')
  @HttpCode(204)
  @RequirePermission('bank:delete')
  async deleteBook(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.books.delete(user, meta, id, q.rowVersion);
  }
}
