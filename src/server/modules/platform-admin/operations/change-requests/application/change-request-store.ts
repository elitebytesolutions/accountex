import type { ChangeRequest, ChangeRequestKpis, ChangeRequestPatch, FlagScheduleStep } from '../../../../../../shared/index.js';

/** A request with what its approval applies. */
export type StoredChangeRequest = ChangeRequest & { patch: ChangeRequestPatch };
export type ChangeRequestSubmit = {
  flagId: string; environment: string; reason: string; summary: string; beforeState: unknown; afterState: unknown; patch: ChangeRequestPatch;
  applyNotBefore: string | null; source: 'MANUAL' | 'SCHEDULE_STEP'; requesterStaffId?: string;
};
export type DueStep = { id: string; flagId: string; environment: string; stepDate: string; rolloutPct: number; createdBy: string | null; ownerStaffId: string };

/** Port: Platform.FlagChangeRequests (+ approvers, comments) and Platform.FlagScheduledChanges (Phase 43). */
export abstract class ChangeRequestStore {
  abstract list(q: { status?: string; flagId?: string }): Promise<StoredChangeRequest[]>;
  abstract get(id: string): Promise<StoredChangeRequest | null>;
  abstract kpis(): Promise<ChangeRequestKpis>;
  /** Platform.flagChangeRequestSubmit (CR-1001 up, approvers, one pending per flag and environment). */
  abstract submit(data: ChangeRequestSubmit): Promise<string>;
  /** Platform.flagChangeRequestDecide: approve / reject with the note (four-eyes or solo checked by the database too). */
  abstract decide(id: string, approve: boolean, note: string): Promise<void>;
  abstract cancel(id: string, reason: string | null): Promise<void>;
  /** Platform.flagChangeRequestMarkApplied: appliedAt + the CR_APPLIED FlagAuditLogs row linked to the request. */
  abstract markApplied(id: string, summary: string, before: unknown, after: unknown): Promise<void>;
  abstract comment(id: string, staffId: string, body: string): Promise<void>;
  /** Approved, not applied, applyNotBefore reached. */
  abstract dueApproved(now: Date): Promise<StoredChangeRequest[]>;
  abstract isSolo(): Promise<boolean>;
  abstract isStaff(id: string | null): Promise<boolean>;

  // scheduled rollout steps
  abstract schedule(flagId: string, environment: string): Promise<FlagScheduleStep[]>;
  /** Replaces the PLANNED steps: inserts new ones, updates changed ones, deletes the ones left out. */
  abstract saveSchedule(flagId: string, environment: string, steps: { id?: string; stepDate: string; rolloutPct: number }[]): Promise<void>;
  /** PLANNED steps on or before `today` of flags that are not archived. */
  abstract dueSteps(today: string): Promise<DueStep[]>;
  abstract markStepRequested(stepId: string, changeRequestId: string): Promise<void>;
}
