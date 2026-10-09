import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import type { ApprovalDetail } from '../finance/gl.ts';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';
import { CNIC_PATTERN } from './people.ts';

/**
 * Phase 33 (talent): recruitment. Job requisitions (REQ-) are approved through the JOB_REQUISITION workflow, then open
 * for candidates; candidates move APPLIED → SCREENING → INTERVIEW → OFFER and are hired (employee + onboarding, one
 * transaction) or rejected. Stage changes only through move / reject / hire.
 */
export const RECRUITMENT_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const;
/** Stages a candidate can be moved to by hand (HIRED / REJECTED have their own actions). */
export const RECRUITMENT_MOVE_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'] as const;
export const RECRUITMENT_CHANNELS = ['ROZEE', 'LINKEDIN', 'CAREERS', 'REFERRAL', 'WALK_IN', 'AGENCY'] as const;
/** Activities logged by hand (stage changes, offers and rejections are logged by their actions). */
export const RECRUITMENT_NOTE_KINDS = ['NOTE', 'PHONE_SCREEN', 'ASSESSMENT', 'INTERVIEW', 'PANEL_INTERVIEW', 'EMAIL'] as const;

type Who = { id: string; name: string };
export type RecruitmentStageCounts = { applied: number; screening: number; interview: number; offer: number; hired: number; rejected: number; total: number };
export type RecruitmentOpening = {
  id: string; docNo: string; title: string; designation: { id: string; title: string } | null; department: { id: string; name: string };
  branch: { id: string; name: string }; openings: number; requisitionType: string; replaces: Who | null; hiringMode: string; hiringManager: Who | null;
  priority: string; salaryMin: number | null; salaryMax: number | null; jobDescription: string | null; postedChannels: string[]; postedOn: string | null;
  targetHireDate: string | null; status: string; closedOn: string | null; createdAt: string; counts: RecruitmentStageCounts; rowVersion: number;
};
export type RecruitmentOpeningDetail = RecruitmentOpening & {
  approval: ApprovalDetail | null;
  /** The viewer can approve / return it now (engine step, or HR deciding directly when no workflow applies). */
  canApprove: boolean;
  waitingOn: string | null;
};
export type RecruitmentActivity = {
  id: string; activityType: string; occurredAt: string; scheduledAt: string | null; by: Who | null; panelNote: string | null;
  fromStage: string | null; toStage: string | null; scorePct: number | null; rating: number | null; summary: string | null; notes: string | null;
  createdBy: Who | null;
};
export type RecruitmentCandidate = {
  id: string; opening: { id: string; docNo: string; title: string; status: string }; fullName: string; email: string | null; phone: string | null; cnic: string | null;
  headline: string | null; currentEmployer: string | null; currentTitle: string | null; experienceYears: number | null; education: string | null;
  source: string; referredBy: Who | null; appliedOn: string; stage: string; currentSalary: number | null; expectedSalary: number | null; noticeDays: number | null;
  rating: number | null; nextInterviewAt: string | null; offeredSalary: number | null; offerStatus: string | null; offerSentOn: string | null;
  hiredEmployee: { id: string; code: string; name: string } | null; onboarding: { id: string; docNo: string; status: string } | null;
  rejectionReason: string | null; rowVersion: number;
};
export type RecruitmentCandidateDetail = RecruitmentCandidate & { activities: RecruitmentActivity[]; reviewers: number; avgScore: number | null };
export type RecruitmentOverview = {
  today: string;
  kpis: {
    openPositions: number; vacancies: number; branches: number; activeApplicants: number; appliedThisWeek: number;
    /** Days from posting (or approval) to the hire date, averaged over hires this fiscal year. */
    avgTimeToHire: number | null; offersMade: number; offersAccepted: number;
  };
  counts: Record<string, number>;
  openings: RecruitmentOpening[];
};
export type RecruitmentOptions = {
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  designations: { id: string; title: string; departmentId: string | null }[];
  grades: { id: string; name: string }[];
  employees: (EmpRef & { status: string })[];
  templates: { id: string; name: string; isDefault: boolean }[];
};

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalMoney = z.coerce.number('Enter an amount').min(0, 'Not negative').max(100_000_000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalEmail = z.email('Like name@mail.com').max(120).optional().nullable().or(z.literal('')).transform((v) => (v ? v.toLowerCase() : null));
const optionalPhone = z.string().trim().regex(/^\+?[0-9][0-9 -]{6,18}$/, 'Like +92 300 1234567').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const issues = (fn: (x: never) => Record<string, string>) => (x: unknown, ctx: z.RefinementCtx) => {
  for (const [path, message] of Object.entries(fn(x as never))) ctx.addIssue({ code: 'custom', path: [path], message });
};

// ---------------------------------------------------------------- requisitions
const OpeningFields = {
  title: z.string().trim().min(2, 'Name the position').max(120),
  designationId: optionalId,
  departmentId: z.uuid('Choose the department'),
  branchId: z.uuid('Choose the location'),
  openings: z.coerce.number().int('Whole number').min(1, '1 to 500').max(500, '1 to 500').default(1),
  requisitionType: z.enum(['NEW', 'REPLACEMENT']).default('NEW'),
  replacesEmployeeId: optionalId,
  hiringMode: z.string().trim().min(1).max(30).default('STANDARD'),
  hiringManagerEmployeeId: optionalId,
  priority: z.enum(['NORMAL', 'URGENT']).default('NORMAL'),
  salaryMin: optionalMoney,
  salaryMax: optionalMoney,
  jobDescription: optionalText(4000),
  postedChannels: z.array(z.enum(RECRUITMENT_CHANNELS)).max(6).default([]),
  targetHireDate: optionalDate,
};
type OpeningShape = { requisitionType?: string; replacesEmployeeId?: string | null; salaryMin?: number | null; salaryMax?: number | null };
/** A replacement names who is replaced; the salary band is in order (as the DB checks). */
export function recruitmentOpeningErrors(o: OpeningShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (o.requisitionType === 'REPLACEMENT' && !o.replacesEmployeeId) e.replacesEmployeeId = 'Choose who is being replaced';
  if (o.salaryMin != null && o.salaryMax != null && o.salaryMax < o.salaryMin) e.salaryMax = 'At least the minimum';
  return e;
}
export const RecruitmentOpeningCreateSchema = z.object(OpeningFields).superRefine(issues(recruitmentOpeningErrors));
export type RecruitmentOpeningCreate = z.infer<typeof RecruitmentOpeningCreateSchema>;
export const RecruitmentOpeningUpdateSchema = patchFields(OpeningFields).extend(RowVersionSchema.shape);
export type RecruitmentOpeningUpdate = z.infer<typeof RecruitmentOpeningUpdateSchema>;
export const RECRUITMENT_OPENING_ACTIONS = ['submit', 'approve', 'return', 'open', 'hold', 'close', 'cancel'] as const;
export type RecruitmentOpeningAction = (typeof RECRUITMENT_OPENING_ACTIONS)[number];
export const RecruitmentOpeningActionSchema = RowVersionSchema.extend({
  /** open: the channels it is posted on (omitted: unchanged). */
  channels: z.array(z.enum(RECRUITMENT_CHANNELS)).max(6).optional(),
  reason: optionalText(300),
});
export type RecruitmentOpeningActionInput = z.infer<typeof RecruitmentOpeningActionSchema>;
export const RecruitmentOpeningQuerySchema = z.object({ status: z.string().trim().max(30).optional() });

// ---------------------------------------------------------------- candidates
const CandidateFields = {
  fullName: z.string().trim().min(2, 'Enter the name').max(120),
  email: optionalEmail,
  phone: optionalPhone,
  cnic: z.string().trim().regex(CNIC_PATTERN, 'Like 35202-1234567-1').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  headline: optionalText(160),
  currentEmployer: optionalText(120),
  currentTitle: optionalText(120),
  experienceYears: z.coerce.number().min(0, 'Not negative').max(60, 'Up to 60').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  education: optionalText(160),
  source: z.enum(RECRUITMENT_CHANNELS).default('CAREERS'),
  referredByEmployeeId: optionalId,
  appliedOn: optionalDate,
  currentSalary: optionalMoney,
  expectedSalary: optionalMoney,
  noticeDays: z.coerce.number().int('Whole days').min(0).max(365, 'Up to 365').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  rating: z.coerce.number().min(1, '1 to 5').max(5, '1 to 5').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  nextInterviewAt: z.iso.datetime({ offset: true, local: true, message: 'Use a date and time' }).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
};
type CandidateShape = { email?: string | null; phone?: string | null; source?: string; referredByEmployeeId?: string | null };
export function recruitmentCandidateErrors(c: CandidateShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.email === null && c.phone === null) e.email = 'Enter an email or a phone';
  if (c.source === 'REFERRAL' && !c.referredByEmployeeId) e.referredByEmployeeId = 'Choose who referred them';
  return e;
}
export const RecruitmentCandidateCreateSchema = z.object({ jobRequisitionId: z.uuid('Choose the opening'), ...CandidateFields }).superRefine(issues(recruitmentCandidateErrors));
export type RecruitmentCandidateCreate = z.infer<typeof RecruitmentCandidateCreateSchema>;
export const RecruitmentCandidateUpdateSchema = patchFields(CandidateFields).extend(RowVersionSchema.shape);
export type RecruitmentCandidateUpdate = z.infer<typeof RecruitmentCandidateUpdateSchema>;
export const RecruitmentCandidateQuerySchema = z.object({ openingId: z.uuid().optional(), stage: z.string().trim().max(20).optional(), search: z.string().trim().max(100).optional() });
export type RecruitmentCandidateQuery = z.infer<typeof RecruitmentCandidateQuerySchema>;

