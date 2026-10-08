import { z } from 'zod';
import type { EmpRef } from './attendance.ts';
import type { LeaveBalanceFigures, LeaveRequestItem, LeaveTypeRef, Who } from './leave-request.ts';

/**
 * Phase 31: leave balances (one row per employee, type and leave year, kept by the database from requests and the
 * append-only adjustments ledger), accrual, manual / opening / comp-off adjustments and the year-end close.
 */
export const LEAVE_ADJUSTMENT_KINDS = ['MANUAL', 'OPENING', 'COMP_OFF'] as const;

export type LeaveBalanceType = LeaveTypeRef & { daysPerYear: number; accrualMethod: string; accrualAmount: number | null };
export type LeaveBalanceRow = {
  employee: EmpRef & { joiningDate: string };
  /** By leave type id. */
  cells: Record<string, LeaveBalanceFigures & { carriedExpiresOn: string | null }>;
  /** Totals across types. */
  carriedIn: number; unpaidTaken: number; encashable: number; negative: boolean; low: boolean;
};
export type LeaveBalanceView = {
  yearStart: string; yearEnd: string; years: string[]; today: string; types: LeaveBalanceType[]; rows: LeaveBalanceRow[];
  total: number; counts: { all: number; low: number; negative: number };
};
export type LeaveAdjustmentItem = {
  id: string; employee: EmpRef; leaveType: LeaveTypeRef; leaveYearStart: string; kind: string; direction: string; days: number; effectiveDate: string;
  reason: string; overtimeClaim: { id: string; docNo: string } | null; yearEndCloseId: string | null; encashAmount: number | null;
  createdBy: Who | null; createdAt: string;
};
/** Approved comp-off overtime claims (Phase 30) not yet credited as leave. */
export type CompOffClaim = { id: string; docNo: string; dateFrom: string; dateTo: string; hours: number; reason: string | null; suggestedDays: number };

export type YearEndPlanRow = { leaveType: LeaveTypeRef; rule: string; unused: number; carry: number; encash: number; lapse: number; amount: number; employees: number };
export type YearEndClosing = {
  id: string; closingYearStart: string; openingYearStart: string; status: string; encashmentTarget: string; emailStatements: boolean;
  employeesCount: number | null; daysCarried: number; daysEncashed: number; daysLapsed: number; encashAmount: number;
  completedAt: string | null; completedBy: Who | null; createdAt: string; rowVersion: number;
};
export type YearEndView = {
  closingYearStart: string; openingYearStart: string; employees: number; rows: YearEndPlanRow[];
  totals: { unused: number; carry: number; encash: number; lapse: number; amount: number };
  closings: YearEndClosing[];
  /** The completed close of this year, if any. */
  closed: YearEndClosing | null;
};

/** My Profile › Leave. */
export type MyLeave = {
  employee: EmpRef; today: string; yearStart: string; yearEnd: string;
  balances: { leaveType: LeaveBalanceType; figures: LeaveBalanceFigures; note: string }[];
  requests: LeaveRequestItem[];
  team: { name: string; fromDate: string; toDate: string; leaveType: string; status: string; me: boolean }[];
  holidays: { date: string; name: string }[];
  /** Approval route of a typical request ("Zainab Raza", "HR"). */
  route: string;
  policy: { leaveType: LeaveBalanceType; lines: string[] }[];
};

export const LeaveAdjustmentSchema = z.object({
  employeeId: z.uuid('Choose an employee'),
  leaveTypeId: z.uuid('Choose a leave type'),
  kind: z.enum(LEAVE_ADJUSTMENT_KINDS).default('MANUAL'),
  direction: z.enum(['CREDIT', 'DEBIT']),
  days: z.coerce.number().positive('More than 0').max(365, 'At most 365').refine((n) => Math.round(n * 100) === n * 100, 'At most 2 decimals'),
  effectiveDate: z.iso.date('Use a date'),
  reason: z.string().trim().min(3, 'Give a reason for the audit trail').max(500),
  overtimeClaimId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
}).superRefine((a, ctx) => {
  if (a.kind !== 'MANUAL' && a.direction !== 'CREDIT') ctx.addIssue({ code: 'custom', path: ['direction'], message: 'An opening or comp-off adjustment is a credit' });
  if (a.kind === 'COMP_OFF' && !a.overtimeClaimId) ctx.addIssue({ code: 'custom', path: ['overtimeClaimId'], message: 'Choose the approved comp-off overtime claim' });
});
export type LeaveAdjustmentInput = z.infer<typeof LeaveAdjustmentSchema>;

const year = z.string().regex(/^\d{4}-\d{2}-01$/, 'Use the leave year start (YYYY-MM-01)');
export const LeaveBalanceQuerySchema = z.object({
  year: year.optional(), search: z.string().trim().max(100).optional(),
  departmentId: z.uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  filter: z.enum(['ALL', 'LOW', 'NEGATIVE']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type LeaveBalanceQuery = z.infer<typeof LeaveBalanceQuerySchema>;
export const LeaveAdjustmentQuerySchema = z.object({ employeeId: z.uuid().optional(), leaveTypeId: z.uuid().optional(), year: year.optional() });
export const LeaveAccrueQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'), employeeId: z.uuid().optional() });
export const LeaveYearQuerySchema = z.object({ year: year.optional() });
export const LeaveYearEndCloseSchema = z.object({
  encashmentTarget: z.enum(['NEXT_PAYROLL', 'OFF_CYCLE']).default('NEXT_PAYROLL'),
  emailStatements: z.boolean().default(true),
});
export const LeaveYearEndReverseSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300), rowVersion: z.coerce.number().int().min(0) });
