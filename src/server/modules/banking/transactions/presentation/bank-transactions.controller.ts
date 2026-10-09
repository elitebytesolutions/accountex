import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { BankBookQuerySchema, BankTxnQuerySchema, CategoriseSchema, type BankTxnQuery, type CategoriseInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { BankTransactionsService } from '../application/bank-transactions.service.js';

const uuid = new ParseUUIDPipe();

/** /api/bank/transactions and /api/bank/banking-options: Finance › Bank › Bank Transactions. */
@Controller('bank')
export class BankTransactionsController {
  constructor(private readonly txns: BankTransactionsService) {}

  @Get('banking-options')
  @RequirePermission('bank:view')
  options(@CurrentUser() user: SessionUser) {
    return this.txns.options(user);
  }

  @Get('book')
  @RequirePermission('bank:view')
  book(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(BankBookQuerySchema)) q: { account: string; from: string; to: string }) {
    return this.txns.book(user, q);
  }

  @Get('transactions')
  @RequirePermission('bank:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(BankTxnQuerySchema)) q: BankTxnQuery) {
    return this.txns.list(user, q);
  }

  @Get('transactions/:id')
  @RequirePermission('bank:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.txns.get(user, id);
  }

  @Post('transactions/:id/categorise')
  @HttpCode(200)
  @RequirePermission('bank:create')
  categorise(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(CategoriseSchema)) body: CategoriseInput) {
    return this.txns.categorise(user, meta, id, body);
  }
}
