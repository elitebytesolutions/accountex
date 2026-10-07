/** Schedules run in Asia/Karachi (UTC+05:00, no daylight saving). */
const OFFSET_MS = 5 * 3600_000;

/**
 * The next run after `now` of a report schedule: DAILY at runTime; WEEKLY on dayOfWeek (1 = Monday … 7 = Sunday);
 * MONTHLY on dayOfMonth (1–28); QUARTERLY on dayOfMonth of January, April, July and October.
 */
export function nextRunAt(s: { frequency: string; dayOfWeek: number | null; dayOfMonth: number | null; runTime: string }, now: Date): Date {
  const [hh, mm] = s.runTime.split(':').map(Number) as [number, number];
  const local = new Date(now.getTime() + OFFSET_MS);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  const at = (yy: number, mo: number, dd: number) => new Date(Date.UTC(yy, mo, dd, hh, mm) - OFFSET_MS);
  const after = (t: Date) => t.getTime() > now.getTime();
  switch (s.frequency) {
    case 'DAILY': {
      const t = at(y, m, d);
      return after(t) ? t : at(y, m, d + 1);
    }
    case 'WEEKLY': {
      const isoDow = ((local.getUTCDay() + 6) % 7) + 1;
      const t = at(y, m, d + ((s.dayOfWeek! - isoDow + 7) % 7));
      return after(t) ? t : at(y, m, d + ((s.dayOfWeek! - isoDow + 7) % 7) + 7);
    }
    case 'MONTHLY': {
      const t = at(y, m, s.dayOfMonth!);
      return after(t) ? t : at(y, m + 1, s.dayOfMonth!);
    }
    case 'QUARTERLY': {
      for (let q = Math.floor(m / 3) * 3; ; q += 3) {
        const t = at(y, q, s.dayOfMonth!);
        if (after(t)) return t;
      }
    }
    default:
      throw new Error(`Unknown frequency ${s.frequency}`);
  }
}
