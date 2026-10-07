import type { Currency, ExchangeRate, ListResult } from '../../../../../shared/index.js';

/** Port: the global currency list plus this tenant's exchange rates. */
export abstract class CurrencyStore {
  /** Every currency with the tenant's latest rate; `baseCurrency` is marked isBase. */
  abstract list(tenantId: string, baseCurrency: string): Promise<Currency[]>;
  abstract exists(code: string): Promise<boolean>;
  /** Base currency from company settings (PKR until the settings are saved). */
  abstract baseCurrency(tenantId: string): Promise<string>;
  abstract rates(tenantId: string, code: string, page: number, pageSize: number): Promise<ListResult<ExchangeRate>>;
  abstract getRate(tenantId: string, id: string): Promise<ExchangeRate | null>;
  /** Insert or update through Company.exchangeRateAddUpdate. */
  abstract saveRate(data: Record<string, unknown>): Promise<string>;
  abstract deleteRate(tenantId: string, id: string): Promise<boolean>;
}
