import type {
  ChangeRequest, ChangeRequestList, EntitlementChangeSet, EntitlementSave, EntitlementSaveResult, FlagEnvironment, FlagEnvironmentInput, FlagScheduleStep,
  Incident, PrivacyCertificate, PrivacyRequest, PrivacyRequestList, ScheduleRunResult, StatusPage,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for Phase 43 platform operations (/api/admin/…). */

/* incidents + status page */
export const listIncidents = (days = 90) => apiRequest<Incident[]>(`/admin/incidents?days=${days}`);
export const getStatusPage = () => apiRequest<StatusPage>("/admin/incidents/status");
export const declareIncident = (body: Record<string, unknown>) => apiRequest<Incident>("/admin/incidents", { method: "POST", body });
export const postIncidentUpdate = (id: string, body: { stage: string; message: string; notifySubscribers: boolean; updateBanner: boolean }) =>
  apiRequest<Incident>(`/admin/incidents/${id}/updates`, { method: "POST", body });
export const savePostmortem = (id: string, body: { postmortemRef: string; rowVersion: number }) => apiRequest<Incident>(`/admin/incidents/${id}/postmortem`, { method: "POST", body });

/* change requests */
export const listChangeRequests = (status = "ALL", flagId?: string) =>
  apiRequest<ChangeRequestList>(`/admin/change-requests?status=${status}${flagId ? `&flagId=${flagId}` : ""}`);
export const getChangeRequest = (id: string) => apiRequest<ChangeRequest>(`/admin/change-requests/${id}`);
export type ChangeRequestChange = { kind: "TOGGLE"; isOn: boolean } | { kind: "TARGETING"; input: FlagEnvironmentInput };
export const createChangeRequest = (body: { flagId: string; environment: FlagEnvironment; reason: string; applyNotBefore?: string | null; change: ChangeRequestChange }) =>
  apiRequest<ChangeRequest>("/admin/change-requests", { method: "POST", body });
export const commentChangeRequest = (id: string, text: string) => apiRequest<ChangeRequest>(`/admin/change-requests/${id}/comments`, { method: "POST", body: { body: text } });
export const decideChangeRequest = (id: string, action: "approve" | "reject", note: string, confirmKey?: string) =>
  apiRequest<ChangeRequest>(`/admin/change-requests/${id}/${action}`, { method: "POST", body: { note, ...(confirmKey ? { confirmKey } : {}) } });
export const cancelChangeRequest = (id: string) => apiRequest<ChangeRequest>(`/admin/change-requests/${id}/cancel`, { method: "POST", body: {} });
export const runSchedule = () => apiRequest<ScheduleRunResult>("/admin/change-requests/run-schedule", { method: "POST", body: {} });
export const getFlagSchedule = (flagId: string, env: FlagEnvironment) => apiRequest<FlagScheduleStep[]>(`/admin/flags/${flagId}/schedule/${env}`);
export const saveFlagSchedule = (flagId: string, env: FlagEnvironment, steps: { id?: string; stepDate: string; rolloutPct: number }[]) =>
  apiRequest<FlagScheduleStep[]>(`/admin/flags/${flagId}/schedule/${env}`, { method: "PUT", body: { steps } });

/* privacy requests */
export const listPrivacyRequests = () => apiRequest<PrivacyRequestList>("/admin/privacy-requests");
export const createPrivacyRequest = (body: Record<string, unknown>) => apiRequest<PrivacyRequest>("/admin/privacy-requests", { method: "POST", body });
export const verifyPrivacyRequest = (id: string) => apiRequest<PrivacyRequest>(`/admin/privacy-requests/${id}/verify`, { method: "POST", body: {} });
export const approvePrivacyRequest = (id: string, body: { note?: string; confirmCode?: string }) => apiRequest<PrivacyRequest>(`/admin/privacy-requests/${id}/approve`, { method: "POST", body });
export const rejectPrivacyRequest = (id: string, reason: string) => apiRequest<PrivacyRequest>(`/admin/privacy-requests/${id}/reject`, { method: "POST", body: { reason } });
export const fulfilPrivacyRequest = (id: string, confirmCode?: string) =>
  apiRequest<PrivacyRequest>(`/admin/privacy-requests/${id}/fulfil`, { method: "POST", body: confirmCode ? { confirmCode } : {} });
export const privacyCertificate = (id: string) => apiRequest<PrivacyCertificate>(`/admin/privacy-requests/${id}/certificate`);
export const privacyExportUrl = (id: string) => `/api/admin/privacy-requests/${id}/export`;

/* entitlement change log */
export const saveEntitlements = (body: EntitlementSave) => apiRequest<EntitlementSaveResult>("/admin/entitlements/save", { method: "POST", body });
export const listEntitlementChanges = () => apiRequest<EntitlementChangeSet[]>("/admin/entitlements/changes");
