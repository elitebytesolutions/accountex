import type {
  RecruitmentActivityInput, RecruitmentCandidate, RecruitmentCandidateDetail, RecruitmentCandidateQuery, RecruitmentOpening, RecruitmentOptions, RecruitmentOverview,
} from '../../../../../shared/index.js';

export type RecruitmentOpeningMove = 'submit' | 'approve' | 'return' | 'open' | 'hold' | 'close' | 'cancel';

/** Port: job requisitions and candidates (HumanResources.JobOpenings / Candidates / CandidateActivities). */
export abstract class RecruitmentStore {
  abstract today(tenantId: string): Promise<string>;
  abstract overview(tenantId: string, today: string): Promise<RecruitmentOverview>;
  abstract options(tenantId: string): Promise<RecruitmentOptions>;
  abstract opening(tenantId: string, id: string): Promise<(RecruitmentOpening & { createdBy: string | null }) | null>;
  abstract candidates(tenantId: string, q: RecruitmentCandidateQuery): Promise<RecruitmentCandidate[]>;
  abstract candidate(tenantId: string, id: string): Promise<RecruitmentCandidateDetail | null>;
  /** Another candidate of the opening with this email. */
  abstract emailTaken(tenantId: string, openingId: string, email: string, exceptId: string | null): Promise<boolean>;
  abstract employeeIdOfUser(tenantId: string, userId: string): Promise<string | null>;

  abstract saveOpening(data: Record<string, unknown>): Promise<string>;
  abstract moveOpening(id: string, move: RecruitmentOpeningMove, args: { approvalRequestId?: string | null; channels?: string[] | null; reason?: string | null }): Promise<void>;
  abstract saveCandidate(data: Record<string, unknown>): Promise<string>;
  abstract moveCandidate(id: string, data: Record<string, unknown>): Promise<void>;
  abstract rejectCandidate(id: string, data: Record<string, unknown>): Promise<void>;
  /** Marks the candidate hired as `employeeId` and starts the onboarding; returns the onboarding id. */
  abstract hireCandidate(id: string, data: Record<string, unknown>): Promise<string>;
  abstract addActivity(tenantId: string, candidateId: string, input: RecruitmentActivityInput): Promise<void>;
  abstract onboardingRef(tenantId: string, id: string): Promise<{ id: string; docNo: string }>;
}
