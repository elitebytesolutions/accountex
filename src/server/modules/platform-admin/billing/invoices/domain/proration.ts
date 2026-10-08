/**
 * Proration (Phase 41). Pure. A change that takes effect on `from` inside a billing period is charged (or credited)
 * for the days left: price × (days from `from` to the period end, inclusive) / (days in the period).
 * The result keeps 4 decimals (PlatformInvoiceLines.unitPrice is numeric(18,4)).
 */
const parse = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const days = (a: string, b: string) => Math.round((parse(b) - parse(a)) / 86_400_000) + 1;

export function prorate(price: number, periodStart: string, periodEnd: string, from: string): number {
  const total = days(periodStart, periodEnd);
  if (total <= 0) return 0;
  const clamped = from < periodStart ? periodStart : from > periodEnd ? null : from;
  if (!clamped) return 0;
  return Math.round(((price * days(clamped, periodEnd)) / total) * 10_000) / 10_000;
}
