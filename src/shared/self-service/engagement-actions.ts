import { z } from 'zod';
import type { EmpRef } from '../hr/attendance.ts';

/**
 * Phase 34 engagement actions from My Profile: kudos (+ reactions), poll votes, pulse survey answers,
 * announcement reads / RSVP and presence. Lookup codes: Badge, Reaction, Rsvp, PresenceStatus.
 */
export const KUDOS_BADGES = ['CUSTOMER_HERO', 'TEAM_PLAYER', 'GO_GETTER', 'PROBLEM_SOLVER', 'MENTOR'] as const;
export const KUDOS_REACTIONS = ['CLAP', 'HEART', 'FIRE', 'PARTY'] as const;
export const RSVP_ANSWERS = ['YES', 'NO', 'MAYBE'] as const;
export const PRESENCE_STATUSES = ['AVAILABLE', 'BUSY', 'IN_FIELD', 'AWAY'] as const;
export type KudosBadge = (typeof KUDOS_BADGES)[number];
export type KudosReaction = (typeof KUDOS_REACTIONS)[number];
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

// ---------------------------------------------------------------- kudos
export const KudosCreateSchema = z.object({
  toEmployeeId: z.uuid('Pick a colleague'),
  badge: z.enum(KUDOS_BADGES, 'Choose a badge'),
  message: z.string().trim().min(8, 'Add a short message (why it mattered)').max(280, 'Up to 280 characters'),
  shareOnWall: z.boolean().default(true),
});
export type KudosCreate = z.infer<typeof KudosCreateSchema>;
export const KudosReactSchema = z.object({ reaction: z.enum(KUDOS_REACTIONS, 'Choose a reaction') });

export type KudosItem = {
  id: string; from: EmpRef; to: EmpRef; badge: string; message: string; shareOnWall: boolean; givenAt: string;
  reactions: Record<KudosReaction, number>; mine: KudosReaction[];
  pointsToRecipient: number;
};
/** GET /api/me/kudos */
export type MyKudos = {
  me: EmpRef;
  wall: KudosItem[];
  received: KudosItem[];
  given: number;
  points: number;
  /** Kudos received per badge this year. */
  earned: Record<string, number>;
  badges: { code: string; label: string }[];
};
export type Colleague = { id: string; code: string; name: string; designation: string | null; department: string | null; branch: string | null };

// ---------------------------------------------------------------- polls & pulse
export const PollVoteSchema = z.object({ optionId: z.uuid('Choose an option') });
export const PulseRespondSchema = z.object({
  answers: z.array(z.object({ questionId: z.uuid(), score: z.number().int().min(1, '1 to 5').max(5, '1 to 5') })).min(1, 'Answer the questions'),
});
export type PulseRespond = z.infer<typeof PulseRespondSchema>;

export type PollResult = { pollId: string; total: number; options: { optionId: string; votes: number }[] };
/** GET /api/me/engagement-state: what the viewer has already done on the open polls and surveys. */
export type MyEngagementState = {
  votes: { pollId: string; optionId: string; results: PollResult | null }[];
  answeredSurveyIds: string[];
};

// ---------------------------------------------------------------- announcements
export const AnnouncementReadSchema = z.object({ rsvp: z.enum(RSVP_ANSWERS).optional().nullable() });
export type AnnouncementRead = { announcementId: string; readAt: string; rsvp: string | null };

// ---------------------------------------------------------------- presence & directory
export const PresenceSchema = z.object({
  status: z.enum(PRESENCE_STATUSES, 'Choose a status'),
  message: optionalText(80),
  locationLabel: optionalText(80),
  untilAt: z.string().trim().optional().nullable().transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) { ctx.addIssue({ code: 'custom', message: 'Use a date and time' }); return z.NEVER; }
    return d.toISOString();
  }),
});
export type PresenceInput = z.infer<typeof PresenceSchema>;
export type Presence = { status: PresenceStatus; message: string | null; locationLabel: string | null; untilAt: string | null; source: string; updatedAt: string };

export const DirectoryQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  departmentId: z.uuid().optional(),
});
export type DirectoryPerson = Colleague & {
  mobile: string | null; workEmail: string | null; managerId: string | null; presence: Presence | null; me: boolean;
};
/** GET /api/me/directory */
export type Directory = { people: DirectoryPerson[]; departments: { id: string; name: string; count: number }[]; total: number; mine: Presence | null };
export const ColleagueQuerySchema = z.object({ search: z.string().trim().max(100).optional() });
