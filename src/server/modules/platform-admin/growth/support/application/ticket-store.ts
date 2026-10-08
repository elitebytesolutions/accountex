import type { Ticket, TicketDetail, TicketKpis, TicketListQuery, TicketMessage } from '../../../../../../shared/index.js';

/**
 * Port: Platform.SupportTickets and SupportTicketMessages (Platform.supportTicketAddUpdate / supportTicketReply). Used by
 * the Super Admin board and by the company's "Help & support" (support-desk), which never asks for internal notes.
 */
export abstract class TicketStore {
  abstract list(q: TicketListQuery): Promise<Ticket[]>;
  /** A company's tickets; `requesterUserId` limits them to one user's. Message counts exclude internal notes. */
  abstract listForTenant(tenantId: string, requesterUserId: string | null): Promise<Ticket[]>;
  abstract get(id: string): Promise<Ticket | null>;
  abstract messages(ticketId: string, includeInternal: boolean): Promise<TicketMessage[]>;
  abstract supportSessions(ticketId: string): Promise<TicketDetail['supportSessions']>;
  abstract kpis(): Promise<TicketKpis>;
  abstract staff(): Promise<{ id: string; name: string }[]>;
  abstract tenantExists(id: string): Promise<boolean>;
  abstract staffExists(id: string): Promise<boolean>;
  /** Platform.supportTicketAddUpdate: insert (with its first message) or partial update (rowVersion checked when given). */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Platform.supportTicketReply: one message and its effect on the ticket (first response, status). */
  abstract reply(data: { ticketId: string; authorKind: 'STAFF' | 'CUSTOMER'; authorStaffId?: string | null; authorUserId?: string | null; authorName: string; body: string; isInternalNote?: boolean; status?: string }): Promise<string>;
  /** Links a support (impersonation) session to the ticket it was started from. */
  abstract linkSupportSession(sessionId: string, ticketId: string): Promise<void>;
}
