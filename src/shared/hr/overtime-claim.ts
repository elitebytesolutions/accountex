import { z } from 'zod';
import type { ApprovalDetail } from '../finance/gl.ts';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';

/** Phase 30: overtime claims (OT-), priced with the active overtime policy; approved claims go to payroll (Phase 32). */
export type OvertimeClaim = {
  id: string; docNo: string; employee: EmpRef; dateFrom: string; dateTo: string; dayType: string; timeFrom: string | null; timeTo: string | null;
  hours: number; multiplier: number; hourlyRate: number; isCompOff: boolean; amount: number; reason: string | null; source: string;
  preApproved: boolean; payrollMonth: string; status: string; decidedBy: { id: string; name: string } | null; decidedAt: string | null;
  rejectionReason: string | null; pushedAt: string | null; createdAt: string; rowVersion: number;
  waitingOn: string | null; approval: ApprovalDetail | null; canAct: boolean;
};
export type OvertimeClaimList = {
  items: OvertimeClaim[]; total: number; counts: Record<string, number>; month: string;
  kpis: { hours: number; cost: number; pendingCount: number; pendingHours: number; pendingAmount: number; overCap: number; capHours: number | null; prevHours: number };
  byDepartment: { department: string; hours: number }[];
};
/** What the log-overtime form prices with. */
export type OvertimeRate = {
  hourlyRate: number | null; basis: string | null;
  policy: { id: string; weekdayMultiplier: number; weeklyOffMultiplier: number; holidayMultiplier: number; minMinutes: number; dailyCapHours: number | null; monthlyCapHours: number | null; rounding: string; allowCompOff: boolean } | null;
  usedThisMonth: number;
};

/** Hours between two HH:MM times (past midnight when the end is earlier). */
export function spanHours(from: string, to: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let d = m(to) - m(from);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 100) / 100;
}
/** Policy rounding of hours (NEAREST_30 / NEAREST_15 / NONE). */
export function roundOvertime(hours: number, rounding: string | null): number {
  const step = rounding === 'NEAREST_30' ? 0.5 : rounding === 'NEAREST_15' ? 0.25 : 0;
  return step ? Math.round(hours / step) * step : Math.round(hours * 100) / 100;
}
/** The database's amount rule: round(hours × rate × multiplier, 2), or 0 for comp-off. */
export const overtimeAmount = (hours: number, rate: number, multiplier: number, compOff: boolean) => (compOff ? 0 : Math.round(hours * rate * multiplier * 100) / 100);
/** Days in a date range (inclusive). */
export const rangeDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const optionalTime = time.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const fields = {
  employeeId: z.uuid('Choose the employee'),
  dateFrom: z.iso.date('Use a date'),
  dateTo: z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  dayType: z.enum(['WEEKDAY', 'WEEKLY_OFF', 'PUBLIC_HOLIDAY'], 'Choose the day type'),
  timeFrom: optionalTime,
  timeTo: optionalTime,
  /** Total hours; when absent they come from the times × days. */
  hours: z.coerce.number().positive('More than zero').max(744).optional().nullable().transform((v) => v ?? null),
  hourlyRate: z.coerce.number().min(0).max(1_000_000).optional().nullable().transform((v) => v ?? null),
  isCompOff: z.boolean().default(false),
  preApproved: z.boolean().default(false),
  reason: optionalText(500),
};
const refine = (o: { dateFrom?: string; dateTo?: string | null; timeFrom?: string | null; timeTo?: string | null; hours?: number | null }, ctx: z.RefinementCtx) => {
  if (o.dateFrom && o.dateTo && o.dateTo < o.dateFrom) ctx.addIssue({ code: 'custom', path: ['dateTo'], message: 'Not before the start date' });
  if (o.hours == null && (!o.timeFrom || !o.timeTo)) ctx.addIssue({ code: 'custom', path: ['timeTo'], message: 'Give the from and to times (or the hours)' });
};
export const OvertimeClaimSchema = z.object(fields).superRefine(refine);
export type OvertimeClaimInput = z.infer<typeof OvertimeClaimSchema>;
export const OvertimeClaimUpdateSchema = z.object(fields).extend({ rowVersion: z.coerce.number().int().min(0) }).superRefine(refine);
export type OvertimeClaimUpdate = z.infer<typeof OvertimeClaimUpdateSchema>;
export const OvertimeQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(), status: z.string().trim().max(20).optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const OvertimeRejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });
