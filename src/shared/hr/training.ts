import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';

/**
 * Phase 33 (talent): training. Sessions are a schedule under a Phase 13 programme; employees enrol in the programme
 * (programme level, one enrolment each); completing an enrolment issues the programme's certification (expiry from its
 * validity). Certifications expiring in 60 days are listed for renewal.
 */
export const TRAINING_ENROLMENT_STATUSES = ['ENROLLED', 'IN_PROGRESS', 'BEHIND', 'COMPLETED', 'WITHDRAWN'] as const;

export type TrainingSessionItem = {
  id: string; program: { id: string; name: string }; title: string; startsAt: string; endsAt: string; deliveryMode: string; venue: string | null;
  branch: { id: string; name: string } | null; trainer: string | null; seats: number | null; isMandatory: boolean; status: string;
  /** Active enrolments of the programme (enrolments are programme-level). */
  enrolled: number; rowVersion: number;
};
export type TrainingCertificationItem = {
  id: string; employee: EmpRef; name: string; issuer: string | null; certificateNo: string | null; issuedOn: string | null; expiresOn: string | null;
  status: string; daysLeft: number | null; enrolmentId: string | null;
};
export type TrainingEnrolmentItem = {
  id: string; program: { id: string; name: string; grantsCertification: string | null; certificationValidityMonths: number | null }; employee: EmpRef;
  enrolledOn: string; progressPct: number; scorePct: number | null; hoursCompleted: number; cost: number; status: string; completedOn: string | null;
  certification: { id: string; name: string; expiresOn: string | null } | null; rowVersion: number;
};
export type TrainingBoard = {
  today: string;
  kpis: { hours: number; perEmployee: number | null; budgetUsed: number; budget: number; activeEnrolments: number; runningPrograms: number; expiring: number };
  /** Per programme: active enrolments and completions (the card progress). */
  programStats: Record<string, { enrolled: number; completed: number }>;
  sessions: TrainingSessionItem[];
  expiring: TrainingCertificationItem[];
  enrolments: TrainingEnrolmentItem[];
  total: number;
  counts: Record<string, number>;
};
export type TrainingOptions = {
  programs: { id: string; name: string; status: string; seats: number | null; enrolled: number; costPerHead: number | null }[];
  branches: { id: string; name: string }[];
  employees: (EmpRef & { enrolledIn: string[] })[];
};

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalPct = z.coerce.number().min(0, '0 to 100').max(100, '0 to 100').optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const dateTime = (msg: string) => z.iso.datetime({ offset: true, local: true, message: msg });

export const TrainingBoardQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().max(30).optional(),
  programId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type TrainingBoardQuery = z.infer<typeof TrainingBoardQuerySchema>;

const SessionFields = {
  title: z.string().trim().min(2, 'Name the session').max(160),
  startsAt: dateTime('Choose when it starts'),
  endsAt: dateTime('Choose when it ends'),
  deliveryMode: z.enum(['IN_PERSON', 'ONLINE', 'HYBRID']).default('IN_PERSON'),
  venue: optionalText(160),
  branchId: optionalId,
  trainer: optionalText(120),
  seats: z.coerce.number().int('Whole number').min(1, 'At least 1').max(100_000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  isMandatory: z.boolean().default(false),
};
export const TrainingSessionCreateSchema = z.object(SessionFields).refine((s) => s.endsAt > s.startsAt, { path: ['endsAt'], message: 'Ends after it starts' });
export type TrainingSessionCreate = z.infer<typeof TrainingSessionCreateSchema>;
export const TrainingSessionUpdateSchema = patchFields(SessionFields).extend(RowVersionSchema.shape).extend({ status: z.enum(['COMPLETED', 'CANCELLED']).optional() });
export type TrainingSessionUpdate = z.infer<typeof TrainingSessionUpdateSchema>;

export const TrainingEnrolSchema = z.object({
  programId: z.uuid('Choose the programme'),
  employeeIds: z.array(z.uuid()).min(1, 'Pick at least one employee').max(200, 'Up to 200 at a time'),
  enrolledOn: optionalDate,
});
export type TrainingEnrol = z.infer<typeof TrainingEnrolSchema>;
export const TrainingEnrolmentUpdateSchema = RowVersionSchema.extend({
  progressPct: z.coerce.number().min(0, '0 to 99 (use Complete for 100)').max(99, '0 to 99 (use Complete for 100)').optional(),
  scorePct: optionalPct,
  hoursCompleted: z.coerce.number().min(0, 'Not negative').max(10_000).optional(),
  cost: z.coerce.number().min(0, 'Not negative').max(100_000_000).optional(),
  /** Flag the enrolment as behind schedule (or back on track). */
  behind: z.boolean().optional(),
});
export type TrainingEnrolmentUpdate = z.infer<typeof TrainingEnrolmentUpdateSchema>;
export const TrainingCompleteSchema = RowVersionSchema.extend({
  scorePct: optionalPct,
  completedOn: optionalDate,
  hoursCompleted: z.coerce.number().min(0).max(10_000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
});
export type TrainingComplete = z.infer<typeof TrainingCompleteSchema>;
export type TrainingEnrolResult = { enrolled: number; skipped: { employeeId: string; name: string; reason: string }[] };
