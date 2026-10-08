import type { MyTicketList, PlatformNoticeFeed, TicketDetail } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Workspace side of Phase 42: "Help & support" tickets and the platform notices behind the shell banner. */
export const listMyTickets = () => apiRequest<MyTicketList>("/support/tickets");
export const getMyTicket = (id: string) => apiRequest<TicketDetail>(`/support/tickets/${id}`);
export const raiseTicket = (body: { subject: string; category: string; priority: string; body: string }) => apiRequest<TicketDetail>("/support/tickets", { method: "POST", body });
export const replyMyTicket = (id: string, body: string) => apiRequest<TicketDetail>(`/support/tickets/${id}/messages`, { method: "POST", body: { body } });
export const rateMyTicket = (id: string, rating: number, comment: string) => apiRequest<TicketDetail>(`/support/tickets/${id}/csat`, { method: "POST", body: { rating, comment } });

export const getPlatformNotices = () => apiRequest<PlatformNoticeFeed>("/me/platform-announcements");
export const markPlatformNotice = (id: string, what: "view" | "click" | "dismiss") => apiRequest<void>(`/me/platform-announcements/${id}/${what}`, { method: "POST", body: {} });
export const readPlatformMessages = () => apiRequest<{ read: number }>("/me/platform-announcements/messages/read", { method: "POST", body: {} });

/** Phase 43's open public incidents (GET /api/status/active-incidents); [] until that endpoint exists or on any error. */
export type ActiveIncident = { id: string; docNo: string; title: string; impact: string; stage: string; components: string[]; startedAt: string };
export async function getActiveIncidents(): Promise<ActiveIncident[]> {
  try {
    const r = await apiRequest<ActiveIncident[] | { items: ActiveIncident[] }>("/status/active-incidents");
    return Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : [];
  } catch {
    return [];
  }
}
