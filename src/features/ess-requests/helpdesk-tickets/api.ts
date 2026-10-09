import type { TicketAgentOption, TicketDetail, TicketList } from "@/shared/self-service/helpdesk-ticket";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const post = (path: string, body: Body) => apiRequest<TicketDetail>(path, { method: "POST", body });

/** Browser clients for Phase 34 helpdesk tickets (/api/helpdesk/tickets). */
export const listTickets = (scope: "mine" | "assigned" | "all", status?: string) =>
  apiRequest<TicketList>(`/helpdesk/tickets?scope=${scope}${status && status !== "ALL" ? `&status=${status}` : ""}`);
export const getTicket = (id: string) => apiRequest<TicketDetail>(`/helpdesk/tickets/${id}`);
export const ticketAgents = () => apiRequest<TicketAgentOption[]>("/helpdesk/tickets/agents");
export const raiseTicket = (body: Body) => post("/helpdesk/tickets", body);
export const sendTicketMessage = (id: string, text: string) => post(`/helpdesk/tickets/${id}/messages`, { body: text });
export const assignTicket = (id: string, agentEmployeeId: string, rowVersion: number) => post(`/helpdesk/tickets/${id}/assign`, { agentEmployeeId, rowVersion });
export const resolveTicket = (id: string, rowVersion: number, note: string | null) => post(`/helpdesk/tickets/${id}/resolve`, { rowVersion, note });
export const reopenTicket = (id: string, rowVersion: number, reason: string) => post(`/helpdesk/tickets/${id}/reopen`, { rowVersion, reason });
export const rateTicket = (id: string, rowVersion: number, csatRating: number, comment: string | null) => post(`/helpdesk/tickets/${id}/rate`, { rowVersion, csatRating, comment });
