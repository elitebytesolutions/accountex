import type { MyProfile, ProfileChangeDecision, ProfileChangeList, ProfileChangeRequest } from "@/shared/self-service/profile-change";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for Phase 34 profile change requests (My Profile › Personal details, and HR's review queue). */
export const myPersonalDetails = () => apiRequest<MyProfile>("/me/personal-details");
export const requestProfileChange = (body: { fieldKey: string; requestedValue: string; reason?: string | null }) =>
  apiRequest<ProfileChangeRequest>("/me/profile-change-requests", { method: "POST", body });
export const withdrawProfileChange = (id: string, rowVersion: number) =>
  apiRequest<ProfileChangeRequest>(`/me/profile-change-requests/${id}/withdraw`, { method: "POST", body: { rowVersion } });

export const listProfileChanges = (status = "PENDING", search?: string) =>
  apiRequest<ProfileChangeList>(`/hr/profile-change-requests?status=${status}${search ? `&search=${encodeURIComponent(search)}` : ""}`);
export const approveProfileChange = (id: string, rowVersion: number, comment?: string | null) =>
  apiRequest<ProfileChangeDecision>(`/hr/profile-change-requests/${id}/approve`, { method: "POST", body: { rowVersion, comment: comment ?? null } });
export const rejectProfileChange = (id: string, rowVersion: number, comment: string) =>
  apiRequest<ProfileChangeDecision>(`/hr/profile-change-requests/${id}/reject`, { method: "POST", body: { rowVersion, comment } });
