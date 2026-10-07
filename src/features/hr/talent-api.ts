import type { CompanyPolicy, ListResult, OnboardingTemplate, PerformanceCycle, TrainingProgram } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
type ListParams = { search?: string; status?: string; page?: number; pageSize?: number };
const qs = (q: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });
const act = <T,>(path: string, rowVersion: number, extra: Body = {}) => apiRequest<T>(path, { method: "POST", body: { ...extra, rowVersion } });

/** Browser clients for Phase 13: talent & policy setup. */
export const listOnboardingTemplates = (q: ListParams = {}) => apiRequest<ListResult<OnboardingTemplate>>(`/hr/onboarding-templates?${qs({ pageSize: 100, ...q })}`);
export const createOnboardingTemplate = (body: Body) => apiRequest<OnboardingTemplate>("/hr/onboarding-templates", { method: "POST", body });
export const updateOnboardingTemplate = (id: string, body: Body & Version) => apiRequest<OnboardingTemplate>(`/hr/onboarding-templates/${id}`, { method: "PATCH", body });
export const onboardingTemplateAction = (id: string, action: "activate" | "deactivate" | "default", rv: number) => act<OnboardingTemplate>(`/hr/onboarding-templates/${id}/${action}`, rv);
export const deleteOnboardingTemplate = (id: string, rv: number) => del(`/hr/onboarding-templates/${id}`, rv);

export const listPerformanceCycles = (q: ListParams = {}) => apiRequest<ListResult<PerformanceCycle>>(`/hr/performance-cycles?${qs({ pageSize: 100, ...q })}`);
export const createPerformanceCycle = (body: Body) => apiRequest<PerformanceCycle>("/hr/performance-cycles", { method: "POST", body });
export const updatePerformanceCycle = (id: string, body: Body & Version) => apiRequest<PerformanceCycle>(`/hr/performance-cycles/${id}`, { method: "PATCH", body });
export const performanceCycleAction = (id: string, action: "open" | "advance" | "close", rv: number) => act<PerformanceCycle>(`/hr/performance-cycles/${id}/${action}`, rv);
export const deletePerformanceCycle = (id: string, rv: number) => del(`/hr/performance-cycles/${id}`, rv);

export const listTrainingPrograms = (q: ListParams = {}) => apiRequest<ListResult<TrainingProgram>>(`/hr/training-programs?${qs(q)}`);
export const createTrainingProgram = (body: Body) => apiRequest<TrainingProgram>("/hr/training-programs", { method: "POST", body });
export const updateTrainingProgram = (id: string, body: Body & Version) => apiRequest<TrainingProgram>(`/hr/training-programs/${id}`, { method: "PATCH", body });
export const setTrainingProgramStatus = (id: string, status: string, rv: number) => act<TrainingProgram>(`/hr/training-programs/${id}/status`, rv, { status });
export const deleteTrainingProgram = (id: string, rv: number) => del(`/hr/training-programs/${id}`, rv);

export const listPolicies = (q: ListParams = {}) => apiRequest<ListResult<CompanyPolicy>>(`/hr/policies?${qs(q)}`);
export const createPolicy = (body: Body) => apiRequest<CompanyPolicy>("/hr/policies", { method: "POST", body });
export const updatePolicy = (id: string, body: Body & Version) => apiRequest<CompanyPolicy>(`/hr/policies/${id}`, { method: "PATCH", body });
export const policyAction = (id: string, action: "publish" | "retire" | "new-version", rv: number) => act<CompanyPolicy>(`/hr/policies/${id}/${action}`, rv);
export const deletePolicy = (id: string, rv: number) => del(`/hr/policies/${id}`, rv);
