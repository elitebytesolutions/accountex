import { z } from 'zod';
import { issues, optId, optText, rowVersion } from './fields.ts';

/**
 * Phase 42: platform announcements & release notes (Platform.Announcements + AnnouncementTargets). Drafts are edited
 * and deleted freely; publishing (now or at a scheduled time) makes them show in the matching company workspaces as a
 * dismissible banner; published ones are archived, never deleted. Audience: ALL, PLANS (the company's live plan),
 * MODULES (an enabled module) or TENANTS (named companies). Views, clicks and dismissals are counted per user.
 */
export const ANNOUNCEMENT_TYPES = ['RELEASE_NOTE', 'MAINTENANCE', 'COMPLIANCE', 'BILLING'] as const;
export const ANNOUNCEMENT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export const ANNOUNCEMENT_AUDIENCES = ['ALL', 'PLANS', 'MODULES', 'TENANTS'] as const;
/** Statuses whose content can still be changed. */
export const ANNOUNCEMENT_EDITABLE: readonly string[] = ['DRAFT', 'SCHEDULED'];
export const ANNOUNCEMENT_LOOKUPS = ['AnnouncementType', 'AnnouncementSeverity', 'AnnouncementAudience', 'AnnouncementStatus'];

export type PlatformAnnouncementTarget = { planId: string | null; moduleKey: string | null; tenantId: string | null; label: string };
export type PlatformAnnouncement = {
  id: string; announcementType: string; severity: string; releaseLabel: string | null; title: string; message: string;
  audience: string; targets: PlatformAnnouncementTarget[]; publishAt: string | null; status: string; showBanner: boolean; emailAdmins: boolean;
  viewCount: number; clickCount: number; dismissCount: number; maintenanceWindowId: string | null; maintenanceWindowTitle: string | null;
  createdBy: string | null; updatedBy: string | null; createdAt: string; updatedAt: string; rowVersion: number;
};
export type PlatformAnnouncementList = {
  items: PlatformAnnouncement[];
  counts: { all: number; PUBLISHED: number; SCHEDULED: number; DRAFT: number; ARCHIVED: number };
};

type Shape = { audience?: string; targets?: { planId?: string | null; moduleKey?: string | null; tenantId?: string | null }[] };
/** Targeted audiences need at least one target of their kind; ALL has none. */
export function announcementErrors(a: Shape): Record<string, string> {
  if (!a.audience || a.targets === undefined) return {};
  const key = ({ PLANS: 'planId', MODULES: 'moduleKey', TENANTS: 'tenantId' } as const)[a.audience as 'PLANS'];
  if (!key) return a.targets.length ? { targets: 'Everyone gets this announcement: remove the targets' } : {};
  if (!a.targets.length) return { targets: 'Pick at least one' };
  return a.targets.every((t) => t[key] && Object.entries(t).filter(([k, v]) => k !== key && v).length === 0) ? {} : { targets: 'Each target is one of the chosen kind' };
}

const TargetSchema = z.object({ planId: optId.optional(), moduleKey: optText(40).optional(), tenantId: optId.optional() });
const Fields = {
  announcementType: z.enum(ANNOUNCEMENT_TYPES).default('RELEASE_NOTE'),
  severity: z.enum(ANNOUNCEMENT_SEVERITIES).default('INFO'),
  releaseLabel: optText(40),
  title: z.string().trim().min(4, 'Give it a title').max(160),
  message: z.string().trim().min(4, 'Write the message').max(4000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default('ALL'),
  targets: z.array(TargetSchema).max(500).default([]),
  showBanner: z.boolean().default(true),
  emailAdmins: z.boolean().default(false),
  maintenanceWindowId: optId,
};
const bannerOrEmail = (a: { showBanner?: boolean; emailAdmins?: boolean }): Record<string, string> =>
  a.showBanner === false && a.emailAdmins === false ? { showBanner: 'Show a banner, email the admins, or both' } : {};
export const PlatformAnnouncementCreateSchema = z.object(Fields).superRefine(issues(announcementErrors)).superRefine(issues(bannerOrEmail));
export type PlatformAnnouncementCreate = z.infer<typeof PlatformAnnouncementCreateSchema>;
export const PlatformAnnouncementUpdateSchema = z.object({
  announcementType: z.enum(ANNOUNCEMENT_TYPES).optional(),
  severity: z.enum(ANNOUNCEMENT_SEVERITIES).optional(),
  releaseLabel: optText(40).optional(),
  title: Fields.title.optional(),
  message: Fields.message.optional(),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),
  targets: z.array(TargetSchema).max(500).optional(),
  showBanner: z.boolean().optional(),
  emailAdmins: z.boolean().optional(),
  maintenanceWindowId: optId.optional(),
  rowVersion,
}).superRefine(issues(announcementErrors)).superRefine(issues(bannerOrEmail));
export type PlatformAnnouncementUpdate = z.infer<typeof PlatformAnnouncementUpdateSchema>;
export const PlatformAnnouncementTargetsSchema = z.object({ audience: z.enum(ANNOUNCEMENT_AUDIENCES), targets: z.array(TargetSchema).max(500), rowVersion })
  .superRefine(issues(announcementErrors));
export type PlatformAnnouncementTargetsInput = z.infer<typeof PlatformAnnouncementTargetsSchema>;
export const PlatformAnnouncementScheduleSchema = z.object({
  publishAt: z.iso.datetime({ offset: true, message: 'Pick a date and time' }).refine((v) => Date.parse(v) > Date.now(), 'Pick a time in the future'),
  rowVersion,
});
export type PlatformAnnouncementSchedule = z.infer<typeof PlatformAnnouncementScheduleSchema>;
export const PlatformAnnouncementActionSchema = z.object({ rowVersion });
export type PlatformAnnouncementAction = 'publish' | 'archive';
export const PlatformAnnouncementListQuerySchema = z.object({ status: z.string().trim().max(20).optional(), type: z.string().trim().max(40).optional() });

// ------------------------------------------------------------------------------------------------ company side
/** One live announcement for the signed-in user (GET /api/me/platform-announcements). */
export type PlatformNotice = {
  id: string; announcementType: string; severity: string; releaseLabel: string | null; title: string; message: string; publishAt: string;
  showBanner: boolean; dismissed: boolean;
  maintenance: { title: string; startsAt: string; endsAt: string } | null;
};
/** In-app messages delivered by broadcasts (Company.Notifications, event PLATFORM_BROADCAST). */
export type PlatformMessage = { id: string; title: string; body: string | null; severity: string; createdAt: string; readAt: string | null };
export type PlatformNoticeFeed = { banners: PlatformNotice[]; recent: PlatformNotice[]; messages: PlatformMessage[]; unread: number };
