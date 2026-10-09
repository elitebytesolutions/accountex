import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';
import type { PerformanceCycle } from './talent.ts';

/**
 * Phase 33 (talent): performance. One review per employee and cycle moving SELF_PENDING → AWAITING_MANAGER → REVIEWED →
 * CALIBRATED → SIGNED_OFF (only through submit-self / submit-manager / calibrate / sign-off), goals (KRA / OKR) with key
 * results, competency ratings (self / manager), feedback (requested or given) and 1:1 meetings. My Goals is the
 * employee's own view (My Profile).
 */
export const PERF_REVIEW_STAGES = ['SELF_PENDING', 'AWAITING_MANAGER', 'REVIEWED', 'CALIBRATED', 'SIGNED_OFF'] as const;
export const PERF_BANDS = ['LOW', 'MODERATE', 'HIGH'] as const;
/** The 9-box cells in the template's order (rows: potential high → low; columns: performance low → high). */
export const PERF_NINE_BOX = [
  ['ENIGMA', 'Enigma', 'High potential · Low performance'],
  ['GROWTH_EMPLOYEE', 'Growth Employee', 'High potential · Moderate performance'],
  ['FUTURE_LEADER', 'Future Leader ★', 'High potential · High performance'],
  ['INCONSISTENT_PLAYER', 'Inconsistent Player', 'Moderate potential · Low performance'],
  ['CORE_PLAYER', 'Core Player', 'Moderate potential · Moderate performance'],
  ['HIGH_PERFORMER', 'High Performer', 'Moderate potential · High performance'],
  ['RISK', 'Risk', 'Low potential · Low performance — PIP review'],
  ['EFFECTIVE_EMPLOYEE', 'Effective Employee', 'Low potential · Moderate performance'],
  ['TRUSTED_PROFESSIONAL', 'Trusted Professional', 'Low potential · High performance'],
] as const;
/** Competencies rated in a review when the company has none of its own (the template's five). */
export const PERF_DEFAULT_COMPETENCIES = [
  ['Customer focus', 'Understands and anticipates customer needs'],
  ['Execution', 'Plans, prioritises and delivers on commitments'],
  ['Teamwork', 'Collaborates, shares knowledge and supports colleagues'],
  ['Communication', 'Clear, timely updates to manager and peers'],
  ['Ownership', 'Follows through without being chased'],
] as const;
/** Goal status from progress against the share of the period elapsed (the ESS template's thresholds). */
export function perfGoalStatus(progressPct: number, expectedPct: number): 'ACHIEVED' | 'ON_TRACK' | 'NEEDS_FOCUS' | 'AT_RISK' | 'NOT_STARTED' {
  if (progressPct >= 100) return 'ACHIEVED';
  if (progressPct <= 0) return 'NOT_STARTED';
  const gap = progressPct - expectedPct;
  return gap >= -15 ? 'ON_TRACK' : gap >= -30 ? 'NEEDS_FOCUS' : 'AT_RISK';
}
/** Progress of a key result from its start / target / current values (clamped 0–100), or its stored percent. */
export function perfKeyResultProgress(k: { startValue: number | null; targetValue: number | null; currentValue: number | null; progressPct: number }) {
  if (k.targetValue == null || k.currentValue == null) return k.progressPct;
  const start = k.startValue ?? 0;
  if (k.targetValue === start) return k.currentValue >= k.targetValue ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((k.currentValue - start) / (k.targetValue - start)) * 100)));
}
/** A goal's progress: the weighted average of its key results (equal weights when none are set). */
export function perfGoalProgress(krs: { weightPct: number | null; progressPct: number }[], own: number) {
  if (!krs.length) return own;
  const total = krs.reduce((s, k) => s + (k.weightPct ?? 1), 0);
  return Math.round(krs.reduce((s, k) => s + k.progressPct * (k.weightPct ?? 1), 0) / total);
}

