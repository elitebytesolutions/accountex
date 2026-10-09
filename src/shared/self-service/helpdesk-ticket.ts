import { z } from 'zod';
import type { EmpRef } from '../hr/attendance.ts';
import { RowVersionSchema } from '../common/list-query.ts';

/** Helpdesk tickets (Phase 34): EmployeeSelfService.HelpdeskTickets + HelpdeskTicketMessages. */
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export const TICKET_CHANNELS = ['WHATSAPP', 'EMAIL'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TicketQuerySchema = z.object({
  /** mine = raised by me; assigned = assigned to me or in a desk I own; all = every ticket (HR, emp:edit). */
  scope: z.enum(['mine', 'assigned', 'all']).default('mine'),
  status: z.enum([...TICKET_STATUSES, 'ALL']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type TicketQuery = z.infer<typeof TicketQuerySchema>;

export type TicketDesk = { id: string; code: string; name: string; icon: string | null };
export type TicketItem = {
  id: string; docNo: string; subject: string; priority: string; status: TicketStatus;
  category: TicketDesk; employee: EmpRef; agent: EmpRef | null;
  contactChannel: string; contactValue: string | null;
  openedAt: string; slaHours: number; dueAt: string; firstResponseAt: string | null; resolvedAt: string | null; closedAt: string | null;
  slaMet: boolean | null; reopenedCount: number; csatRating: number | null; messageCount: number; rowVersion: number;
};
export type TicketMessage = { id: string; authorRole: 'REQUESTER' | 'AGENT' | 'SYSTEM'; author: EmpRef | null; body: string; sentAt: string };
export type TicketDetail = TicketItem & {
  description: string; messages: TicketMessage[];
  /** What the signed-in user may do on this ticket. */
  can: { reply: boolean; agent: boolean; reopen: boolean; rate: boolean };
};
/** Routing facts of the active desks (the employee view in Phase 15 carries only name / SLA). `open` = my live tickets there. */
export type TicketDeskRouting = { id: string; highPrioritySlaFactor: number; routingKeywords: string[]; open: number };
export type TicketList = {
  items: TicketItem[]; total: number; counts: Record<string, number>; isAgent: boolean; isHr: boolean;
  /** The signed-in user's employee id (null when the user has no employee record). */
  meId: string | null;
  desks: TicketDeskRouting[];
};

export const TicketCreateSchema = z.object({
  categoryId: z.uuid('Choose the desk'),
  subject: z.string().trim().min(4, 'Write a short subject').max(140),
  description: z.string().trim().min(10, 'Describe the issue (at least 10 characters)').max(4000),
  priority: z.enum(TICKET_PRIORITIES).default('NORMAL'),
  contactChannel: z.enum(TICKET_CHANNELS).default('WHATSAPP'),
  contactValue: z.string().trim().max(120).optional().nullable().transform((v) => (v ? v : null)),
});
export type TicketCreate = z.infer<typeof TicketCreateSchema>;

export const TicketMessageSchema = z.object({ body: z.string().trim().min(1, 'Write a message').max(4000) });
export const TicketAssignSchema = RowVersionSchema.extend({ agentEmployeeId: z.uuid('Choose the agent') });
export const TicketResolveSchema = RowVersionSchema.extend({ note: z.string().trim().max(4000).optional().nullable().transform((v) => (v ? v : null)) });
export const TicketReopenSchema = RowVersionSchema.extend({ reason: z.string().trim().min(3, 'Say why it is not solved').max(1000) });
export const TicketRateSchema = RowVersionSchema.extend({
  csatRating: z.coerce.number().int().min(1, 'Choose 1 to 5 stars').max(5),
  comment: z.string().trim().max(1000).optional().nullable().transform((v) => (v ? v : null)),
});
export type TicketAssign = z.infer<typeof TicketAssignSchema>;
export type TicketResolve = z.infer<typeof TicketResolveSchema>;
export type TicketReopen = z.infer<typeof TicketReopenSchema>;
export type TicketRate = z.infer<typeof TicketRateSchema>;

/** Agents an HR user can assign a ticket to (active employees). */
export type TicketAgentOption = { id: string; code: string; name: string };
