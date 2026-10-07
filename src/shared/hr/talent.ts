import { z } from 'zod';
import { ListQuerySchema, patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

/**
 * Phase 13: talent & policy setup. Onboarding templates (HumanResources.OnboardingTemplates + tasks), performance cycles,
 * training programs and company policies (EmployeeSelfService.CompanyPolicies, versioned).
 */
const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalNum = (min: number, max: number, msg = `${min} to ${max}`) => z.coerce.number(msg).min(min, msg).max(max, msg).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalInt = (min: number, max: number) => z.coerce.number().int('Whole number').min(min, `${min} to ${max}`).max(max, `${min} to ${max}`).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
/** A month ("2027-01" from <input type="month">, or a date) stored as its 1st day. */
const optionalMonth = z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/, 'Choose a month').optional().nullable().or(z.literal('')).transform((v) => (v ? `${v.slice(0, 7)}-01` : null));
const lookupCode = (d: string) => z.string().trim().min(1).max(30).default(d);
const issues = (fn: (x: never) => Record<string, string>) => (x: unknown, ctx: z.RefinementCtx) => {
  for (const [path, message] of Object.entries(fn(x as never))) ctx.addIssue({ code: 'custom', path: path.split('.'), message });
};
/** List endpoints of this phase: search, status, page (up to 100 per page). */
export const TalentListQuerySchema = ListQuerySchema;
export type TalentListQuery = z.infer<typeof TalentListQuerySchema>;

// ---------------------------------------------------------------- onboarding templates
export const TASK_GROUPS = ['DOCUMENTS', 'STATUTORY_FINANCE', 'IT_ADMIN', 'ORIENTATION', 'POLICIES', 'BUDDY', 'TRAINING'] as const;
export type OnboardingTemplateTask = {
  id: string; taskGroup: string; title: string; description: string | null; ownerFunction: string; dueOffsetDays: number; actionKind: string; sortOrder: number;
};
export type OnboardingTemplate = {
  id: string; name: string; track: string; isDefault: boolean; isActive: boolean;
  tasks: OnboardingTemplateTask[];
  /** Onboardings started from this template (Phase 31). */
  onboardings: number;
  rowVersion: number;
};
export const OnboardingTaskSchema = z.object({
  id: z.uuid().optional(),
  taskGroup: z.string().trim().min(1, 'Choose the group').max(30),
  title: z.string().trim().min(2, 'Describe the task').max(160),
  description: optionalText(500),
  ownerFunction: z.string().trim().min(1, 'Choose the owner').max(30),
  dueOffsetDays: z.coerce.number().int('Whole days').min(-90, '-90 to 365').max(365, '-90 to 365').default(0),
  actionKind: lookupCode('NONE'),
});
export type OnboardingTaskInput = z.infer<typeof OnboardingTaskSchema>;
const OnboardingTemplateFields = {
  name: z.string().trim().min(2, 'Name the template').max(80),
  track: lookupCode('NEW_JOINER'),
  tasks: z.array(OnboardingTaskSchema).max(100, 'Up to 100 tasks').default([]),
};
export const OnboardingTemplateCreateSchema = z.object(OnboardingTemplateFields);
export type OnboardingTemplateCreate = z.infer<typeof OnboardingTemplateCreateSchema>;
export const OnboardingTemplateUpdateSchema = patchFields(OnboardingTemplateFields).extend(RowVersionSchema.shape);
export type OnboardingTemplateUpdate = z.infer<typeof OnboardingTemplateUpdateSchema>;

// ---------------------------------------------------------------- performance cycles
/** Appraisal stages in order (Lookups PerformanceCycleStage); the template's 5-step stepper. */
export const CYCLE_STAGES = ['GOAL_SETTING', 'SELF_REVIEW', 'MANAGER_REVIEW', 'CALIBRATION', 'SIGN_OFF'] as const;
export type PerformanceCycle = {
  id: string; name: string; cycleType: string; periodStart: string; periodEnd: string;
  goalSettingDue: string | null; selfReviewDue: string | null; managerReviewDue: string | null;
  calibrationStart: string | null; calibrationEnd: string | null; signOffDue: string | null;
  incrementsEffectiveMonth: string | null; excludeProbation: boolean; ratingScaleMax: number;
  stage: string; status: string; rowVersion: number;
};
const CycleFields = {
  name: z.string().trim().min(2, 'Name the cycle').max(80),
  cycleType: lookupCode('HALF_YEARLY'),
  periodStart: z.iso.date('Use a date'),
  periodEnd: z.iso.date('Use a date'),
  goalSettingDue: optionalDate,
  selfReviewDue: optionalDate,
  managerReviewDue: optionalDate,
  calibrationStart: optionalDate,
  calibrationEnd: optionalDate,
  signOffDue: optionalDate,
  incrementsEffectiveMonth: optionalMonth,
  excludeProbation: z.boolean().default(true),
  ratingScaleMax: z.coerce.number().int('Whole number').min(3, '3 to 10').max(10, '3 to 10').default(5),
};
type CycleShape = Partial<Record<'periodStart' | 'periodEnd' | 'goalSettingDue' | 'selfReviewDue' | 'managerReviewDue' | 'calibrationStart' | 'calibrationEnd' | 'signOffDue' | 'incrementsEffectiveMonth', string | null>>;
const DUE_ORDER = [['goalSettingDue', 'Goal setting'], ['selfReviewDue', 'Self review'], ['managerReviewDue', 'Manager review'], ['calibrationStart', 'Calibration start'], ['calibrationEnd', 'Calibration end'], ['signOffDue', 'Sign-off']] as const;
/** The period ends after it starts; the stage dates run in stepper order; increments start on the 1st of a month (as the DB checks). */
export function cycleErrors(c: CycleShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.periodStart && c.periodEnd && c.periodEnd <= c.periodStart) e.periodEnd = 'Ends after it starts';
  let prev: { key: string; label: string; value: string } | null = null;
  for (const [key, label] of DUE_ORDER) {
    const v = c[key];
    if (!v) continue;
    if (prev && v < prev.value) e[key] = `On or after ${prev.label.toLowerCase()}`;
    prev = { key, label, value: v };
  }
  if (c.incrementsEffectiveMonth && !c.incrementsEffectiveMonth.endsWith('-01')) e.incrementsEffectiveMonth = 'The 1st of a month';
  return e;
}
export const PerformanceCycleCreateSchema = z.object(CycleFields).superRefine(issues(cycleErrors));
export type PerformanceCycleCreate = z.infer<typeof PerformanceCycleCreateSchema>;
export const PerformanceCycleUpdateSchema = patchFields(CycleFields).extend(RowVersionSchema.shape);
export type PerformanceCycleUpdate = z.infer<typeof PerformanceCycleUpdateSchema>;