type Who = { id: string; name: string };
export type PerfKeyResult = {
  id: string; title: string; weightPct: number | null; unit: string | null; startValue: number | null; targetValue: number | null;
  currentValue: number | null; progressPct: number; sortOrder: number;
};
export type PerfGoal = {
  id: string; employee: Who; cycleId: string | null; performanceReviewId: string | null; goalKind: string; title: string; description: string | null;
  weightPct: number; unit: string | null; targetValue: number | null; actualValue: number | null; progressPct: number; status: string; sortOrder: number;
  keyResults: PerfKeyResult[]; rowVersion: number;
};
export type PerfCompetency = { id: string; competency: string; competencyDescription: string | null; raterRole: string; rating: number; evidence: string | null };
export type PerfReviewItem = {
  id: string; cycleId: string; employee: EmpRef; manager: Who | null; goalAchievementPct: number | null; goals: number;
  selfRating: number | null; managerRating: number | null; finalRating: number | null; ratingLabel: string | null;
  performanceBand: string | null; potentialBand: string | null; nineBox: string | null; pipSuggested: boolean; stage: string;
  selfComment: string | null; managerComment: string | null; selfSubmittedAt: string | null; managerSubmittedAt: string | null;
  calibratedAt: string | null; signedOffAt: string | null; incrementPctRecommended: number | null; rowVersion: number;
};
export type PerfReviewDetail = PerfReviewItem & { goalsList: PerfGoal[]; competencies: PerfCompetency[] };
export type PerfFeedback = {
  id: string; to: Who; from: Who; requestedBy: Who | null; relationship: string | null; tag: string | null; body: string | null; cycleId: string | null;
  status: string; requestedAt: string | null; givenAt: string | null; rowVersion: number;
};
export type PerfActionItem = { text: string; done: boolean };
export type PerfOneOnOne = {
  id: string; employee: Who; manager: Who; meetingDate: string; topic: string; notes: string | null; actionItems: PerfActionItem[]; cycleId: string | null; rowVersion: number;
};
export type PerfBoard = {
  cycles: PerformanceCycle[];
  cycle: PerformanceCycle | null;
  kpis: { eligible: number; selfSubmitted: number; managerSubmitted: number; avgRating: number | null; goalsOnTrack: number; goalsTotal: number; previousAvg: number | null };
  stageProgress: Record<string, number>;
  reviews: PerfReviewItem[];
  total: number;
  counts: Record<string, number>;
  nineBox: { box: string; count: number; names: string[] }[];
  departments: { id: string; name: string }[];
};
export type PerfOptions = { employees: (EmpRef & { managerId: string | null })[] };
export type MyGoals = {
  employee: Who & { designation: string | null };
  manager: (Who & { designation: string | null }) | null;
  cycle: PerformanceCycle | null;
  /** Share of the cycle's period elapsed today (0–100). */
  expectedPct: number;
  review: PerfReviewDetail | null;
  goals: PerfGoal[];
  oneOnOnes: PerfOneOnOne[];
  feedbackReceived: PerfFeedback[];
  /** Requests waiting for my answer. */
  feedbackToGive: PerfFeedback[];
  /** Reviews where I am the manager and it's my turn. */
  teamReviews: PerfReviewItem[];
  colleagues: (Who & { designation: string | null; department: string | null })[];
  competencies: { competency: string; description: string }[];
};

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalNumber = z.coerce.number('Enter a number').min(-1e12).max(1e12).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalPct = z.coerce.number().min(0, '0 to 100').max(100, '0 to 100').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const rating = z.coerce.number('Rate 1 to 5').min(1, '1 to 5').max(5, '1 to 5');

