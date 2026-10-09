import type {
  MyGoals, PerfBoard, PerfFeedback, PerfGoal, PerfOneOnOne, PerfOptions, PerfReviewDetail, RecruitmentCandidate, RecruitmentCandidateDetail, RecruitmentHireResult,
  RecruitmentOpeningAction, RecruitmentOpeningDetail, RecruitmentOptions, RecruitmentOverview, TrainingBoard, TrainingEnrolResult, TrainingEnrolmentItem,
  TrainingOptions, TrainingSessionItem,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const qs = (q: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};
const post = <T,>(path: string, body: Body = {}) => apiRequest<T>(path, { method: "POST", body });
const patch = <T,>(path: string, body: Body) => apiRequest<T>(path, { method: "PATCH", body });

/** Browser clients for Phase 33 (talent): recruitment, performance (+ My Goals) and training. */
// ---------------------------------------------------------------- recruitment
export const getRecruitment = () => apiRequest<RecruitmentOverview>("/hr/recruitment");
export const getRecruitmentOptions = () => apiRequest<RecruitmentOptions>("/hr/recruitment/options");
export const getJobOpening = (id: string) => apiRequest<RecruitmentOpeningDetail>(`/hr/job-openings/${id}`);
export const createJobOpening = (body: Body) => post<RecruitmentOpeningDetail>("/hr/job-openings", body);
export const updateJobOpening = (id: string, body: Body) => patch<RecruitmentOpeningDetail>(`/hr/job-openings/${id}`, body);
export const jobOpeningAction = (id: string, action: RecruitmentOpeningAction, body: Body) => post<RecruitmentOpeningDetail>(`/hr/job-openings/${id}/${action}`, body);
export const listCandidates = (q: { openingId?: string; stage?: string; search?: string } = {}) => apiRequest<RecruitmentCandidate[]>(`/hr/candidates?${qs(q)}`);
export const getCandidate = (id: string) => apiRequest<RecruitmentCandidateDetail>(`/hr/candidates/${id}`);
export const createCandidate = (body: Body) => post<RecruitmentCandidateDetail>("/hr/candidates", body);
export const updateCandidate = (id: string, body: Body) => patch<RecruitmentCandidateDetail>(`/hr/candidates/${id}`, body);
export const candidateAction = (id: string, action: "move" | "reject" | "activities", body: Body) => post<RecruitmentCandidateDetail>(`/hr/candidates/${id}/${action}`, body);
export const hireCandidate = (id: string, body: Body) => post<RecruitmentHireResult>(`/hr/candidates/${id}/hire`, body);

// ---------------------------------------------------------------- performance
export const getPerfBoard = (q: { cycle?: string; search?: string; departmentId?: string; stage?: string; page?: number; pageSize?: number } = {}) => apiRequest<PerfBoard>(`/hr/performance/reviews?${qs(q)}`);
export const getPerfOptions = () => apiRequest<PerfOptions>("/hr/performance/options");
export const generateReviews = (cycleId: string) => post<{ added: number }>("/hr/performance/reviews/generate", { cycleId });
export const getPerfReview = (id: string) => apiRequest<PerfReviewDetail>(`/hr/performance/reviews/${id}`);
export const perfReviewStep = (id: string, step: "manager" | "calibrate" | "sign-off", body: Body) => post<PerfReviewDetail>(`/hr/performance/reviews/${id}/${step}`, body);
export const listPerfGoals = (q: { employeeId?: string; cycleId?: string }) => apiRequest<PerfGoal[]>(`/hr/performance/goals?${qs(q)}`);
export const createPerfGoal = (body: Body) => post<PerfGoal>("/hr/performance/goals", body);
export const updatePerfGoal = (id: string, body: Body) => patch<PerfGoal>(`/hr/performance/goals/${id}`, body);
export const deletePerfGoal = (id: string, rv: number) => apiRequest<void>(`/hr/performance/goals/${id}?rowVersion=${rv}`, { method: "DELETE" });
export const listPerfFeedback = (employeeId?: string) => apiRequest<PerfFeedback[]>(`/hr/performance/feedback?${qs({ employeeId })}`);
export const listOneOnOnes = (employeeId?: string) => apiRequest<PerfOneOnOne[]>(`/hr/performance/one-on-ones?${qs({ employeeId })}`);

// ---------------------------------------------------------------- my goals
export const getMyGoals = () => apiRequest<MyGoals>("/me/goals");
export const myGoalCheckIn = (items: { goalId: string; keyResultId?: string | null; progressPct: number }[]) => post<MyGoals>("/me/goals/check-in", { items });
export const createMyGoal = (body: Body) => post<PerfGoal>("/me/goals", body);
export const submitMySelfReview = (id: string, body: Body) => post<MyGoals>(`/me/reviews/${id}/self`, body);
export const submitMyManagerReview = (id: string, body: Body) => post<MyGoals>(`/me/reviews/${id}/manager`, body);
export const getMyReview = (id: string) => apiRequest<PerfReviewDetail>(`/me/reviews/${id}`);
export const requestMyFeedback = (fromEmployeeIds: string[]) => post<MyGoals>("/me/feedback/request", { fromEmployeeIds });
export const giveMyFeedback = (body: Body) => post<MyGoals>("/me/feedback", body);
export const answerMyFeedback = (id: string, body: Body) => post<MyGoals>(`/me/feedback/${id}/answer`, body);
export const addMyOneOnOne = (body: Body) => post<MyGoals>("/me/one-on-ones", body);
export const setMyActionItems = (id: string, actionItems: { text: string; done: boolean }[], rowVersion: number) => patch<MyGoals>(`/me/one-on-ones/${id}/actions`, { actionItems, rowVersion });

// ---------------------------------------------------------------- training
export const getTrainingBoard = (q: { search?: string; status?: string; programId?: string; page?: number; pageSize?: number } = {}) => apiRequest<TrainingBoard>(`/hr/training?${qs(q)}`);
export const getTrainingOptions = () => apiRequest<TrainingOptions>("/hr/training/options");
export const createTrainingSession = (programId: string, body: Body) => post<TrainingSessionItem>(`/hr/training-programs/${programId}/sessions`, body);
export const updateTrainingSession = (id: string, body: Body) => patch<TrainingSessionItem>(`/hr/training/sessions/${id}`, body);
export const enrolEmployees = (body: Body) => post<TrainingEnrolResult>("/hr/training/enrol", body);
export const updateEnrolment = (id: string, body: Body) => patch<TrainingEnrolmentItem>(`/hr/training/enrolments/${id}`, body);
export const enrolmentAction = (id: string, action: "complete" | "withdraw", body: Body) => post<TrainingEnrolmentItem>(`/hr/training/enrolments/${id}/${action}`, body);
