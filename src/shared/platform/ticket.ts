import { z } from 'zod';
import { optId, optText, rowVersion } from './fields.ts';

/**
 * Phase 42: platform support tickets (Platform.SupportTickets + SupportTicketMessages). Companies raise them from
 * "Help & support" in the workspace; the Super Admin works them on a board, replies, writes internal notes (never
 * shown to the company), resolves, and the company rates the help (CSAT 1–5). The SLA (Urgent 2h · High 4h · Normal
 * 8h · Low 24h from opening) is set by the database. Numbers are TCK-0001…
 */
export const TICKET_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
export const TICKET_STATUSES = ['NEW', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
/** Board columns (template admin/support): CLOSED tickets sit with the resolved ones. */
export const TICKET_OPEN_STATUSES: readonly string[] = ['NEW', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'];
export const TICKET_CHANNELS = ['PORTAL', 'EMAIL', 'PHONE', 'CHAT', 'WHATSAPP'] as const;
export const TICKET_LOOKUPS = ['SupportTicketCategory', 'SupportTicketPriority', 'SupportTicketStatus', 'SupportTicketChannel'];

export type TicketMessage = {
  id: string; authorKind: string; authorName: string; body: string; isInternalNote: boolean; postedAt: string; mine?: boolean;
};
export type Ticket = {
  id: string; docNo: string; tenantId: string; tenantCode: string; tenantName: string; planName: string | null;
  subject: string; category: string; priority: string; status: string; channel: string;
  requesterUserId: string | null; requesterName: string; requesterRole: string | null; requesterEmail: string | null;
  assigneeStaffId: string | null; assigneeName: string | null;
  openedAt: string; firstResponseAt: string | null; slaDueAt: string | null; resolvedAt: string | null; closedAt: string | null;
  csatRating: number | null; csatComment: string | null; messageCount: number; lastMessageAt: string | null;
  updatedAt: string; rowVersion: number;
};
export type TicketDetail = Ticket & {
  messages: TicketMessage[];
  /** Support sessions started from this ticket (Phase 40 impersonation). */
  supportSessions: { id: string; staff: string | null; targetUserLabel: string; startedAt: string; endedAt: string | null; isReadOnly: boolean }[];
};
export type TicketKpis = {
  openTickets: number; unassignedOpen: number; breachingNow: number; slaBreaches30d: number;
  avgFirstResponseMin: number | null; medianFirstResponseMin: number | null; csatAvg30d: number | null; csatCount30d: number;
};
export type TicketBoard = { items: Ticket[]; kpis: TicketKpis; staff: { id: string; name: string }[] };

/** The company's side: its tickets (without internal notes), and whether the user sees all of them (company admins). */
export type MyTicketList = { items: Ticket[]; seesAll: boolean };

const subject = z.string().trim().min(4, 'Summarise the problem').max(200);
const body = z.string().trim().min(2, 'Write a message').max(5000);
const category = z.string().trim().min(1, 'Choose a category').max(40).default('GENERAL');
const priority = z.enum(TICKET_PRIORITIES).default('NORMAL');

/** Workspace "New ticket": the requester is the signed-in user. */
export const TicketRaiseSchema = z.object({ subject, category, priority, body });
export type TicketRaise = z.infer<typeof TicketRaiseSchema>;

/** Super Admin logs a ticket for a company (phone, email…). */
export const TicketCreateSchema = z.object({
  tenantId: z.uuid('Choose the company'),
  subject, category, priority, body,
  channel: z.enum(TICKET_CHANNELS).default('PHONE'),
  requesterName: z.string().trim().min(2, 'Who reported it?').max(120),
  requesterEmail: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.email('Use a valid email').max(160).nullable()),
  requesterRole: optText(80),
  assigneeStaffId: optId,
});
export type TicketCreate = z.infer<typeof TicketCreateSchema>;

export const TicketUpdateSchema = z.object({
  subject: subject.optional(),
  category: z.string().trim().min(1).max(40).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  rowVersion,
});
export type TicketUpdate = z.infer<typeof TicketUpdateSchema>;

export const TicketReplySchema = z.object({
  body,
  isInternalNote: z.boolean().default(false),
  /** Staff only: resolve with this reply. */
  resolve: z.boolean().default(false),
});
export type TicketReply = z.infer<typeof TicketReplySchema>;
export const MyTicketReplySchema = z.object({ body });
export type MyTicketReply = z.infer<typeof MyTicketReplySchema>;

export const TicketAssignSchema = z.object({ assigneeStaffId: optId, rowVersion });
export type TicketAssign = z.infer<typeof TicketAssignSchema>;
export const TicketActionSchema = z.object({ rowVersion, note: optText(2000) });
export type TicketActionInput = z.infer<typeof TicketActionSchema>;
export type TicketAction = 'resolve' | 'reopen' | 'close';

export const TicketCsatSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Pick 1 to 5 stars').max(5, 'Pick 1 to 5 stars'),
  comment: optText(1000),
});
export type TicketCsat = z.infer<typeof TicketCsatSchema>;

export const TicketListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  assigneeStaffId: z.uuid().optional(),
  category: z.string().trim().max(40).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  tenantId: z.uuid().optional(),
});
export type TicketListQuery = z.infer<typeof TicketListQuerySchema>;

/** "Impersonate from ticket": the Phase 40 support session, linked to the ticket (ImpersonationSessions.supportTicketId). */
export const TicketImpersonateSchema = z.object({
  targetUserId: z.uuid().optional(),
  reason: z.string().trim().min(5, 'Say why you need access').max(450),
  timeLimitMinutes: z.union([z.literal(30), z.literal(60)]).default(30),
  isReadOnly: z.boolean().default(true),
});
export type TicketImpersonate = z.infer<typeof TicketImpersonateSchema>;

/** Minutes left on the SLA (negative = breached), or null once answered / without an SLA. */
export function slaMinutesLeft(t: Pick<Ticket, 'slaDueAt' | 'firstResponseAt' | 'status'>, now = Date.now()): number | null {
  if (!t.slaDueAt || t.firstResponseAt || !TICKET_OPEN_STATUSES.includes(t.status)) return null;
  return Math.round((Date.parse(t.slaDueAt) - now) / 60_000);
}