// ---------------------------------------------------------------- goals
export const PerfKeyResultSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(2, 'Describe the key result').max(200),
  weightPct: z.coerce.number().min(1, '1 to 100').max(100, '1 to 100').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  unit: z.string().trim().max(20).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  startValue: optionalNumber,
  targetValue: optionalNumber,
  currentValue: optionalNumber,
  progressPct: z.coerce.number().min(0, '0 to 100').max(100, '0 to 100').default(0),
});
const GoalFields = {
  cycleId: optionalId,
  goalKind: z.enum(['KRA', 'OKR']).default('KRA'),
  title: z.string().trim().min(2, 'Name the goal').max(200),
  description: optionalText(2000),
  weightPct: z.coerce.number('Enter the weight').min(1, '1 to 100').max(100, '1 to 100'),
  unit: z.string().trim().max(20).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  targetValue: optionalNumber,
  actualValue: optionalNumber,
  progressPct: optionalPct,
  /** Only DROPPED is set by hand; the rest follows progress. */
  dropped: z.boolean().default(false),
  keyResults: z.array(PerfKeyResultSchema).max(10, 'Up to 10 key results').default([]),
};
export const PerfGoalCreateSchema = z.object({ employeeId: z.uuid('Choose the employee'), ...GoalFields });
export type PerfGoalCreate = z.infer<typeof PerfGoalCreateSchema>;
export const PerfMyGoalCreateSchema = z.object(GoalFields);
export type PerfMyGoalCreate = z.infer<typeof PerfMyGoalCreateSchema>;
export const PerfGoalUpdateSchema = patchFields(GoalFields).extend(RowVersionSchema.shape);
export type PerfGoalUpdate = z.infer<typeof PerfGoalUpdateSchema>;
export const PerfGoalQuerySchema = z.object({ employeeId: z.uuid().optional(), cycleId: z.uuid().optional() });
/** My Goals check-in: new progress per key result (or per goal without key results). */
export const PerfCheckInSchema = z.object({
  items: z.array(z.object({ goalId: z.uuid(), keyResultId: z.uuid().optional().nullable(), progressPct: z.coerce.number().min(0).max(100) })).min(1).max(100),
});
export type PerfCheckIn = z.infer<typeof PerfCheckInSchema>;

