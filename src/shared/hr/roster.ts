import { z } from 'zod';
import type { ApprovalDetail } from '../finance/gl.ts';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';

/** Phase 30: weekly duty rosters, shift swaps and open shifts (HR › Shifts & Roster, My Profile › Shifts). */
export type RosterShift = { id: string; code: string; name: string; startTime: string; endTime: string; colour: string; scheduledHours: number };
export type RosterCell = { id: string; entryType: string; shiftId: string | null; isPublished: boolean; remarks: string | null; rowVersion: number };
export type RosterWeek = {
  weekStart: string; days: string[]; shifts: RosterShift[];
  rows: { employee: EmpRef; cells: Record<string, RosterCell>; hours: number }[];
  unpublished: number; published: number;
  coverage: Record<string, number>;
};

/** The Monday of the week a date falls in (YYYY-MM-DD). */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export type SwapItem = {
  id: string; docNo: string; docDate: string; requester: EmpRef; counterpart: EmpRef; swapDate: string; swapMode: string;
  requesterShift: { id: string; code: string; name: string; startTime: string; endTime: string } | null;
  counterpartShift: { id: string; code: string; name: string; startTime: string; endTime: string } | null;
  reasonCategory: string; reason: string | null; noteToCounterpart: string | null; status: string; acceptedAt: string | null;
  decidedBy: { id: string; name: string } | null; decidedAt: string | null; decisionReason: string | null; createdAt: string; rowVersion: number;
  approval: ApprovalDetail | null; canAct: boolean;
};
export type OpenShiftItem = {
  id: string; code: string; shiftDate: string; shift: { id: string; code: string; name: string; startTime: string; endTime: string; scheduledHours: number };
  branch: { id: string; name: string } | null; department: { id: string; name: string } | null; title: string; perkText: string | null;
  allowanceAmount: number | null; overtimeMultiplier: number | null; slotsTotal: number; slotsTaken: number; status: string; rowVersion: number;
  claims: { id: string; employee: EmpRef; claimedAt: string; status: string; decidedAt: string | null; rowVersion: number }[];
  myClaim: { id: string; status: string } | null;
};
export type MyShifts = {
  employee: EmpRef; today: string; roster: RosterWeek; myId: string;
  todayShift: { code: string; name: string; startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null } | null;
  nextShift: { date: string; startTime: string } | null; firstIn: string | null;
  week: { scheduledHours: number; workedHours: number; overtimeMinutes: number; restDays: string[]; swapsThisMonth: number };
  swaps: SwapItem[]; toAnswer: SwapItem[]; toApprove: SwapItem[]; openShifts: OpenShiftItem[]; peers: { employee: EmpRef; entries: Record<string, { entryType: string; shiftId: string | null }> }[];
  approver: string | null;
};

const date = z.iso.date('Use a date');
export const RosterEntrySchema = z.object({
  employeeId: z.uuid(), date,
  /** null removes the day (only while unpublished). */
  entryType: z.enum(['SHIFT', 'OFF', 'LEAVE']).nullable(),
  shiftId: z.uuid().optional().nullable().transform((v) => v ?? null),
  remarks: optionalText(200),
}).superRefine((e, ctx) => {
  if (e.entryType === 'SHIFT' && !e.shiftId) ctx.addIssue({ code: 'custom', path: ['shiftId'], message: 'Choose the shift' });
});
export const RosterSaveSchema = z.object({
  entries: z.array(RosterEntrySchema).min(1).max(1000),
  /** Required to change a published day: the changed days go back to draft until the week is published again. */
  republish: z.boolean().default(false),
});
export type RosterSave = z.infer<typeof RosterSaveSchema>;
export const WeekQuerySchema = z.object({ week: date, department: z.uuid().optional(), branch: z.uuid().optional() });
export const PublishSchema = z.object({ department: z.uuid().optional() });

export const SWAP_REASONS = ['FAMILY_EVENT', 'MEDICAL_APPOINTMENT', 'CLIENT_VISIT', 'TRAINING', 'PERSONAL'] as const;
export const SwapSchema = z.object({
  swapDate: date,
  counterpartEmployeeId: z.uuid('Choose a colleague'),
  reasonCategory: z.enum(SWAP_REASONS, 'Choose a reason'),
  reason: optionalText(300),
  noteToCounterpart: optionalText(300),
});
export type SwapInput = z.infer<typeof SwapSchema>;
export const SwapReasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

export const OpenShiftSchema = z.object({
  shiftDate: date,
  shiftId: z.uuid('Choose the shift'),
  branchId: z.uuid().optional().nullable().transform((v) => v ?? null),
  departmentId: z.uuid().optional().nullable().transform((v) => v ?? null),
  title: z.string().trim().min(3, 'Give a title').max(120),
  perkText: optionalText(120),
  allowanceAmount: z.coerce.number().min(0).max(10_000_000).optional().nullable().transform((v) => v ?? null),
  overtimeMultiplier: z.coerce.number().min(1).max(5).optional().nullable().transform((v) => v ?? null),
  slotsTotal: z.coerce.number().int().min(1, 'At least one slot').max(100),
});
export type OpenShiftInput = z.infer<typeof OpenShiftSchema>;