// ---------------------------------------------------------------- training programs
export const TRAINING_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
/** Status moves a program may make (no activate / deactivate: CANCELLED replaces it). */
export const TRAINING_TRANSITIONS: Record<string, readonly string[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: ['PLANNED'],
};
export type TrainingProgram = {
  id: string; code: string | null; name: string; audience: string | null;
  department: { id: string; code: string; name: string } | null;
  format: string; durationLabel: string | null; durationHours: number | null; provider: string | null;
  isMandatory: boolean; isCpdCertified: boolean; seats: number | null; targetParticipants: number | null;
  budget: number | null; costPerHead: number | null; grantsCertification: string | null; certificationValidityMonths: number | null;
  startDate: string | null; endDate: string | null; status: string; description: string | null; rowVersion: number;
};
const ProgramFields = {
  code: z.string().trim().toUpperCase().max(20).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  name: z.string().trim().min(2, 'Name the program').max(120),
  audience: optionalText(120),
  departmentId: optionalId,
  format: lookupCode('WORKSHOP'),
  durationLabel: optionalText(60),
  durationHours: optionalNum(0.25, 9999, 'More than 0'),
  provider: optionalText(120),
  isMandatory: z.boolean().default(false),
  isCpdCertified: z.boolean().default(false),
  seats: optionalInt(1, 100_000),
  targetParticipants: optionalInt(1, 100_000),
  budget: optionalNum(0, 100_000_000_000, 'Not negative'),
  costPerHead: optionalNum(0, 100_000_000, 'Not negative'),
  grantsCertification: optionalText(120),
  certificationValidityMonths: optionalInt(1, 600),
  startDate: optionalDate,
  endDate: optionalDate,
  description: optionalText(2000),
};
type ProgramShape = { grantsCertification?: string | null; certificationValidityMonths?: number | null; startDate?: string | null; endDate?: string | null };
/** Validity only for a certifying program; dates in order (as the DB checks). */
export function programErrors(p: ProgramShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (p.certificationValidityMonths && !p.grantsCertification) e.certificationValidityMonths = 'Only when the program grants a certification';
  if (p.startDate && p.endDate && p.endDate < p.startDate) e.endDate = 'Ends before it starts';
  return e;
}
export const TrainingProgramCreateSchema = z.object(ProgramFields).superRefine(issues(programErrors));
export type TrainingProgramCreate = z.infer<typeof TrainingProgramCreateSchema>;
export const TrainingProgramUpdateSchema = patchFields(ProgramFields).extend(RowVersionSchema.shape);
export type TrainingProgramUpdate = z.infer<typeof TrainingProgramUpdateSchema>;
export const TrainingStatusSchema = z.object({ status: z.enum(TRAINING_STATUSES), rowVersion: z.coerce.number().int().min(0) });
export type TrainingStatusInput = z.infer<typeof TrainingStatusSchema>;

// ---------------------------------------------------------------- company policies
export type CompanyPolicy = {
  id: string; code: string; title: string; version: string; category: string; effectiveDate: string;
  /** Selectable once employees are accepted (Phase 11). */
  owner: { id: string; code: string; name: string } | null;
  body: string | null; readMinutes: number | null; attachmentId: string | null; requiresAcknowledgement: boolean;
  supersedes: { id: string; version: string } | null;
  status: string; publishedAt: string | null; rowVersion: number;
};
const PolicyFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Like HR-01 (2–20 letters, digits or -)'),
  title: z.string().trim().min(2, 'Name the policy').max(160),
  version: z.string().trim().regex(/^\d{1,3}(\.\d{1,3})?$/, 'Like 1 or 2.1').default('1'),
  category: lookupCode('HR'),
  effectiveDate: z.iso.date('Use a date'),
  /** The owning employee (Phase 11). */
  ownerEmployeeId: optionalId,
  body: optionalText(50_000),
  readMinutes: optionalInt(1, 600),
  requiresAcknowledgement: z.boolean().default(true),
};
export const CompanyPolicyCreateSchema = z.object(PolicyFields);
export type CompanyPolicyCreate = z.infer<typeof CompanyPolicyCreateSchema>;
export const CompanyPolicyUpdateSchema = patchFields(PolicyFields).extend(RowVersionSchema.shape);
export type CompanyPolicyUpdate = z.infer<typeof CompanyPolicyUpdateSchema>;

/** The version after `v`: 3 → 4, 2.1 → 3.0. */
export const nextPolicyVersion = (v: string) => {
  const [major, minor] = v.split('.');
  const n = (Number(major) || 0) + 1;
  return minor === undefined ? String(n) : `${n}.0`;
};