// ---------------------------------------------------------------- reviews
export const PerfCompetencyInputSchema = z.object({
  competency: z.string().trim().min(2).max(80),
  competencyDescription: optionalText(200),
  rating: z.coerce.number().int().min(1, '1 to 5').max(5, '1 to 5'),
  evidence: optionalText(1000),
});
export const PerfReviewQuerySchema = z.object({
  cycle: z.uuid().optional(),
  search: z.string().trim().max(100).optional(),
  departmentId: z.uuid().optional(),
  stage: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PerfReviewQuery = z.infer<typeof PerfReviewQuerySchema>;
export const PerfGenerateSchema = z.object({ cycleId: z.uuid('Choose the cycle') });
export const PerfSelfReviewSchema = RowVersionSchema.extend({
  selfRating: rating,
  selfComment: optionalText(4000),
  competencies: z.array(PerfCompetencyInputSchema).max(20).default([]),
});
export type PerfSelfReview = z.infer<typeof PerfSelfReviewSchema>;
export const PerfManagerReviewSchema = RowVersionSchema.extend({
  managerRating: rating,
  managerComment: optionalText(4000),
  goalAchievementPct: z.coerce.number().min(0).max(300).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  performanceBand: z.enum(PERF_BANDS).optional().nullable(),
  potentialBand: z.enum(PERF_BANDS).optional().nullable(),
  pipSuggested: z.boolean().optional(),
  competencies: z.array(PerfCompetencyInputSchema).max(20).default([]),
});
export type PerfManagerReview = z.infer<typeof PerfManagerReviewSchema>;
export const PerfCalibrateSchema = RowVersionSchema.extend({
  finalRating: rating,
  ratingLabel: z.string().trim().max(30).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  performanceBand: z.enum(PERF_BANDS, 'Choose the performance band'),
  potentialBand: z.enum(PERF_BANDS, 'Choose the potential band'),
  pipSuggested: z.boolean().default(false),
  incrementPctRecommended: z.coerce.number().min(0, 'Not negative').max(100, 'Up to 100').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
});
export type PerfCalibrate = z.infer<typeof PerfCalibrateSchema>;

// ---------------------------------------------------------------- feedback & 1:1s
export const PerfFeedbackRequestSchema = z.object({
  /** HR may ask on someone's behalf; on My Goals it is always the requester. */
  toEmployeeId: optionalId,
  fromEmployeeIds: z.array(z.uuid()).min(1, 'Pick at least one colleague').max(3, 'Up to 3 colleagues'),
  relationship: z.string().trim().max(30).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  cycleId: optionalId,
});
export type PerfFeedbackRequest = z.infer<typeof PerfFeedbackRequestSchema>;
export const PerfFeedbackGiveSchema = z.object({
  toEmployeeId: z.uuid('Choose who it is for'),
  /** HR may record feedback from someone; on My Goals it is always from the giver. */
  fromEmployeeId: optionalId,
  relationship: z.string().trim().max(30).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  tag: z.enum(['STRENGTH', 'GROWTH']).default('STRENGTH'),
  body: z.string().trim().min(5, 'Write the feedback').max(2000),
  cycleId: optionalId,
});
export type PerfFeedbackGive = z.infer<typeof PerfFeedbackGiveSchema>;
export const PerfFeedbackAnswerSchema = RowVersionSchema.extend({
  body: optionalText(2000),
  tag: z.enum(['STRENGTH', 'GROWTH']).optional().nullable(),
  decline: z.boolean().default(false),
}).superRefine((a, ctx) => {
  if (!a.decline && !a.body) ctx.addIssue({ code: 'custom', path: ['body'], message: 'Write the feedback' });
});
export type PerfFeedbackAnswer = z.infer<typeof PerfFeedbackAnswerSchema>;
export const PerfFeedbackQuerySchema = z.object({ employeeId: z.uuid().optional(), cycleId: z.uuid().optional() });

const ActionItemSchema = z.object({ text: z.string().trim().min(1).max(200), done: z.boolean().default(false) });
const OneOnOneFields = {
  employeeId: z.uuid('Choose the employee'),
  managerEmployeeId: z.uuid('Choose who it is with'),
  meetingDate: z.iso.date('Use a date'),
  topic: z.string().trim().min(2, 'Enter the topic').max(160),
  notes: optionalText(4000),
  actionItems: z.array(ActionItemSchema).max(30).default([]),
  cycleId: optionalId,
};
export const PerfOneOnOneCreateSchema = z.object(OneOnOneFields).refine((o) => o.employeeId !== o.managerEmployeeId, { path: ['managerEmployeeId'], message: 'Choose someone else' });
export type PerfOneOnOneCreate = z.infer<typeof PerfOneOnOneCreateSchema>;
export const PerfOneOnOneUpdateSchema = patchFields(OneOnOneFields).extend(RowVersionSchema.shape);
export type PerfOneOnOneUpdate = z.infer<typeof PerfOneOnOneUpdateSchema>;
/** My Goals: a 1:1 with someone (the other side is me). */
export const PerfMyOneOnOneSchema = z.object({
  withEmployeeId: z.uuid('Choose who it is with'),
  meetingDate: z.iso.date('Use a date'),
  topic: z.string().trim().min(2, 'Enter the topic').max(160),
  notes: optionalText(4000),
  actionItems: z.array(ActionItemSchema).max(30).default([]),
});
export type PerfMyOneOnOne = z.infer<typeof PerfMyOneOnOneSchema>;
export const PerfActionItemsSchema = RowVersionSchema.extend({ actionItems: z.array(ActionItemSchema).max(30) });
export const PerfOneOnOneQuerySchema = z.object({ employeeId: z.uuid().optional() });
