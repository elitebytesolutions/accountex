import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** A currency (global list) with this company's latest exchange rate. */
export const CurrencySchema = z.object({
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  minorUnits: z.number().int(),
  isActive: z.boolean(),
  isBase: z.boolean(),
  latestRate: z.number().nullable(),
  latestRateDate: z.string().nullable(),
  latestSource: z.string().nullable(),
});
export type Currency = z.infer<typeof CurrencySchema>;

export const ExchangeRateSchema = z.object({
  id: z.string(),
  currencyCode: z.string(),
  rateDate: z.string(),
  rate: z.number(),
  source: z.string(),
  rowVersion: z.number().int(),
});
export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

/** PKR per 1 unit of the foreign currency on that date. */
export const ExchangeRateCreateSchema = z.object({
  rateDate: z.iso.date('Use YYYY-MM-DD'),
  rate: z.coerce.number().positive('Rate must be greater than 0').max(1_000_000),
  source: z.string().trim().min(1).max(20).default('MANUAL'),
});
export type ExchangeRateCreate = z.infer<typeof ExchangeRateCreateSchema>;
export type ExchangeRateCreateFields = z.input<typeof ExchangeRateCreateSchema>;

export const ExchangeRateUpdateSchema = patchFields(ExchangeRateCreateSchema.shape).extend(RowVersionSchema.shape);
export type ExchangeRateUpdate = z.infer<typeof ExchangeRateUpdateSchema>;
