import type {
  NotificationItem, NotificationList, NotificationPreferences, PendingInvite, SignInLink, SignInTokenInfo, Task, TodayView, UserInviteResult, WorkUser, WorkspaceDashboard,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Q = Record<string, string | number | boolean | null | undefined>;
const qs = (q: Q) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const post = <T,>(path: string, body?: Body) => apiRequest<T>(path, { method: "POST", body: body ?? {} });

/** Browser clients for Phase 44: Today's Work, notifications, dashboard, invites and sign-in links. */
export const getToday = () => apiRequest<TodayView>("/work/today");
export const getDashboard = () => apiRequest<WorkspaceDashboard>("/work/dashboard");
export const workUsers = () => apiRequest<WorkUser[]>("/work/users");
export const listTasks = (q: Q) => apiRequest<Task[]>(`/work/tasks${qs(q)}`);
export const createTask = (body: Body) => post<Task>("/work/tasks", body);
export const updateTask = (id: string, body: Body) => apiRequest<Task>(`/work/tasks/${id}`, { method: "PATCH", body });
export const completeTask = (id: string, rv: number) => post<{ task: Task; next: Task | null }>(`/work/tasks/${id}/complete`, { rowVersion: rv });
export const setTaskStatus = (id: string, rv: number, status: string) => post<Task>(`/work/tasks/${id}/status`, { rowVersion: rv, status });
export const deleteTask = (id: string, rv: number) => apiRequest<void>(`/work/tasks/${id}?rowVersion=${rv}`, { method: "DELETE" });

export const listNotifications = (q: Q) => apiRequest<NotificationList>(`/me/notifications${qs(q)}`);
export const notificationBell = () => apiRequest<{ unread: number; items: NotificationItem[] }>("/me/notifications/bell");
export const readNotifications = (ids: string[]) => post<{ read: number }>("/me/notifications/read", { ids });
export const readAllNotifications = (category?: string | null) => post<{ read: number }>("/me/notifications/read-all", { category: category ?? null });
export const archiveNotification = (id: string) => post<void>(`/me/notifications/${id}/archive`);
export const getPreferences = () => apiRequest<NotificationPreferences>("/me/notification-preferences");
export const savePreferences = (body: NotificationPreferences) => apiRequest<NotificationPreferences>("/me/notification-preferences", { method: "PATCH", body });

export const listInvites = (all = false) => apiRequest<PendingInvite[]>(`/settings/users/invites${all ? "?all=true" : ""}`);
export const inviteUser = (body: Body) => post<UserInviteResult>("/settings/users/invites", body);
export const resendInvite = (id: string, rv: number) => post<{ invite: PendingInvite; link: SignInLink }>(`/settings/users/invites/${id}/resend`, { rowVersion: rv });
export const revokeInvite = (id: string, rv: number) => post<PendingInvite>(`/settings/users/invites/${id}/revoke`, { rowVersion: rv });
export const userResetLink = (id: string) => post<SignInLink>(`/settings/users/${id}/reset-link`);

export const forgotPassword = (companyCode: string, email: string) => post<{ ok: boolean }>("/auth/forgot", { companyCode, email });
export const tokenInfo = (token: string) => apiRequest<SignInTokenInfo>(`/auth/token/${encodeURIComponent(token)}`);
export const setPasswordWithToken = (token: string, password: string) => post<{ companyCode: string; email: string }>("/auth/reset", { token, password });

/** The full link to share (the server returns a path). */
export const absoluteLink = (path: string) => (typeof window === "undefined" ? path : `${window.location.origin}${path}`);
