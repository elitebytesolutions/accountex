import { Injectable } from '@nestjs/common';
import type { Currency, ExchangeRate, ListResult } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { CurrencyStore } from '../application/currency-store.js';

type RateRow = { id: string; currencyCode: string; rateDate: Date; rate: { toNumber(): number }; source: string; rowVersion: number };
const toRate = (r: RateRow): ExchangeRate => ({
  id: r.id,
  currencyCode: r.currencyCode,
  rateDate: r.rateDate.toISOString().slice(0, 10),
  rate: r.rate.toNumber(),
  source: r.source,
  rowVersion: r.rowVersion,
});
const rateColumns = { id: true, currencyCode: true, rateDate: true, rate: true, source: true, rowVersion: true } as const;

@Injectable()
export class PrismaCurrencyStore extends CurrencyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, baseCurrency: string): Promise<Currency[]> {
    const db = this.prisma.db();
    const currencies = await db.currencies.findMany({ orderBy: { code: 'asc' } });
    const latest = await db.$queryRaw<{ currencyCode: string; rate: string; rateDate: Date; source: string }[]>`
      select distinct on ("currencyCode") "currencyCode", "rate"::text as rate, "rateDate", "source"
      from "Company"."ExchangeRates" where "tenantId" = ${tenantId}::uuid
      order by "currencyCode", "rateDate" desc`;
    const byCode = new Map(latest.map((r) => [r.currencyCode.trim(), r]));
    return currencies
      .map((c) => {
        const code = c.code.trim();
        const r = byCode.get(code);
        return {
          code,
          name: c.name,
          symbol: c.symbol,
          minorUnits: c.minorUnits,
          isActive: c.isActive,
          isBase: code === baseCurrency,
          latestRate: r ? Number(r.rate) : null,
          latestRateDate: r ? r.rateDate.toISOString().slice(0, 10) : null,
          latestSource: r?.source ?? null,
        };
      })
      .sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.code.localeCompare(b.code));
  }

  async exists(code: string) {
    return (await this.prisma.db().currencies.count({ where: { code } })) === 1;
  }

  async baseCurrency(tenantId: string) {
    const s = await this.prisma.db().companySettings.findFirst({ where: { tenantId }, select: { baseCurrencyCode: true } });
    return s?.baseCurrencyCode.trim() ?? 'PKR';
  }

  async rates(tenantId: string, code: string, page: number, pageSize: number): Promise<ListResult<ExchangeRate>> {
    const where = { tenantId, currencyCode: code };
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([
      db.exchangeRates.findMany({ where, select: rateColumns, orderBy: { rateDate: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      db.exchangeRates.count({ where }),
    ]);
    return { items: rows.map(toRate), total };
  }

  async getRate(tenantId: string, id: string) {
    const row = await this.prisma.db().exchangeRates.findFirst({ where: { id, tenantId }, select: rateColumns });
    return row ? toRate(row) : null;
  }

  saveRate(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'exchangeRateAddUpdate', data);
  }

  async deleteRate(tenantId: string, id: string) {
    const { count } = await this.prisma.db().exchangeRates.deleteMany({ where: { id, tenantId } });
    return count === 1;
  }
}
