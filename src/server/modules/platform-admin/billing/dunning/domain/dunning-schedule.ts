/**
 * Dunning day math (Phase 41). Pure.
 * - Days overdue count from the invoice's due date (day 1 = the day after it).
 * - The policy splits them: 1..grace GRACE, then READ_ONLY days, then SUSPENDED days, then COLLECTIONS.
 * - Each retry of the policy's schedule lands on due date + its day, at the policy's retry hour (Pakistan time).
 *   "ORIGINAL" retries with the company's own method when it is a chargeable rail, else by card.
 */
export const ATTEMPT_METHODS = ['CARD', 'JAZZCASH', 'EASYPAISA', 'RAAST', 'DIRECT_DEBIT'] as const;
export type RetryStep = { day: number; method: string; label: string };
export type PolicyDays = { graceDays: number; readOnlyDays: number; suspendedDays: number; retryHour: number; retrySchedule: RetryStep[] };
export type PlannedAttempt = { attemptNo: number; planDay: number; label: string; method: string; scheduledAt: string };

const parse = (d: string) => new Date(`${d}T00:00:00Z`);
const PKT_OFFSET_HOURS = 5;

export function daysOverdue(dueOn: string, today: string): number {
  return Math.round((parse(today).getTime() - parse(dueOn).getTime()) / 86_400_000);
}

export function stageForDays(days: number, p: Pick<PolicyDays, 'graceDays' | 'readOnlyDays' | 'suspendedDays'>): 'GRACE' | 'READ_ONLY' | 'SUSPENDED' | 'COLLECTIONS' {
  if (days <= p.graceDays) return 'GRACE';
  if (days <= p.graceDays + p.readOnlyDays) return 'READ_ONLY';
  if (days <= p.graceDays + p.readOnlyDays + p.suspendedDays) return 'SUSPENDED';
  return 'COLLECTIONS';
}

export function attemptMethod(stepMethod: string, original: string | null): string {
  if ((ATTEMPT_METHODS as readonly string[]).includes(stepMethod)) return stepMethod;
  return original && (ATTEMPT_METHODS as readonly string[]).includes(original) ? original : 'CARD';
}

/** The policy's retries for an invoice due on `dueOn` (ISO instants at the retry hour, PKT). */
export function retryPlan(dueOn: string, policy: PolicyDays, originalMethod: string | null): PlannedAttempt[] {
  return [...policy.retrySchedule]
    .sort((a, b) => a.day - b.day)
    .map((s, i) => {
      const at = parse(dueOn);
      at.setUTCDate(at.getUTCDate() + s.day);
      at.setUTCHours(policy.retryHour - PKT_OFFSET_HOURS);
      return { attemptNo: i + 1, planDay: s.day, label: s.label, method: attemptMethod(s.method, originalMethod), scheduledAt: at.toISOString() };
    });
}
