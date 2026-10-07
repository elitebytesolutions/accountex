import { Injectable } from '@nestjs/common';
import type { Currency, ExchangeRate, ExchangeRateCreate, ExchangeRateUpdate, ListResult, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { CurrencyStore } from './currency-store.js';

/** Currencies (global, read-only here) and the company's exchange rates. */
@Injectable()
export class CurrenciesService {
  constructor(
    private readonly store: CurrencyStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(user: SessionUser): Promise<Currency[]> {
    return this.store.list(user.tenantId, await this.store.baseCurrency(user.tenantId));
  }

  async rates(user: SessionUser, code: string, page: number, pageSize: number): Promise<ListResult<ExchangeRate>> {
    await this.requireCurrency(code);
    return this.store.rates(user.tenantId, code, page, pageSize);
  }

  async addRate(user: SessionUser, meta: RequestMeta, code: string, input: ExchangeRateCreate): Promise<ExchangeRate> {
    await this.requireForeign(user, code);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveRate({ ...input, currencyCode: code }));
    return this.getRate(user, id);
  }

  async updateRate(user: SessionUser, meta: RequestMeta, code: string, id: string, input: ExchangeRateUpdate): Promise<ExchangeRate> {
    const rate = await this.getRate(user, id);
    if (rate.currencyCode !== code) throw new NotFoundError('Exchange rate not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveRate({ ...input, id }));
    return this.getRate(user, id);
  }

  async deleteRate(user: SessionUser, meta: RequestMeta, code: string, id: string, rowVersion: number): Promise<void> {
    const rate = await this.getRate(user, id);
    if (rate.currencyCode !== code) throw new NotFoundError('Exchange rate not found');
    if (rate.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this rate. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteRate(user.tenantId, id));
  }

  private async getRate(user: SessionUser, id: string): Promise<ExchangeRate> {
    const rate = await this.store.getRate(user.tenantId, id);
    if (!rate) throw new NotFoundError('Exchange rate not found');
    return rate;
  }

  private async requireCurrency(code: string) {
    if (!(await this.store.exists(code))) throw new NotFoundError(`Currency ${code} not found`);
  }

  /** Rates are only for foreign currencies: the base currency is always 1. */
  private async requireForeign(user: SessionUser, code: string) {
    await this.requireCurrency(code);
    if (code === (await this.store.baseCurrency(user.tenantId))) {
      throw new ValidationError('The base currency does not need an exchange rate.', undefined, { code: 'FX_BASE_CURRENCY' });
    }
  }
}
