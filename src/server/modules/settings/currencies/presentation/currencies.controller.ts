import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ExchangeRateCreateSchema,
  ExchangeRateUpdateSchema,
  HistoryQuerySchema,
  RowVersionSchema,
  type ExchangeRateCreate,
  type ExchangeRateUpdate,
  type HistoryQuery,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ValidationError } from '../../../../core/domain/errors.js';
import { CurrenciesService } from '../application/currencies.service.js';

const currencyCode = (code: string) => {
  const c = code.toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new ValidationError('Invalid currency code', { code: ['Three letters, e.g. USD'] });
  return c;
};

/** /api/settings/currencies: Settings › Finance › Currencies & exchange rates. */
@Controller('settings/currencies')
export class CurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  /** Active currencies as select options for any signed-in user. */
  @Get('options')
  async options(@CurrentUser() user: SessionUser) {
    return (await this.currencies.list(user)).filter((c) => c.isActive).map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }));
  }

  @Get()
  @RequirePermission('comp:view')
  list(@CurrentUser() user: SessionUser) {
    return this.currencies.list(user);
  }

  @Get(':code/rates')
  @RequirePermission('comp:view')
  rates(@CurrentUser() user: SessionUser, @Param('code') code: string, @Query(new ZodValidationPipe(HistoryQuerySchema)) q: HistoryQuery) {
    return this.currencies.rates(user, currencyCode(code), q.page, q.pageSize);
  }

  @Post(':code/rates')
  @RequirePermission('comp:edit')
  addRate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('code') code: string, @Body(new ZodValidationPipe(ExchangeRateCreateSchema)) body: ExchangeRateCreate) {
    return this.currencies.addRate(user, meta, currencyCode(code), body);
  }

  @Patch(':code/rates/:id')
  @RequirePermission('comp:edit')
  updateRate(
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
    @Param('code') code: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ExchangeRateUpdateSchema)) body: ExchangeRateUpdate,
  ) {
    return this.currencies.updateRate(user, meta, currencyCode(code), id, body);
  }

  @Delete(':code/rates/:id')
  @HttpCode(204)
  @RequirePermission('comp:edit')
  async deleteRate(
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
    @Param('code') code: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(RowVersionSchema)) q: { rowVersion: number },
  ) {
    await this.currencies.deleteRate(user, meta, currencyCode(code), id, q.rowVersion);
  }
}
