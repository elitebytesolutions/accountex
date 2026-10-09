import type { PerfFeedback, PerfGoal, PerfOneOnOne, PerfOptions, PerfReviewDetail, PerfReviewItem, PerfReviewQuery } from '../../../../../shared/index.js';

export type PerfEmployee = { id: string; name: string; designation: string | null; department: string | null; managerId: string | null; status: string };

/** Port: reviews, goals + key results, competency ratings, feedback and 1:1s (HumanResources schema). */
export abstract class PerformanceStore {
  abstract today(tenantId: string): Promise<string>;
  abstract employee(tenantId: string, id: string): Promise<PerfEmployee | null>;
  abstract employeeOfUser(tenantId: string, userId: string): Promise<PerfEmployee | null>;
  abstract options(tenantId: string): Promise<PerfOptions>;
  abstract departments(tenantId: string): Promise<{ id: string; name: string }[]>;

  abstract reviews(tenantId: string, cycleId: string, q: PerfReviewQuery): Promise<{ items: PerfReviewItem[]; total: number; counts: Record<string, number> }>;
  abstract reviewStats(tenantId: string, cycleId: string): Promise<{
    eligible: number; selfSubmitted: number; managerSubmitted: number; avgRating: number | null; goalsOnTrack: number; goalsTotal: number;
    nineBox: { box: string; count: number; names: string[] }[];
  }>;
  abstract avgFinalRating(tenantId: string, cycleId: string): Promise<number | null>;
  abstract review(tenantId: string, id: string): Promise<PerfReviewDetail | null>;
  abstract reviewOf(tenantId: string, cycleId: string, employeeId: string): Promise<string | null>;
  /** Reviews where the employee is the manager and the review waits for them. */
  abstract managerQueue(tenantId: string, managerId: string): Promise<PerfReviewItem[]>;
  abstract generate(cycleId: string): Promise<number>;
  abstract reviewStep(fn: 'performanceReviewSubmitSelf' | 'performanceReviewSubmitManager' | 'performanceReviewCalibrate' | 'performanceReviewSignOff', id: string, data: Record<string, unknown>): Promise<void>;

  abstract goals(tenantId: string, q: { employeeId?: string; cycleId?: string | null }): Promise<PerfGoal[]>;
  abstract goal(tenantId: string, id: string): Promise<PerfGoal | null>;
  abstract saveGoal(data: Record<string, unknown>): Promise<string>;
  abstract deleteGoal(tenantId: string, id: string, rowVersion: number): Promise<void>;

  abstract feedback(tenantId: string, q: { toEmployeeId?: string; fromEmployeeId?: string; status?: string }): Promise<PerfFeedback[]>;
  abstract feedbackOne(tenantId: string, id: string): Promise<PerfFeedback | null>;
  abstract saveFeedback(data: Record<string, unknown>): Promise<string>;
  abstract answerFeedback(id: string, data: Record<string, unknown>): Promise<void>;

  abstract oneOnOnes(tenantId: string, employeeId?: string): Promise<PerfOneOnOne[]>;
  abstract oneOnOne(tenantId: string, id: string): Promise<PerfOneOnOne | null>;
  abstract saveOneOnOne(data: Record<string, unknown>): Promise<string>;
  abstract deleteOneOnOne(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract colleagues(tenantId: string, exceptId: string): Promise<{ id: string; name: string; designation: string | null; department: string | null }[]>;
}
