import type { ChangePassword, MyPreferences, MyPreferencesResponse, MyProfile, MyProfileUpdateFields, UserActivity, UserSession } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for /api/me: the signed-in user's own account. */
export const getMyProfile = () => apiRequest<MyProfile>("/me/profile");
export const updateMyProfile = (body: MyProfileUpdateFields) => apiRequest<MyProfile>("/me/profile", { method: "PATCH", body });
export const changeMyPassword = (body: ChangePassword) => apiRequest<void>("/me/password", { method: "POST", body });
export const listMySessions = () => apiRequest<UserSession[]>("/me/sessions");
export const revokeMySession = (id?: string) => apiRequest<void>(`/me/sessions${id ? `/${id}` : ""}`, { method: "DELETE" });
export const getMyActivity = () => apiRequest<UserActivity[]>("/me/activity");
export const getMyPreferences = () => apiRequest<MyPreferencesResponse>("/me/preferences");
export const saveMyPreferences = (body: MyPreferences & { rowVersion?: number }) =>
  apiRequest<MyPreferencesResponse>("/me/preferences", { method: "PATCH", body });
