import { z } from 'zod';
import { FLAG_ENVIRONMENTS, FlagEnvironmentInputSchema } from './flag.ts';

/**
 * Phase 43: flag change requests (Platform.FlagChangeRequests + approvers + comments) and scheduled rollout steps
 * (Platform.FlagScheduledChanges). Production toggles and targeting saves become a request; approving applies it
 * (or waits for applyNotBefore). Kill switches keep the emergency path (typed key, logged as emergency).
 * While exactly one platform staff member is active, they may approve their own request ("solo approval"): typed flag
 * key + note, stored with the note prefix SOLO_PREFIX.
 */
export const CR_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ChangeRequestStatus = (typeof CR_STATUSES)[number];
export const SOLO_PREFIX = 'SOLO APPROVAL:';

/** What an approved request applies to the flag environment. */
export type ChangeRequestPatch =
  | { kind: 'TOGGLE'; isOn: boolean }
  | { kind: 'TARGETING'; input: z.infer<typeof FlagEnvironmentInputSchema> }
  | { kind: 'ROLLOUT'; rolloutPct: number };

export type ChangeRequestApprover = { staffId: string; name: string; decision: string; decidedAt: string | null };
export type ChangeRequestComment = { id: string; staffId: string; staffName: string; body: string; postedAt: string };
export type ChangeRequest = {
  id: string; docNo: string; flagId: string; flagKey: string; flagName: string; flagType: string; environment: string;
  requesterStaffId: string; requesterName: string; reason: string; summary: string; beforeState: unknown; afterState: unknown;
  applyNotBefore: string | null; source: string; status: string; decidedByStaffId: string | null; decidedBy: string | null; decidedAt: string | null;
  decisionNote: string | null; appliedAt: string | null; createdAt: string; rowVersion: number;
  approvers: ChangeRequestApprover[]; comments: ChangeRequestComment[];
  /** Waiting for its applyNotBefore time (approved, not applied yet). */
  scheduled: boolean;
};
export type ChangeRequestKpis = { pending: number; approved30d: number; rejected30d: number; medianApproveMinutes: number | null };
export type ChangeRequestList = {
  items: ChangeRequest[]; kpis: ChangeRequestKpis;
  /** The signed-in admin is the only active platform staff member (solo approval allowed). */
  solo: boolean; meStaffId: string | null;
};

export const ChangeRequestListQuerySchema = z.object({
  status: z.enum([...CR_STATUSES, 'ALL']).default('ALL'),
  flagId: z.uuid().optional(),
});
export type ChangeRequestListQuery = z.infer<typeof ChangeRequestListQuerySchema>;

export const ChangeRequestCreateSchema = z.object({
  flagId: z.uuid(),
  environment: z.enum(FLAG_ENVIRONMENTS).default('PRODUCTION'),
  reason: z.string().trim().min(3, 'Give the reason for the change').max(1000),
  /** "Apply automatically once approved, but not before …" */
  applyNotBefore: z.iso.datetime({ offset: true }).nullable().optional(),
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('TOGGLE'), isOn: z.boolean() }),
    z.object({ kind: z.literal('TARGETING'), input: FlagEnvironmentInputSchema }),
  ]),
});
export type ChangeRequestCreate = z.infer<typeof ChangeRequestCreateSchema>;

export const ChangeRequestDecisionSchema = z.object({
  note: z.string().trim().min(1, 'Add a note').max(1000),
  /** Solo approval: the flag key, typed. */
  confirmKey: z.string().trim().max(80).optional(),
});
export type ChangeRequestDecision = z.infer<typeof ChangeRequestDecisionSchema>;

export const ChangeRequestCommentSchema = z.object({ body: z.string().trim().min(1, 'Write a comment').max(1000) });
export type ChangeRequestCommentInput = z.infer<typeof ChangeRequestCommentSchema>;
export const ChangeRequestCancelSchema = z.object({ reason: z.string().trim().max(500).optional() });
export type ChangeRequestCancel = z.infer<typeof ChangeRequestCancelSchema>;

// ---- scheduled rollout steps
export type FlagScheduleStep = {
  id: string; environment: string; stepDate: string; rolloutPct: number; status: string; changeRequestId: string | null; changeRequestDocNo: string | null; rowVersion: number;
};
export const FlagScheduleStepInputSchema = z.object({
  id: z.uuid().optional(),
  stepDate: z.iso.date('Pick a date'),
  rolloutPct: z.coerce.number().int('Whole percent').min(0, '0 to 100').max(100, '0 to 100'),
});
export const FlagScheduleInputSchema = z.object({ steps: z.array(FlagScheduleStepInputSchema).max(20) });
export type FlagScheduleInput = z.infer<typeof FlagScheduleInputSchema>;
/** Result of the schedule job (also POST /api/admin/change-requests/run-schedule). */
export type ScheduleRunResult = { requested: string[]; applied: string[]; skipped: { step: string; reason: string }[] };
