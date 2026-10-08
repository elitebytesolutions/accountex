import { z } from 'zod';
import { patchFields } from '../common/list-query.ts';
import { rowVersion } from './fields.ts';

/**
 * Phase 38: dunning policies (Platform.DunningPolicies). Exactly one policy is active; dunning cases (Phase 41) follow it.
 * Timeline: day 1..grace full access, then read-only days, then suspended days, then cancelled and archived.
 */
export const DUNNING_OFFSETS = [-3, 0, 1, 3, 7, 14] as const;
/** How a scheduled retry charges: the tenant's own method, or a fallback rail (template retry plan). */
export const RETRY_METHODS = ['ORIGINAL', 'CARD', 'JAZZCASH', 'EASYPAISA', 'RAAST', 'DIRECT_DEBIT'] as const;
export const RETRY_METHOD_LABELS: Record<(typeof RETRY_METHODS)[number], string> = {
  ORIGINAL: 'Same method', CARD: 'Card', JAZZCASH: 'JazzCash', EASYPAISA: 'Easypaisa', RAAST: 'Raast request-to-pay', DIRECT_DEBIT: 'Direct debit',
};

export const RetryStepSchema = z.object({
  day: z.coerce.number('Day').int('Whole days').min(0, '0 or more').max(80, 'At most 80'),
  method: z.enum(RETRY_METHODS),
  label: z.string().trim().min(1, 'Describe the retry').max(60),
});
export type RetryStep = z.infer<typeof RetryStepSchema>;

export type DunningPolicy = {
  id: string;
  name: string;
  isActive: boolean;
  graceDays: number;
  readOnlyDays: number;
  suspendedDays: number;
  archiveDays: number;
  retryHour: number;
  salaryRetryDays: number[];
  retrySchedule: RetryStep[];
  emailEnabled: boolean;
  emailOffsets: number[];
  smsEnabled: boolean;
  smsOffsets: number[];
  whatsappEnabled: boolean;
  whatsappOffsets: number[];
  effectiveFrom: string;
  /** Dunning cases that follow this policy (Phase 41); a policy with cases can't be deleted. */
  casesCount: number;
  updatedAt: string;
  rowVersion: number;
};

const offsets = z.array(z.coerce.number().int()).max(6)
  .refine((a) => a.every((d) => (DUNNING_OFFSETS as readonly number[]).includes(d)), 'Pick from D−3, D0, D+1, D+3, D+7, D+14')
  .transform((a) => [...new Set(a)].sort((x, y) => x - y));

const DunningPolicyFields = {
  name: z.string().trim().min(2, 'Name the policy').max(80),
  graceDays: z.coerce.number('Days').int('Whole days').min(1, '1 to 20').max(20, '1 to 20'),
  readOnlyDays: z.coerce.number('Days').int('Whole days').min(0, '0 to 20').max(20, '0 to 20'),
  suspendedDays: z.coerce.number('Days').int('Whole days').min(5, '5 to 40').max(40, '5 to 40'),
  archiveDays: z.coerce.number('Days').int('Whole days').min(1, 'At least 1').max(3650, 'At most 3650'),
  retryHour: z.coerce.number('Hour').int().min(0, '0 to 23').max(23, '0 to 23'),
  salaryRetryDays: z.array(z.coerce.number().int().min(1, '1 to 28').max(28, '1 to 28')).max(28)
    .transform((a) => [...new Set(a)].sort((x, y) => x - y)),
  retrySchedule: z.array(RetryStepSchema).max(10, 'At most 10 retries').default([]),
  emailEnabled: z.boolean(),
  emailOffsets: offsets,
  smsEnabled: z.boolean(),
  smsOffsets: offsets,
  whatsappEnabled: z.boolean(),
  whatsappOffsets: offsets,
  effectiveFrom: z.iso.date('Choose a date'),
};
export const DunningPolicyCreateSchema = z.object(DunningPolicyFields);
export type DunningPolicyCreate = z.infer<typeof DunningPolicyCreateSchema>;
export const DunningPolicyUpdateSchema = patchFields(DunningPolicyFields).extend({ rowVersion });
export type DunningPolicyUpdate = z.infer<typeof DunningPolicyUpdateSchema>;
export const DunningPolicyActivateSchema = z.object({ rowVersion });
export type DunningPolicyActivate = z.infer<typeof DunningPolicyActivateSchema>;
