import { z } from 'zod';
import type { ApprovalDetail } from '../finance/gl.ts';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef, PunchItem } from './attendance.ts';

/** Phase 30: regularisation requests (missed punch, late arrival, on duty, WFH, early leaving): ESS → line manager → HR. */
export const REGULARISATION_TYPES = ['MISSED_PUNCH', 'LATE_ARRIVAL', 'ON_DUTY', 'WFH', 'EARLY_LEAVING'] as const;
export const REGULARISATION_REJECT_REASONS = ['INSUFFICIENT_EVIDENCE', 'EXCEEDED_MONTHLY_LIMIT', 'DEVICE_LOGS_CONTRADICT', 'NO_GPS_EVIDENCE', 'DUPLICATE', 'OTHER'] as const;

export type RegularisationItem = {
  id: string; docNo: string; employee: EmpRef; requestType: string; punchDirection: string | null; attDate: string;
  requestedIn: string | null; requestedOut: string | null; reason: string; channel: string; submittedAt: string;
  status: string; stage: string; decidedBy: { id: string; name: string } | null; decidedAt: string | null;
  rejectionReason: string | null; decisionComment: string | null; markAbsentIfUnresolved: boolean; rowVersion: number;
  /** The current approval step's approver names (pending requests). */
  waitingOn: string | null;
};
export type RegularisationList = {
  items: RegularisationItem[]; total: number; counts: Record<string, number>;
  kpis: { pending: number; pendingOld: number; approvedMonth: number; rejectedMonth: number; avgTurnaroundHours: number | null; topType: string | null; topTypePct: number | null };
};
export type RegularisationDetail = RegularisationItem & {
  shift: { code: string; name: string; startTime: string; endTime: string } | null;
  punches: PunchItem[]; requestsThisMonth: number; approval: ApprovalDetail | null; canAct: boolean;
};

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const optionalTime = time.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const fields = {
  requestType: z.enum(REGULARISATION_TYPES, 'Choose what happened'),
  punchDirection: z.enum(['IN', 'OUT', 'BOTH']).optional().nullable().transform((v) => v ?? null),
  attDate: z.iso.date('Use a date'),
  requestedIn: optionalTime,
  requestedOut: optionalTime,
  reason: z.string().trim().min(3, 'Give a reason for your manager').max(500),
};
/** The cross-field rules (the database's own CHECKs, said in words). */
export function regularisationErrors(r: { requestType: string; punchDirection: string | null; requestedIn: string | null; requestedOut: string | null }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.requestedIn && !r.requestedOut) e.requestedIn = 'Give the actual check-in or check-out time';
  if (r.requestType === 'MISSED_PUNCH') {
    if (!r.punchDirection) e.punchDirection = 'Which punch was missed?';
    else if ((r.punchDirection === 'IN' || r.punchDirection === 'BOTH') && !r.requestedIn) e.requestedIn = 'Give the check-in time';
    else if ((r.punchDirection === 'OUT' || r.punchDirection === 'BOTH') && !r.requestedOut) e.requestedOut = 'Give the check-out time';
  }
  if (r.requestType === 'LATE_ARRIVAL' && !r.requestedIn) e.requestedIn = 'Give the time you arrived';
  if (r.requestType === 'EARLY_LEAVING' && !r.requestedOut) e.requestedOut = 'Give the time you left';
  return e;
}
const refine = (r: { requestType?: string; punchDirection?: string | null; requestedIn?: string | null; requestedOut?: string | null }, ctx: z.RefinementCtx) => {
  if (!r.requestType) return;
  for (const [k, m] of Object.entries(regularisationErrors({ requestType: r.requestType, punchDirection: r.punchDirection ?? null, requestedIn: r.requestedIn ?? null, requestedOut: r.requestedOut ?? null }))) ctx.addIssue({ code: 'custom', path: [k], message: m });
};
export const RegularisationSchema = z.object(fields).superRefine(refine);
export type RegularisationInput = z.infer<typeof RegularisationSchema>;
export const RegularisationUpdateSchema = z.object(fields).partial().extend({ rowVersion: z.coerce.number().int().min(0) });
export type RegularisationUpdate = z.infer<typeof RegularisationUpdateSchema>;
export const RegularisationRejectSchema = z.object({
  reason: z.enum(REGULARISATION_REJECT_REASONS, 'Choose a reason'),
  comment: optionalText(500),
  markAbsentIfUnresolved: z.boolean().default(false),
});
export const RegularisationQuerySchema = z.object({
  status: z.string().trim().max(20).optional(), type: z.string().trim().max(20).optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const DecisionSchema = z.object({ comment: optionalText(500) });
export const ApproveManySchema = z.object({ ids: z.array(z.uuid()).min(1).max(100) });
