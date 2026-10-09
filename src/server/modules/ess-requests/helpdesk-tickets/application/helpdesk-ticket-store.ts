import type { TicketAgentOption, TicketDeskRouting, TicketItem, TicketMessage, TicketQuery } from '../../../../../shared/self-service/helpdesk-ticket.js';

export type TicketRow = TicketItem & { description: string; categoryOwnerId: string | null };
export type TicketStatusChange = {
  status: string; firstResponseAt?: string; resolvedAt?: string | null; slaMet?: boolean | null; closedAt?: string;
  reopenedCount?: number; csatRating?: number; csatAt?: string;
};
export type TicketDeskFull = { id: string; name: string; status: string; slaHours: number; highPrioritySlaFactor: number; ownerEmployeeId: string | null };

/** Port: helpdesk tickets and their message thread. */
export abstract class HelpdeskTicketStore {
  /** `employeeId` = raised by; `agentOf` = assigned to that employee or in a desk they own. */
  abstract list(tenantId: string, q: TicketQuery & { employeeId?: string; agentOf?: string }): Promise<{ items: TicketItem[]; total: number; counts: Record<string, number> }>;
  abstract get(tenantId: string, id: string): Promise<TicketRow | null>;
  abstract messages(tenantId: string, ticketId: string): Promise<TicketMessage[]>;
  abstract desk(tenantId: string, id: string): Promise<TicketDeskFull | null>;
  /** Whether the employee owns any active desk. */
  abstract ownsDesk(tenantId: string, employeeId: string): Promise<boolean>;
  /** Active desks with their routing facts; `open` counts the employee's live tickets per desk. */
  abstract deskRouting(tenantId: string, employeeId: string | null): Promise<TicketDeskRouting[]>;
  abstract agents(tenantId: string): Promise<TicketAgentOption[]>;
  abstract activeEmployee(tenantId: string, employeeId: string): Promise<boolean>;
  abstract employeeOfUser(tenantId: string, userId: string): Promise<string | null>;

  /** helpdeskTicketAddUpdate (insert numbers HD-; update checks rowVersion). Never pass `messages`. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /**
   * Status changes (the save function never writes `status`): one UPDATE of the status and its timestamps, so the
   * table's status / timestamp checks hold. Stale `rowVersion` → ConcurrencyError.
   */
  abstract setStatus(tenantId: string, id: string, rowVersion: number | null, data: TicketStatusChange): Promise<void>;
  abstract addMessage(tenantId: string, ticketId: string, authorRole: 'REQUESTER' | 'AGENT', authorEmployeeId: string, body: string): Promise<void>;
}