export const RecruitmentMoveSchema = RowVersionSchema.extend({
  toStage: z.enum(RECRUITMENT_MOVE_STAGES),
  note: optionalText(1000),
  offeredSalary: optionalMoney,
});
export type RecruitmentMove = z.infer<typeof RecruitmentMoveSchema>;
export const RecruitmentRejectSchema = RowVersionSchema.extend({ reason: optionalText(500), declined: z.boolean().default(false) });
export type RecruitmentReject = z.infer<typeof RecruitmentRejectSchema>;
export const RecruitmentActivitySchema = z.object({
  activityType: z.enum(RECRUITMENT_NOTE_KINDS).default('NOTE'),
  occurredAt: z.iso.datetime({ offset: true, local: true }).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  scheduledAt: z.iso.datetime({ offset: true, local: true, message: 'Use a date and time' }).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  byEmployeeId: optionalId,
  panelNote: optionalText(300),
  scorePct: z.coerce.number().min(0, '0 to 100').max(100, '0 to 100').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  rating: z.coerce.number().int().min(1, '1 to 5').max(5, '1 to 5').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  summary: z.string().trim().min(2, 'Describe it').max(200),
  notes: optionalText(2000),
});
export type RecruitmentActivityInput = z.infer<typeof RecruitmentActivitySchema>;

