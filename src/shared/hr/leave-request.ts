import { z } from 'zod';
import type { ApprovalDetail } from '../finance/gl.ts';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';

/**
 * Phase 31: leave requests (LV-). An employee applies from My Profile and the request follows its leave type's approval
 * chain through the approval engine; HR applying on someone's behalf skips the chain. Pending days are "booked",
 * approved days "used" (the database keeps LeaveBalances in step).
 */
export const LEAVE_DURATIONS = ['FULL', 'HALF_AM', 'HALF_PM'] as const;
export const LEAVE_REJECT_REASONS = ['BUSINESS_CRITICAL_PERIOD', 'INSUFFICIENT_BALANCE', 'TEAM_OVERLAP', 'SHORT_NOTICE', 'OTHER'] as const;

export type LeaveTypeRef = { id: string; code: string; name: string; category: string; colour: string; isPaid: boolean; allowNegative: boolean; allowHalfDay: boolean };
export type Who = { id: string; name: string };

export type LeaveRequestItem = {
  id: string; docNo: string; employee: EmpRef; leaveType: LeaveTypeRef; duration: string; fromDate: string; toDate: string; days: number; calendarDays: number;
  reason: string | null; handover: Who | null; contactDuringLeave: string | null; balanceBefore: number | null; balanceAfter: number | null;
  channel: string; appliedOnBehalf: boolean; submittedAt: string; status: string; stage: string;
  decidedBy: Who | null; decidedAt: string | null; rejectionReason: string | null; decisionComment: string | null; suggestAlternative: boolean;
  cancelledAt: string | null; cancelReason: string | null; rowVersion: number;
  /** Pending: the current approval step and its approvers ("Line manager — Zainab Raza"). */
  waitingOn: string | null;
};
export type LeaveRequestList = { items: LeaveRequestItem[]; total: number; counts: Record<string, number>; yearStart: string };
export type LeaveBalanceFigures = { entitled: number; carriedIn: number; adjusted: number; used: number; booked: number; encashed: number; lapsed: number; balance: number; available: number };
export type LeaveRequestDetail = LeaveRequestItem & {
  approval: ApprovalDetail | null; canAct: boolean;
  /** The employee's balance of this type in the request's leave year. */
  balance: LeaveBalanceFigures | null;
  /** Others in the same department on leave in the same period. */
  overlap: { name: string; fromDate: string; toDate: string; leaveType: string; status: string }[];
};

/** Live preview of a request before it is filed (working days, balance after, rule problems, approval route). */
export type LeavePreview = {
  days: number; calendarDays: number; weeklyOffDays: string[]; holidays: { date: string; name: string }[];
  balance: (LeaveBalanceFigures & { after: number }) | null;
  /** Field → problem; a request with errors is refused. */
  errors: Record<string, string>;
  warnings: string[];
  route: string[];
  clashes: { name: string; fromDate: string; toDate: string; leaveType: string; status: string }[];
};

export type LeaveOverview = {
  yearStart: string; yearEnd: string; typesCount: number; routeNote: string; today: string;
  kpis: { onLeaveToday: number; workforce: number; pending: number; pendingHr: number; daysTaken: number; avgPerEmployee: number; unplannedPct: number | null };
  month: string;
  calendar: { id: string; employee: string; fromDate: string; toDate: string; status: string; leaveType: LeaveTypeRef; duration: string }[];
  outToday: { employee: EmpRef; leaveType: LeaveTypeRef; fromDate: string; toDate: string; duration: string }[];
  usage: { leaveType: LeaveTypeRef; days: number }[];
  pending: (LeaveRequestItem & { balanceOf: { available: number; entitled: number } | null })[];
};

/** Choices for the HR forms (apply on behalf, adjust balance): employees and leave types. */
export type LeaveFormOptions = {
  employees: { id: string; code: string; name: string; department: string | null }[];
  departments: { id: string; name: string }[];
  types: (LeaveTypeRef & { daysPerYear: number; approvalWorkflow: string; hrApprovalAboveDays: number | null })[];
};

const isoDate = z.iso.date('Use a date');
const base = {
  leaveTypeId: z.uuid('Choose a leave type'),
  duration: z.enum(LEAVE_DURATIONS).default('FULL'),
  fromDate: isoDate,
  toDate: isoDate,
  handoverEmployeeId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  contactDuringLeave: optionalText(60),
};
const range = (r: { fromDate: string; toDate: string; duration: string }, ctx: z.RefinementCtx) => {
  if (r.toDate < r.fromDate) ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'Not before the start date' });
  if (r.duration !== 'FULL' && r.toDate !== r.fromDate) ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'A half day is a single day' });
};
/** My Profile › Leave › Apply (the reason is required: the approver reads it). */
export const LeaveApplySchema = z.object({ ...base, reason: z.string().trim().min(3, 'Give a short reason').max(500) }).superRefine(range);
export type LeaveApply = z.infer<typeof LeaveApplySchema>;
/** HR › Leave › Apply on behalf (skips the approval chain). */
export const LeaveOnBehalfSchema = z.object({ ...base, employeeId: z.uuid('Choose an employee'), reason: optionalText(500) }).superRefine(range);
export type LeaveOnBehalf = z.infer<typeof LeaveOnBehalfSchema>;
/** Preview: either form's fields, the employee for HR. */
export const LeavePreviewSchema = z.object({ ...base, employeeId: z.uuid().optional(), onBehalf: z.coerce.boolean().default(false) }).superRefine(range);
export type LeavePreviewInput = z.infer<typeof LeavePreviewSchema>;

export const LeaveDecisionSchema = z.object({ comment: optionalText(500) });
export const LeaveRejectSchema = z.object({
  reason: z.enum(LEAVE_REJECT_REASONS, 'Choose a reason'),
  comment: optionalText(500),
  suggestAlternative: z.boolean().default(false),
});
export type LeaveReject = z.infer<typeof LeaveRejectSchema>;
export const LeaveCancelSchema = z.object({ reason: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export const LeaveApproveManySchema = z.object({ ids: z.array(z.uuid()).min(1).max(100) });
export const LeaveRequestQuerySchema = z.object({
  status: z.string().trim().max(20).optional(), leaveTypeId: z.uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  departmentId: z.uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  /** YYYY-MM, or "YEAR" for the whole current leave year (default). */
  period: z.string().trim().regex(/^(\d{4}-\d{2}|YEAR|ALL)$/).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type LeaveRequestQuery = z.infer<typeof LeaveRequestQuerySchema>;
export const LeaveOverviewQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional(), departmentId: z.uuid().optional().or(z.literal('')).transform((v) => v || undefined) });
