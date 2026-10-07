import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const instant = (msg: string) =>
  z.string().trim().min(1, msg).transform((v, ctx) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Use a date and time' });
      return z.NEVER;
    }
    return d.toISOString();
  });
const ref = z.object({ id: z.string(), name: z.string() });

// ---------------------------------------------------------------- polls
/** A company poll (EmployeeSelfService.Polls + PollOptions). Votes arrive in Phase 34. */
export const PollSchema = z.object({
  id: z.string(),
  question: z.string(),
  /** The creating employee; selectable once employees (Phase 11) are accepted. */
  createdByEmployeeId: z.string().nullable(),
  department: ref.nullable(),
  opensAt: z.string(),
  closesAt: z.string(),
  showResultsAfterVote: z.boolean(),
  status: z.string(),
  options: z.array(z.object({ id: z.string(), seq: z.number().int(), label: z.string() })),
  voteCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type Poll = z.infer<typeof PollSchema>;

const PollOptionInput = z.object({ id: z.uuid().optional(), label: z.string().trim().min(1, 'Write the option').max(80) });
const pollOptions = z
  .array(PollOptionInput)
  .min(2, 'Give at least 2 options')
  .max(8, 'Up to 8 options')
  .superRefine((xs, ctx) => {
    const seen = new Set<string>();
    xs.forEach((o, i) => {
      const k = o.label.toLowerCase();
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: [i, 'label'], message: 'Same as another option' });
      seen.add(k);
    });
  });
const PollFields = {
  question: z.string().trim().min(5, 'Write the question').max(200),
  departmentId: optionalId,
  opensAt: instant('When does it open?'),
  closesAt: instant('When does it close?'),
  showResultsAfterVote: z.boolean().default(true),
  options: pollOptions,
};
const windowOk = (p: { opensAt?: string; closesAt?: string }) => !p.opensAt || !p.closesAt || p.closesAt > p.opensAt;
export const PollCreateSchema = z.object(PollFields).refine(windowOk, { path: ['closesAt'], message: 'Closes before it opens' });
export type PollCreate = z.infer<typeof PollCreateSchema>;
export const PollUpdateSchema = z
  .object({ ...PollFields, showResultsAfterVote: z.boolean() })
  .partial()
  .extend(RowVersionSchema.shape)
  .refine(windowOk, { path: ['closesAt'], message: 'Closes before it opens' });
export type PollUpdate = z.infer<typeof PollUpdateSchema>;

// ---------------------------------------------------------------- pulse surveys
export const PULSE_METRICS = ['WORKLOAD', 'MANAGER_SUPPORT', 'ENPS', 'OTHER'] as const;

/** A pulse survey (EmployeeSelfService.PulseSurveys + PulseSurveyQuestions), 1–5 scale questions. Responses arrive in Phase 34. */
export const PulseSurveySchema = z.object({
  id: z.string(),
  title: z.string(),
  periodFrom: z.string(),
  periodTo: z.string(),
  department: ref.nullable(),
  isAnonymous: z.boolean(),
  status: z.string(),
  questions: z.array(z.object({ id: z.string(), seq: z.number().int(), questionText: z.string(), lowLabel: z.string(), highLabel: z.string(), metricKey: z.string().nullable() })),
  responseCount: z.number().int(),
  rowVersion: z.number().int(),
});
export type PulseSurvey = z.infer<typeof PulseSurveySchema>;

const QuestionInput = z.object({
  id: z.uuid().optional(),
  questionText: z.string().trim().min(5, 'Write the question').max(200),
  lowLabel: z.string().trim().min(1, 'Label the 1').max(40),
  highLabel: z.string().trim().min(1, 'Label the 5').max(40),
  metricKey: z.enum(PULSE_METRICS).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
});
const PulseFields = {
  title: z.string().trim().min(3, 'Name the survey').max(120),
  periodFrom: z.iso.date('Use a date'),
  periodTo: z.iso.date('Use a date'),
  departmentId: optionalId,
  isAnonymous: z.boolean().default(true),
  questions: z.array(QuestionInput).min(1, 'Add a question').max(10, 'Up to 10 questions'),
};
const periodOk = (s: { periodFrom?: string; periodTo?: string }) => !s.periodFrom || !s.periodTo || s.periodTo >= s.periodFrom;
export const PulseSurveyCreateSchema = z.object(PulseFields).refine(periodOk, { path: ['periodTo'], message: 'Ends before it starts' });
export type PulseSurveyCreate = z.infer<typeof PulseSurveyCreateSchema>;
export const PulseSurveyUpdateSchema = z
  .object({ ...PulseFields, isAnonymous: z.boolean() })
  .partial()
  .extend(RowVersionSchema.shape)
  .refine(periodOk, { path: ['periodTo'], message: 'Ends before it starts' });
export type PulseSurveyUpdate = z.infer<typeof PulseSurveyUpdateSchema>;

export const EngagementOptionsSchema = z.object({ departments: z.array(ref) });
export type EngagementOptions = z.infer<typeof EngagementOptionsSchema>;

/** GET /api/me/engagement: the open polls and pulse surveys for the employee (or everyone). Voting arrives in Phase 34. */
export const MyEngagementSchema = z.object({
  polls: z.array(PollSchema.pick({ id: true, question: true, closesAt: true, showResultsAfterVote: true, options: true }).extend({ department: z.string().nullable() })),
  surveys: z.array(PulseSurveySchema.pick({ id: true, title: true, periodFrom: true, periodTo: true, isAnonymous: true, questions: true }).extend({ department: z.string().nullable() })),
});
export type MyEngagement = z.infer<typeof MyEngagementSchema>;
