/**
 * Dunning policy rules (Phase 38). Pure. The DB checks each number's range; this checks the order of the timeline:
 * day 1..grace full access → read-only days → suspended days → cancelled on day grace + readOnly + suspended + 1.
 */
export type PolicyTimeline = {
  graceDays: number;
  readOnlyDays: number;
  suspendedDays: number;
  retrySchedule: { day: number }[];
};

/** The day the account is cancelled (and its data archived). */
export const cancelDay = (p: PolicyTimeline) => p.graceDays + p.readOnlyDays + p.suspendedDays + 1;

/**
 * Day-order issues ({ field: message }): retries run on strictly increasing days, all before the cancel day.
 * Empty when the timeline is in order.
 */
export function dayOrderErrors(p: PolicyTimeline): Record<string, string> {
  const e: Record<string, string> = {};
  const days = p.retrySchedule.map((s) => s.day);
  if (days.some((d, i) => i > 0 && d <= days[i - 1]!)) e.retrySchedule = 'Retry days must increase from one retry to the next';
  else if (days.some((d) => d >= cancelDay(p))) e.retrySchedule = `Every retry must come before the account is cancelled on day ${cancelDay(p)}`;
  return e;
}
