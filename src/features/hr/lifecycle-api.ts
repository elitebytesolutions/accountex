import type {
  CompOffClaim, LeaveAdjustmentItem, LeaveBalanceView, LeaveFormOptions, LeaveOverview, LeavePreview, LeaveRequestDetail, LeaveRequestList, MyLeave, MyOnboarding,
  OffboardingBoard, OffboardingDetail, OffboardingOptions, OnboardingBoard, OnboardingDetail, OnboardingOptions, YearEndView,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const qs = (q: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};
const post = <T,>(path: string, body: Body = {}) => apiRequest<T>(path, { method: "POST", body });

/** Browser clients for Phase 31: leave requests, balances / adjustments / year-end, onboardings, offboardings, My Profile. */
export const leaveOverview = (q: { month?: string; departmentId?: string } = {}) => apiRequest<LeaveOverview>(`/hr/leave-requests/overview?${qs(q)}`);
export const leaveOptions = () => apiRequest<LeaveFormOptions>("/hr/leave-requests/options");
export const listLeave = (q: { status?: string; leaveTypeId?: string; departmentId?: string; period?: string; search?: string; page?: number; pageSize?: number }) => apiRequest<LeaveRequestList>(`/hr/leave-requests?${qs(q)}`);
export const getLeave = (id: string) => apiRequest<LeaveRequestDetail>(`/hr/leave-requests/${id}`);
export const previewLeave = (body: Body) => post<LeavePreview>("/hr/leave-requests/preview", { ...body, onBehalf: true });
export const applyOnBehalf = (body: Body) => post<LeaveRequestDetail>("/hr/leave-requests", body);
export const approveLeave = (id: string, comment: string | null) => post<LeaveRequestDetail>(`/hr/leave-requests/${id}/approve`, { comment });
export const rejectLeave = (id: string, body: Body) => post<LeaveRequestDetail>(`/hr/leave-requests/${id}/reject`, body);
export const cancelLeave = (id: string, rowVersion: number, reason: string | null) => post<LeaveRequestDetail>(`/hr/leave-requests/${id}/cancel`, { rowVersion, reason });
export const approveLeaves = (ids: string[]) => post<{ done: string[]; failed: { id: string; message: string }[] }>("/hr/leave-requests/approve-many", { ids });

export const leaveBalances = (q: { year?: string; search?: string; departmentId?: string; filter?: string; page?: number; pageSize?: number }) => apiRequest<LeaveBalanceView>(`/hr/leave-balances?${qs(q)}`);
export const runAccrual = (month: string) => post<{ credited: number; skipped: number; leaveYearStart: string }>(`/hr/leave-balances/accrue?${qs({ month })}`);
export const leaveAdjustments = (q: { employeeId?: string; leaveTypeId?: string; year?: string }) => apiRequest<LeaveAdjustmentItem[]>(`/hr/leave-adjustments?${qs(q)}`);
export const compOffClaims = (employeeId: string) => apiRequest<CompOffClaim[]>(`/hr/leave-adjustments/comp-off-claims/${employeeId}`);
export const addAdjustment = (body: Body) => post<LeaveAdjustmentItem>("/hr/leave-adjustments", body);
export const yearEnd = (year?: string) => apiRequest<YearEndView>(`/hr/leave-year-end?${qs({ year })}`);
export const closeYear = (year: string, body: Body) => post<YearEndView>(`/hr/leave-year-end/${year}/close`, body);
export const reverseYear = (id: string, reason: string, rowVersion: number) => post<YearEndView>(`/hr/leave-year-end/${id}/reverse`, { reason, rowVersion });

export const myLeave = () => apiRequest<MyLeave>("/me/leave-balances");
export const previewMyLeave = (body: Body) => post<LeavePreview>("/me/leave-requests/preview", body);
export const applyLeave = (body: Body) => post<LeaveRequestDetail>("/me/leave-requests", body);
export const cancelMyLeave = (id: string, rowVersion: number, reason?: string) => post<LeaveRequestDetail>(`/me/leave-requests/${id}/cancel`, { rowVersion, reason: reason ?? null });

export const onboardingBoard = (status = "OPEN") => apiRequest<OnboardingBoard>(`/hr/onboardings?${qs({ status })}`);
export const onboardingOptions = () => apiRequest<OnboardingOptions>("/hr/onboardings/options");
export const getOnboarding = (id: string) => apiRequest<OnboardingDetail>(`/hr/onboardings/${id}`);
export const startOnboarding = (body: Body) => post<OnboardingDetail>("/hr/onboardings", body);
export const updateOnboarding = (id: string, body: Body) => apiRequest<OnboardingDetail>(`/hr/onboardings/${id}`, { method: "PATCH", body });
export const cancelOnboarding = (id: string, rowVersion: number, reason: string | null) => post<OnboardingDetail>(`/hr/onboardings/${id}/cancel`, { rowVersion, reason });
export const updateOnboardingTask = (id: string, taskId: string, body: Body) => apiRequest<OnboardingDetail>(`/hr/onboardings/${id}/tasks/${taskId}`, { method: "PATCH", body });
export const myOnboarding = () => apiRequest<MyOnboarding>("/me/onboarding");
export const completeMyTask = (id: string, rowVersion: number, note: string | null) => post<MyOnboarding>(`/me/onboarding/tasks/${id}/complete`, { rowVersion, note });

export const offboardingBoard = (status = "ALL") => apiRequest<OffboardingBoard>(`/hr/offboardings?${qs({ status })}`);
export const offboardingOptions = () => apiRequest<OffboardingOptions>("/hr/offboardings/options");
export const getOffboarding = (id: string) => apiRequest<OffboardingDetail>(`/hr/offboardings/${id}`);
export const createOffboarding = (body: Body) => post<OffboardingDetail>("/hr/offboardings", body);
export const updateOffboarding = (id: string, body: Body) => apiRequest<OffboardingDetail>(`/hr/offboardings/${id}`, { method: "PATCH", body });
export const clearItem = (id: string, itemId: string, action: "clear" | "waive", remarks: string | null) => post<OffboardingDetail>(`/hr/offboardings/${id}/clearance/${itemId}/${action}`, { remarks });
export const saveExitInterview = (id: string, body: Body) => apiRequest<OffboardingDetail>(`/hr/offboardings/${id}/exit-interview`, { method: "PUT", body });
export const completeOffboarding = (id: string, rowVersion: number) => post<OffboardingDetail>(`/hr/offboardings/${id}/complete`, { rowVersion });
export const withdrawOffboarding = (id: string, rowVersion: number, reason: string | null) => post<OffboardingDetail>(`/hr/offboardings/${id}/withdraw`, { rowVersion, reason });
