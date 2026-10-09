/** Deterministic randomness and date helpers, so every run of the seeder produces the same company. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return Math.floor(this.next() * (max - min + 1)) + min; }
  money(min: number, max: number, step = 10): number { return Math.round(this.int(min, max) / step) * step; }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  sample<T>(a: readonly T[], n: number): T[] {
    const c = [...a];
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c.slice(0, Math.min(n, c.length));
  }
}

/** A child stream per area, so adding data in one area doesn't reshuffle another. */
export const rngFor = (area: string) => new Rng([...area].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261));

/** Seed history: April 2025 → today (2026-10-09 when written; uses the real clock). */
export const HISTORY_START = '2025-04-01';
export const today = () => new Date().toISOString().slice(0, 10);

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const monthStart = (date: string) => date.slice(0, 8) + '01';
export const monthEnd = (date: string) => { const d = new Date(date.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); };
export const isWeekend = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay() === 0;

/** Every month (first day) from HISTORY_START up to and including the current month. */
export function months(): string[] {
  const out: string[] = [];
  for (let m = HISTORY_START; m <= today(); m = addDays(monthEnd(m), 1)) out.push(m);
  return out;
}

/** Working days (Mon–Sat) of a month, capped at today. */
export function workDays(month: string): string[] {
  const out: string[] = [];
  const end = monthEnd(month) < today() ? monthEnd(month) : today();
  for (let d = month; d <= end; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d);
  return out;
}
