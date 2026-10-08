import { z } from 'zod';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';
import type { Who } from './leave-request.ts';

/**
 * Phase 31: onboardings (ONB-) started from a Phase 13 checklist template. Each template task becomes an onboarding
 * task due on the joining date + its offset, owned by the joiner's manager / buddy / the joiner, or by a function (HR,
 * IT, Admin, Finance). The onboarding completes when every task is completed or skipped.
 */
export const ONBOARDING_TASK_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'SCHEDULED', 'COMPLETED', 'SKIPPED'] as const;

export type OnboardingTaskItem = {
  id: string; onboardingId: string; taskGroup: string; title: string; description: string | null; ownerFunction: string; owner: Who | null;
  dueOn: string | null; actionKind: string; progressPct: number; status: string; scheduledAt: string | null; completionNote: string | null;
  completedAt: string | null; completedBy: Who | null; sortOrder: number; overdue: boolean; rowVersion: number;
};
export type OnboardingItem = {
  id: string; docNo: string; employee: EmpRef; template: { id: string; name: string } | null; track: string; designation: string | null;
  joiningDate: string; startDate: string; targetDate: string | null; buddy: Who | null; status: string; completedAt: string | null;
  tasksDone: number; tasksTotal: number; overdue: number; rowVersion: number;
};
export type OnboardingDetail = OnboardingItem & { tasks: OnboardingTaskItem[] };
export type OnboardingBoard = {
  today: string;
  /** The viewer's own employee id (the "Mine" chip). */
  myId: string | null;
  items: OnboardingItem[];
  /** Open tasks across open onboardings, with the joiner. */
  tasks: (OnboardingTaskItem & { joiner: { id: string; name: string } })[];
  kpis: { inOnboarding: number; joiningThisMonth: number; tasksDone: number; tasksTotal: number; overdue: number; overdueTitles: string[]; probationDue: number };
};
export type OnboardingOptions = {
  employees: { id: string; code: string; name: string; joiningDate: string; hasOpen: boolean }[];
  templates: { id: string; name: string; track: string; isDefault: boolean; tasks: number }[];
};
/** My Profile › Onboarding & Policies. */
export type MyOnboarding = { today: string; onboarding: OnboardingDetail | null; past: OnboardingItem[]; myId: string | null };

const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => v || null);
const optionalUuid = z.uuid().optional().nullable().or(z.literal('')).transform((v) => v || null);
export const OnboardingStartSchema = z.object({
  employeeId: z.uuid('Choose the new joiner'),
  templateId: optionalUuid,
  joiningDate: optionalDate,
  startDate: optionalDate,
  targetDate: optionalDate,
  buddyEmployeeId: optionalUuid,
}).superRefine((o, ctx) => {
  if (o.buddyEmployeeId && o.buddyEmployeeId === o.employeeId) ctx.addIssue({ code: 'custom', path: ['buddyEmployeeId'], message: 'Choose someone else as buddy' });
});
export type OnboardingStart = z.infer<typeof OnboardingStartSchema>;
export const OnboardingUpdateSchema = z.object({
  buddyEmployeeId: optionalUuid.optional(),
  targetDate: optionalDate.optional(),
  rowVersion: z.coerce.number().int().min(0),
});
export type OnboardingUpdate = z.infer<typeof OnboardingUpdateSchema>;
export const OnboardingTaskUpdateSchema = z.object({
  status: z.enum(ONBOARDING_TASK_STATUSES).optional(),
  progressPct: z.coerce.number().min(0).max(100).optional(),
  ownerEmployeeId: optionalUuid.optional(),
  dueOn: optionalDate.optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional().nullable().or(z.literal('')).transform((v) => v || null).optional(),
  completionNote: optionalText(500).optional(),
  rowVersion: z.coerce.number().int().min(0),
}).superRefine((t, ctx) => {
  if (t.status === 'SCHEDULED' && !t.scheduledAt) ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Give the date and time' });
});
export type OnboardingTaskUpdate = z.infer<typeof OnboardingTaskUpdateSchema>;
export const OnboardingCancelSchema = z.object({ reason: optionalText(300), rowVersion: z.coerce.number().int().min(0) });
export const MyTaskCompleteSchema = z.object({ note: optionalText(500), rowVersion: z.coerce.number().int().min(0) });
export const OnboardingQuerySchema = z.object({ status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED', 'ALL']).default('OPEN') });