/** Hire: the employee's Phase 11 joining details (the rest is edited on the employee later) and the onboarding template. */
export const RecruitmentHireSchema = RowVersionSchema.extend({
  firstName: z.string().trim().min(1, 'Enter the first name').max(60),
  lastName: z.string().trim().min(1, 'Enter the last name').max(60),
  guardianName: z.string().trim().min(2, 'Enter the father / husband name').max(120),
  cnic: z.string().trim().regex(CNIC_PATTERN, 'Like 35202-1234567-1'),
  dateOfBirth: z.iso.date('Use a date'),
  gender: z.string().trim().min(1, 'Choose the gender').max(20),
  mobile: z.string().trim().regex(/^\+?[0-9][0-9 -]{6,18}$/, 'Like +92 300 1234567'),
  personalEmail: optionalEmail,
  joiningDate: z.iso.date('Use a date'),
  designationId: z.uuid('Choose the designation'),
  gradeId: optionalId,
  reportingManagerId: optionalId,
  employmentType: z.string().trim().min(1, 'Choose the employment type').max(20).default('PERMANENT'),
  probationMonths: z.coerce.number().int('Whole months').min(0, '0 to 24').max(24, '0 to 24').default(3),
  offeredSalary: z.coerce.number('Enter the salary').min(1, 'Enter the salary').max(100_000_000),
  templateId: optionalId,
  buddyEmployeeId: optionalId,
}).superRefine((h, ctx) => {
  if (h.dateOfBirth >= h.joiningDate) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Must be before the joining date' });
});
export type RecruitmentHire = z.infer<typeof RecruitmentHireSchema>;
export type RecruitmentHireResult = { candidate: RecruitmentCandidateDetail; employee: { id: string; code: string; name: string }; onboarding: { id: string; docNo: string } };
