import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';
import type { Who } from './leave-request.ts';

/**
 * Phase 31: offboardings (OFF-): resignation / termination, notice, clearance by area and the exit interview. Completing
 * an exit needs every clearance item cleared or waived; it marks the employee EXITED and suspends their login (never the
 * company's default user). The final settlement is Phase 33.
 */
export const EXIT_TYPES = ['RESIGNATION', 'TERMINATION', 'CONTRACT_END', 'RETIREMENT', 'DEATH', 'ABSCONDED'] as const;
export const OFFBOARDING_REASONS = ['BETTER_OPPORTUNITY', 'COMPENSATION', 'RELOCATION', 'HIGHER_STUDIES', 'MANAGER_CULTURE', 'MISCONDUCT', 'CONTRACT_END', 'HEALTH', 'PERSONAL', 'OTHER'] as const;
export const EXIT_PRIMARY_REASONS = ['BETTER_OPPORTUNITY', 'COMPENSATION', 'RELOCATION', 'HIGHER_STUDIES', 'MANAGER_CULTURE', 'HEALTH', 'PERSONAL', 'OTHER'] as const;
/** The four areas of the template's "Clearance by department", created for every exit. */
export const DEFAULT_CLEARANCE: { area: string; description: string }[] = [
  { area: 'IT', description: 'Assets & access revocation' },
  { area: 'ADMINISTRATION', description: 'ID card, keys, SIM, vehicle' },
  { area: 'FINANCE', description: 'Loans, advances, claims' },
  { area: 'LINE_MANAGER', description: 'Knowledge handover' },
];

export type ClearanceItemView = {
  id: string; clearanceArea: string; description: string; owner: Who | null; recoverableAmount: number | null; status: string;
  clearedAt: string | null; clearedBy: Who | null; remarks: string | null; rowVersion: number;
};
export type ExitInterviewView = {
  id: string; interviewDate: string; conductedBy: Who | null; primaryReason: string; wouldRejoin: string | null; roleSatisfaction: number | null;
  managerSatisfaction: number | null; compensationFairness: number | null; wouldRecommend: boolean | null; valuedMost: string | null;
  shouldImprove: string | null; eligibleForRehire: boolean; isConfidential: boolean; rowVersion: number;
};
export type OffboardingItem = {
  id: string; docNo: string; employee: EmpRef & { status: string }; exitType: string; resignationDate: string | null; lastWorkingDay: string;
  noticeDaysRequired: number; noticeDaysServed: number | null; noticeWaived: boolean; reasonCategory: string; reasonDetail: string | null;
  isVoluntary: boolean; status: string; closedAt: string | null; remarks: string | null; clearanceDone: number; clearanceTotal: number;
  hasInterview: boolean; createdAt: string; rowVersion: number;
};
export type OffboardingDetail = OffboardingItem & { clearance: ClearanceItemView[]; interview: ExitInterviewView | null; appUser: { id: string; email: string; status: string; isDefault: boolean } | null };
export type OffboardingBoard = {
  today: string; fyStart: string;
  items: OffboardingItem[];
  kpis: { exitsFy: number; voluntaryFy: number; servingNotice: number; lastDaysNote: string | null; attritionPct: number | null; pendingSettlements: number };
  reasons: { reason: string; count: number }[];
  clearanceByArea: { area: string; pending: number; cleared: number }[];
};
export type OffboardingOptions = { employees: { id: string; code: string; name: string; noticeDays: number; hasOpen: boolean; status: string }[] };

const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => v || null);
const fields = {
  exitType: z.enum(EXIT_TYPES, 'Choose the exit type'),
  resignationDate: optionalDate,
  lastWorkingDay: z.iso.date('Give the last working day'),
  noticeDaysRequired: z.coerce.number().int().min(0).max(365).optional(),
  noticeDaysServed: z.coerce.number().int().min(0).max(365).optional().nullable(),
  noticeWaived: z.boolean().default(false),
  reasonCategory: z.enum(OFFBOARDING_REASONS, 'Choose a reason'),
  reasonDetail: optionalText(300),
  isVoluntary: z.boolean().default(true),
  remarks: optionalText(500),
};
const dates = (o: { exitType?: string; resignationDate?: string | null; lastWorkingDay?: string }, ctx: z.RefinementCtx) => {
  if (o.exitType === 'RESIGNATION' && !o.resignationDate) ctx.addIssue({ code: 'custom', path: ['resignationDate'], message: 'Give the resignation date' });
  if (o.resignationDate && o.lastWorkingDay && o.lastWorkingDay < o.resignationDate) ctx.addIssue({ code: 'custom', path: ['lastWorkingDay'], message: 'Not before the resignation date' });
};
export const OffboardingCreateSchema = z.object({ employeeId: z.uuid('Choose the employee'), ...fields }).superRefine(dates);
export type OffboardingCreate = z.infer<typeof OffboardingCreateSchema>;
export const OffboardingUpdateSchema = z.object({
  ...fields, status: z.enum(['SERVING_NOTICE', 'RETENTION_TALK', 'SETTLEMENT']).optional(), rowVersion: z.coerce.number().int().min(0),
}).partial({ exitType: true, lastWorkingDay: true, reasonCategory: true, noticeWaived: true, isVoluntary: true }).superRefine(dates);
export type OffboardingUpdate = z.infer<typeof OffboardingUpdateSchema>;
const score = z.coerce.number().int().min(1).max(5).optional().nullable();
export const ExitInterviewSchema = z.object({
  interviewDate: z.iso.date('Use a date'),
  conductedByEmployeeId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  primaryReason: z.enum(EXIT_PRIMARY_REASONS, 'Choose the primary reason'),
  wouldRejoin: z.enum(['YES', 'MAYBE', 'NO']).optional().nullable(),
  roleSatisfaction: score, managerSatisfaction: score, compensationFairness: score,
  wouldRecommend: z.boolean().optional().nullable(),
  valuedMost: optionalText(1000), shouldImprove: optionalText(1000),
  eligibleForRehire: z.boolean().default(true), isConfidential: z.boolean().default(false),
  rowVersion: z.coerce.number().int().min(0),
});
export type ExitInterviewInput = z.infer<typeof ExitInterviewSchema>;
export const ClearanceDecisionSchema = z.object({ remarks: optionalText(300) });
export const OffboardingWithdrawSchema = z.object({ reason: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export const OffboardingQuerySchema = z.object({ status: z.enum(['OPEN', 'CLOSED', 'WITHDRAWN', 'ALL']).default('ALL') });
