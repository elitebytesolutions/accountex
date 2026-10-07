/**
 * Pure route rules: visit-day changes and stop ordering. A stop belongs to one visit day of its route, or to every
 * visit day (weekday null); its sequence is its position within that day, from 1.
 */

/** Sequence numbers used while reordering, above any real stop number, so the unique (route, day, seq) index never clashes. */
export const TEMP_SEQ_BASE = 100_000;

export type DayRow = { id: string; weekday: string };

/** Which visit-day rows to keep, which weekdays to add and which rows go. */
export function planDays(current: DayRow[], next: string[]) {
  const keep = current.filter((d) => next.includes(d.weekday));
  const removed = current.filter((d) => !next.includes(d.weekday));
  const add = next.filter((w) => !current.some((d) => d.weekday === w));
  return { keep, add, removed };
}

export type StopIn = { customerId: string; weekday: string | null; plannedEta: string | null };
export type StopRow = { id: string; customerId: string; weekday: string | null };
export type PlannedStop = StopIn & { id?: string; stopSeq: number };

/**
 * The final stops in the given order: an existing stop (same shop on the same day) keeps its row; sequence numbers
 * restart at 1 for each day. Returns the problem when a shop appears twice on the same day.
 */
export function planStops(next: StopIn[], existing: StopRow[]): { stops: PlannedStop[]; kept: StopRow[]; error?: string } {
  const seen = new Set<string>();
  const counter = new Map<string, number>();
  const stops: PlannedStop[] = [];
  for (const s of next) {
    const key = `${s.weekday ?? '*'}|${s.customerId}`;
    if (seen.has(key)) return { stops: [], kept: [], error: 'A shop appears twice on the same visit day' };
    seen.add(key);
    const group = s.weekday ?? '*';
    const seq = (counter.get(group) ?? 0) + 1;
    counter.set(group, seq);
    const row = existing.find((e) => e.customerId === s.customerId && e.weekday === s.weekday);
    stops.push({ ...s, ...(row && { id: row.id }), stopSeq: seq });
  }
  const kept = existing.filter((e) => stops.some((s) => s.id === e.id));
  return { stops, kept };
}

/** Next sequence for a stop appended to a day (or to "every day" when weekday is null). */
export const nextSeq = (stops: { weekday: string | null; stopSeq: number }[], weekday: string | null) =>
  Math.max(0, ...stops.filter((s) => s.weekday === weekday).map((s) => s.stopSeq)) + 1;
