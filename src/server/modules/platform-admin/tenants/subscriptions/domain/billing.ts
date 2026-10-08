/**
 * Subscription billing rules (Phase 40). Pure.
 * - The price is the plan's monthly or annual price; MRR is its monthly equivalent (annual / 12), 0 while in trial.
 * - A period runs one month or one year from its start; the next renewal is the period end.
 */
export type PlanPrice = { priceMonthly: number; priceAnnual: number | null; trialDays: number; userSeats: number | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** The period end for a cycle starting on `start` (the day before the same date next month / year). */
export function periodEnd(start: string, cycle: string): string {
  const d = parse(start);
  if (cycle === 'ANNUAL') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

/** The amount billed per cycle (annual falls back to 12 × monthly when the plan has no annual price). */
export function cycleAmount(plan: PlanPrice, cycle: string): number {
  return cycle === 'ANNUAL' ? (plan.priceAnnual ?? plan.priceMonthly * 12) : plan.priceMonthly;
}

/** Monthly recurring revenue of a subscription: 0 while in trial or not live. */
export function mrrOf(amount: number, cycle: string, status: string): number {
  if (!['ACTIVE', 'PAST_DUE', 'SUSPENDED'].includes(status)) return 0;
  return Math.round((cycle === 'ANNUAL' ? amount / 12 : amount) * 100) / 100;
}

/** Today in Pakistan time (the platform's business day). */
export const todayPk = (now = new Date()) => iso(new Date(now.getTime() + 5 * 3600_000));
