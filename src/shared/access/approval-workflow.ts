import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';

/** Condition fields compared as numbers; the others compare codes / ids. */
export const NUMERIC_CONDITION_FIELDS = ['AMOUNT', 'LEAVE_DAYS', 'CREDIT_BREACH_AMOUNT'] as const;

export const WorkflowStepSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, 'Name the step').max(80),
    approverType: z.enum(['ROLE', 'USER', 'LINE_MANAGER']),
    approverRoleId: z.string().nullable().optional().transform((v) => v ?? null),
    approverUserId: z.string().nullable().optional().transform((v) => v ?? null),
    /** The step applies only above this amount (empty = always). */
    appliesAboveAmount: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
    slaHours: z.coerce.number().positive('More than 0').max(720),
    onSlaBreach: z.string().min(1),
    approvalMode: z.string().min(1),
    blockSelfApproval: z.boolean(),
    allowDelegation: z.boolean(),
    requireComment: z.boolean(),
  })
  .refine((s) => s.approverType !== 'ROLE' || !!s.approverRoleId, { path: ['approverRoleId'], message: 'Choose a role' })
  .refine((s) => s.approverType !== 'USER' || !!s.approverUserId, { path: ['approverUserId'], message: 'Choose a user' });
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

/** value: a number or code; an array for IN / NOT_IN; [from, to] for BETWEEN. */
export const WorkflowConditionSchema = z
  .object({
    id: z.string().optional(),
    field: z.string().min(1),
    operator: z.string().min(1),
    value: z.union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))]),
  })
  .refine((c) => !['IN', 'NOT_IN', 'BETWEEN'].includes(c.operator) || Array.isArray(c.value), { path: ['value'], message: 'List the values, separated by commas' })
  .refine((c) => c.operator !== 'BETWEEN' || (Array.isArray(c.value) && c.value.length === 2), { path: ['value'], message: 'Give a from and a to value' });
export type WorkflowCondition = z.infer<typeof WorkflowConditionSchema>;

const WorkflowFields = {
  name: z.string().trim().min(2, 'Name the workflow').max(80),
  subject: z.string().min(1, 'Choose what it approves'),
  description: z.string().trim().max(300).optional().nullable().transform((v) => (v ? v : null)),
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  onComplete: z.string().min(1),
  onReject: z.string().min(1),
  notifyPreparer: z.boolean(),
  notifyInApp: z.boolean(),
  notifyEmail: z.boolean(),
  notifyWhatsapp: z.boolean(),
  steps: z.array(WorkflowStepSchema).max(20, 'At most 20 steps'),
  conditions: z.array(WorkflowConditionSchema).max(20),
};

export const WorkflowSaveSchema = z.object(WorkflowFields);
export type WorkflowSave = z.infer<typeof WorkflowSaveSchema>;
export type WorkflowSaveFields = z.input<typeof WorkflowSaveSchema>;
export const WorkflowUpdateSchema = WorkflowSaveSchema.extend(RowVersionSchema.shape);
export type WorkflowUpdate = z.infer<typeof WorkflowUpdateSchema>;

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  version: z.number().int(),
  priority: z.number().int(),
  onComplete: z.string(),
  onReject: z.string(),
  notifyPreparer: z.boolean(),
  notifyInApp: z.boolean(),
  notifyEmail: z.boolean(),
  notifyWhatsapp: z.boolean(),
  publishedAt: z.string().nullable(),
  steps: z.array(
    z.object({
      id: z.string(), stepNo: z.number().int(), name: z.string(), approverType: z.enum(['ROLE', 'USER', 'LINE_MANAGER']),
      approverRoleId: z.string().nullable(), approverUserId: z.string().nullable(), approverLabel: z.string(),
      appliesAboveAmount: z.number().nullable(), slaHours: z.number(), onSlaBreach: z.string(), approvalMode: z.string(),
      blockSelfApproval: z.boolean(), allowDelegation: z.boolean(), requireComment: z.boolean(),
    }),
  ),
  conditions: z.array(z.object({ id: z.string(), seq: z.number().int(), field: z.string(), operator: z.string(), value: z.unknown() })),
  rowVersion: z.number().int(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/** POST /settings/approval-workflows/:id/test: a sample document. */
export const WorkflowDryRunSchema = z.object({
  values: z.record(z.string(), z.union([z.number(), z.string()])),
});
export type WorkflowDryRun = z.infer<typeof WorkflowDryRunSchema>;
export const WorkflowDryRunResultSchema = z.object({
  matches: z.boolean(),
  conditions: z.array(z.object({ seq: z.number(), passed: z.boolean(), reason: z.string() })),
  steps: z.array(z.object({ stepNo: z.number(), name: z.string(), approverLabel: z.string(), applies: z.boolean() })),
});
export type WorkflowDryRunResult = z.infer<typeof WorkflowDryRunResultSchema>;

/** Approval delegation (out-of-office). */
export const DelegationSchema = z.object({
  id: z.string(),
  fromUserId: z.string(),
  fromUserName: z.string(),
  toUserId: z.string(),
  toUserName: z.string(),
  subject: z.string().nullable(),
  startsOn: z.string(),
  endsOn: z.string(),
  reason: z.string().nullable(),
  isActive: z.boolean(),
  rowVersion: z.number().int(),
});
export type Delegation = z.infer<typeof DelegationSchema>;

const DelegationFields = z.object({
  fromUserId: z.uuid('Choose who is away'),
  toUserId: z.uuid('Choose who approves instead'),
  subject: z.string().optional().nullable().transform((v) => (v ? v : null)),
  startsOn: z.iso.date('Use YYYY-MM-DD'),
  endsOn: z.iso.date('Use YYYY-MM-DD'),
  reason: z.string().trim().max(200).optional().nullable().transform((v) => (v ? v : null)),
  isActive: z.boolean().default(true),
});
const delegationRules = <T extends z.ZodType<{ fromUserId: string; toUserId: string; startsOn: string; endsOn: string }>>(s: T) =>
  s
    .refine((d) => d.fromUserId !== d.toUserId, { path: ['toUserId'], message: 'Choose someone else' })
    .refine((d) => d.endsOn >= d.startsOn, { path: ['endsOn'], message: 'Ends on or after the start' });

export const DelegationSaveSchema = delegationRules(DelegationFields);
export type DelegationSave = z.infer<typeof DelegationSaveSchema>;
export type DelegationSaveFields = z.input<typeof DelegationSaveSchema>;
export const DelegationUpdateSchema = delegationRules(DelegationFields.extend(RowVersionSchema.shape));
export type DelegationUpdate = z.infer<typeof DelegationUpdateSchema>;
