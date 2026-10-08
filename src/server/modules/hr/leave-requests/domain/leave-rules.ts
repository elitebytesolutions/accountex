/**
 * Pure leave rules (no framework, no database): working days in a range, the leave type's application rules, the
 * balance check and the approval chain a request follows. They follow the LeaveTypes columns exactly.
 */
export type LeaveTypeRules = {
  name: string; isPaid: boolean; allowNegative: boolean; allowHalfDay: boolean; sandwichRule: boolean;
  minNoticeDays: number | null; backdateDays: number | null; maxConsecutiveDays: number | null; maxPerMonth: number | null;
  maxTimesInService: number | null; applyWindowDays: number | null; gender: string; availableAfter: string; probationRule: string;
  attachmentRequired: boolean; attachmentAfterDays: number | null; approvalWorkflow: string; hrApprovalAboveDays: number | null;
};
export type EmployeeFacts = { gender: string; joiningDate: string; confirmedOn: string | null; status: string; weeklyOff: string };

const DAY = 86_400_000;
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(toDate(d).getTime() + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
export const addMonths = (d: string, n: number) => { const x = toDate(d); x.setUTCMonth(x.getUTCMonth() + n); return iso(x.getTime()); };

/** JS weekdays (0 = Sunday) that are the employee's weekly off. ROTATING: the roster decides, so none is assumed. */
export function weeklyOffDays(weeklyOff: string): number[] {
  switch (weeklyOff) {
    case 'SUNDAY': return [0];
    case 'FRIDAY': return [5];
    case 'SATURDAY_SUNDAY': return [6, 0];
    default: return [];
  }
}

/**
 * Leave days in a range: working days (not weekly off, not a holiday), plus — under the sandwich rule — the weekly
 * offs and holidays that fall between two leave days. A half day counts 0.5.
 */
export function countLeaveDays(input: { fromDate: string; toDate: string; duration: string; weeklyOff: string; holidays: Map<string, string>; sandwich: boolean }) {
  const off = new Set(weeklyOffDays(input.weeklyOff));
  const calendarDays = daysBetween(input.fromDate, input.toDate) + 1;
  const all: { date: string; working: boolean }[] = [];
  for (let i = 0; i < calendarDays && i < 400; i++) {
    const date = addDays(input.fromDate, i);
    all.push({ date, working: !off.has(toDate(date).getUTCDay()) && !input.holidays.has(date) });
  }
  const working = all.filter((d) => d.working);
  const first = working[0]?.date, last = working.at(-1)?.date;
  const sandwiched = input.sandwich && first && last ? all.filter((d) => !d.working && d.date > first && d.date < last).length : 0;
  const nonWorking = all.filter((d) => !d.working);
  let days = working.length + sandwiched;
  if (input.duration !== 'FULL') days = working.length ? 0.5 : 0;
  return {
    days, calendarDays, sandwiched,
    weeklyOffDays: nonWorking.filter((d) => !input.holidays.has(d.date)).map((d) => d.date),
    holidays: nonWorking.filter((d) => input.holidays.has(d.date)).map((d) => ({ date: d.date, name: input.holidays.get(d.date)! })),
  };
}

/**
 * The leave type's rules for a request. Notice, backdating and the apply window bind self-service only; HR applying on
 * behalf records leave that is already agreed. Returns field → problem.
 */
export function leaveRuleErrors(t: LeaveTypeRules, r: {
  fromDate: string; toDate: string; duration: string; days: number; today: string; onBehalf: boolean;
  employee: EmployeeFacts; daysThisMonth: number; timesInService: number;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (r.days <= 0) e.toDate = 'No working days in this range';
  if (r.duration !== 'FULL' && !t.allowHalfDay) e.duration = `${t.name} can't be taken as a half day`;
  if (t.maxConsecutiveDays !== null && r.days > t.maxConsecutiveDays) e.toDate = `At most ${t.maxConsecutiveDays} consecutive days of ${t.name}`;
  if (t.maxPerMonth !== null && r.daysThisMonth + r.days > t.maxPerMonth) e.toDate = `At most ${t.maxPerMonth} days of ${t.name} a month (${r.daysThisMonth} already)`;
  if (t.maxTimesInService !== null && r.timesInService >= t.maxTimesInService) e.leaveTypeId = `${t.name} can be taken ${t.maxTimesInService === 1 ? 'once' : `${t.maxTimesInService} times`} in service`;
  if (t.gender !== 'ALL' && t.gender !== r.employee.gender) e.leaveTypeId = `${t.name} is for ${t.gender.toLowerCase()} employees`;
  const eligibleFrom = availableFrom(t.availableAfter, r.employee);
  if (eligibleFrom === null) e.leaveTypeId = `${t.name} is available after confirmation`;
  else if (r.fromDate < eligibleFrom) e.leaveTypeId = `${t.name} is available from ${eligibleFrom}`;
  if (t.probationRule === 'NOT_ALLOWED' && r.employee.status === 'PROBATION') e.leaveTypeId = `${t.name} isn't available during probation`;
  if (!r.onBehalf) {
    const ahead = daysBetween(r.today, r.fromDate);
    if (ahead < 0) {
      if (t.backdateDays === null || -ahead > t.backdateDays) e.fromDate = t.backdateDays ? `${t.name} can be backdated at most ${t.backdateDays} days` : `${t.name} can't be backdated`;
    } else if (t.minNoticeDays !== null && ahead < t.minNoticeDays) e.fromDate = `Apply at least ${t.minNoticeDays} days ahead for ${t.name}`;
    if (t.applyWindowDays !== null && ahead > t.applyWindowDays) e.fromDate = `Apply at most ${t.applyWindowDays} days ahead`;
  }
  return e;
}

/** First date the type may be taken (null: after a confirmation that hasn't happened). */
export function availableFrom(availableAfter: string, emp: { joiningDate: string; confirmedOn: string | null; status: string }): string | null {
  switch (availableAfter) {
    case 'CONFIRMATION': return emp.confirmedOn ?? (emp.status === 'PROBATION' ? null : emp.joiningDate);
    case 'SIX_MONTHS': return addMonths(emp.joiningDate, 6);
    case 'ONE_YEAR': return addMonths(emp.joiningDate, 12);
    case 'TWO_YEARS': return addMonths(emp.joiningDate, 24);
    default: return emp.joiningDate;
  }
}

/** A paid type that doesn't allow a negative balance refuses requests beyond what is available (balance − pending). */
export const insufficientBalance = (t: Pick<LeaveTypeRules, 'isPaid' | 'allowNegative'>, available: number, days: number) =>
  t.isPaid && !t.allowNegative && available - days < 0;

/** Warnings shown with a request (not refusals). */
export function leaveWarnings(t: LeaveTypeRules, days: number): string[] {
  const w: string[] = [];
  if (t.attachmentRequired && (t.attachmentAfterDays === null || days > t.attachmentAfterDays)) w.push(`${t.name} needs a supporting document${t.attachmentAfterDays ? ` for more than ${t.attachmentAfterDays} days` : ''}: hand it to HR`);
  if (!t.isPaid) w.push(`${t.name} is unpaid: payroll deducts these days`);
  return w;
}

/** The chain a request follows: the type's own, raised to manager + HR above hrApprovalAboveDays. */
export function approvalChain(t: Pick<LeaveTypeRules, 'approvalWorkflow' | 'hrApprovalAboveDays'>, days: number): string {
  if (t.approvalWorkflow === 'MANAGER' && t.hrApprovalAboveDays !== null && days > t.hrApprovalAboveDays) return 'MANAGER_HR';
  return t.approvalWorkflow;
}

/** LeaveRequests.stage of an approval step. */
export const stageOfStep = (step: { approverType: string; name: string }) =>
  step.approverType === 'LINE_MANAGER' ? 'LINE_MANAGER' : /ceo/i.test(step.name) ? 'CEO' : 'HR_REVIEW';
