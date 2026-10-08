import type {
  BroadcastResult, CommLog, CommLogList, ImpersonationStart, LeadBoard, LeadDetail, PlatformAnnouncement, PlatformAnnouncementList,
  TenantOnboardResult, TicketBoard, TicketDetail,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser-side Super Admin calls of Phase 42 (growth & support): leads, tickets, announcements, broadcasts, comm logs. */
type Body = Record<string, unknown>;
const qs = (q: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
};

// ---- leads
export const getLeadBoard = (q: { search?: string; ownerStaffId?: string } = {}) => apiRequest<LeadBoard>(`/admin/leads${qs(q)}`);
export const getLead = (id: string) => apiRequest<LeadDetail>(`/admin/leads/${id}`);
export const createLead = (body: Body) => apiRequest<LeadDetail>("/admin/leads", { method: "POST", body });
export const updateLead = (id: string, body: Body) => apiRequest<LeadDetail>(`/admin/leads/${id}`, { method: "PATCH", body });
export const deleteLead = (id: string, rowVersion: number) => apiRequest<void>(`/admin/leads/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
export const moveLead = (id: string, body: { stage: string; beforeId?: string | null; note?: string; lostReason?: string; rowVersion: number }) =>
  apiRequest<LeadDetail>(`/admin/leads/${id}/move`, { method: "POST", body });
export const addLeadActivity = (id: string, body: { activityType: string; note: string }) => apiRequest<LeadDetail>(`/admin/leads/${id}/activities`, { method: "POST", body });
export const convertLead = (id: string, body: Body) => apiRequest<TenantOnboardResult & { leadId: string }>(`/admin/leads/${id}/convert`, { method: "POST", body });

// ---- support tickets
export const getTicketBoard = (q: { search?: string; assigneeStaffId?: string; category?: string; priority?: string } = {}) => apiRequest<TicketBoard>(`/admin/tickets${qs(q)}`);
export const getTicket = (id: string) => apiRequest<TicketDetail>(`/admin/tickets/${id}`);
export const createTicket = (body: Body) => apiRequest<TicketDetail>("/admin/tickets", { method: "POST", body });
export const updateTicket = (id: string, body: Body) => apiRequest<TicketDetail>(`/admin/tickets/${id}`, { method: "PATCH", body });
export const replyTicket = (id: string, body: { body: string; isInternalNote: boolean; resolve: boolean }) => apiRequest<TicketDetail>(`/admin/tickets/${id}/messages`, { method: "POST", body });
export const assignTicket = (id: string, assigneeStaffId: string | null, rowVersion: number) =>
  apiRequest<TicketDetail>(`/admin/tickets/${id}/assign`, { method: "POST", body: { assigneeStaffId, rowVersion } });
export const ticketAction = (id: string, action: "resolve" | "reopen" | "close", rowVersion: number, note?: string) =>
  apiRequest<TicketDetail>(`/admin/tickets/${id}/${action}`, { method: "POST", body: { rowVersion, note } });
export const impersonateFromTicket = (id: string, body: { targetUserId?: string; reason: string; timeLimitMinutes: 30 | 60; isReadOnly: boolean }) =>
  apiRequest<ImpersonationStart>(`/admin/tickets/${id}/impersonate`, { method: "POST", body });

// ---- announcements
export const listAnnouncements = (q: { status?: string; type?: string } = {}) => apiRequest<PlatformAnnouncementList>(`/admin/announcements${qs(q)}`);
export const createAnnouncement = (body: Body) => apiRequest<PlatformAnnouncement>("/admin/announcements", { method: "POST", body });
export const updateAnnouncement = (id: string, body: Body) => apiRequest<PlatformAnnouncement>(`/admin/announcements/${id}`, { method: "PATCH", body });
export const deleteAnnouncement = (id: string) => apiRequest<void>(`/admin/announcements/${id}`, { method: "DELETE" });
export const scheduleAnnouncement = (id: string, publishAt: string, rowVersion: number) =>
  apiRequest<PlatformAnnouncement>(`/admin/announcements/${id}/schedule`, { method: "POST", body: { publishAt, rowVersion } });
export const announcementAction = (id: string, action: "publish" | "archive", rowVersion: number) =>
  apiRequest<PlatformAnnouncement>(`/admin/announcements/${id}/${action}`, { method: "POST", body: { rowVersion } });

// ---- broadcasts & delivery log
export const sendBroadcast = (body: Body) => apiRequest<BroadcastResult>("/admin/broadcasts", { method: "POST", body });
export const listCommLogs = (q: { filter?: string; hours?: number; tenantId?: string; page?: number; pageSize?: number } = {}) => apiRequest<CommLogList>(`/admin/comm-logs${qs(q)}`);
export const retryCommLog = (id: string) => apiRequest<CommLog>(`/admin/comm-logs/${id}/retry`, { method: "POST", body: {} });
