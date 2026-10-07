import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
/** ISO date-time (from a datetime-local input or an ISO string); blank → null. */
const optionalInstant = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Use a date and time' });
      return z.NEVER;
    }
    return d.toISOString();
  });

const ref = z.object({ id: z.string(), name: z.string() });

/** A company announcement (EmployeeSelfService.CompanyAnnouncements). Published ones are archived, never deleted. */
export const AnnouncementSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  body: z.string().nullable(),
  kind: z.string(),
  /** The author employee; selectable once employees (Phase 11) are accepted. Until then authorLabel names the author. */
  authorEmployeeId: z.string().nullable(),
  authorLabel: z.string().nullable(),
  eventAt: z.string().nullable(),
  venue: z.string().nullable(),
  requiresRsvp: z.boolean(),
  branch: ref.nullable(),
  department: ref.nullable(),
  policy: z.object({ id: z.string(), title: z.string() }).nullable(),
  isPinned: z.boolean(),
  status: z.string(),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  /** Published and past expiresAt: no longer in the employee feed. */
  isExpired: z.boolean(),
  createdAt: z.string(),
  rowVersion: z.number().int(),
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

const AnnouncementFields = {
  title: z.string().trim().min(3, 'Write a title').max(160),
  summary: optionalText(240),
  body: optionalText(5000),
  kind: z.string().trim().min(1).max(30).default('GENERAL'),
  /** The author employee (Phase 11). */
  authorEmployeeId: optionalId,
  authorLabel: optionalText(80),
  eventAt: optionalInstant,
  venue: optionalText(120),
  requiresRsvp: z.boolean().default(false),
  branchId: optionalId,
  departmentId: optionalId,
  policyDocumentId: optionalId,
  isPinned: z.boolean().default(false),
  expiresAt: optionalInstant,
};
export const AnnouncementCreateSchema = z.object(AnnouncementFields);
export type AnnouncementCreate = z.infer<typeof AnnouncementCreateSchema>;
export const AnnouncementUpdateSchema = patchFields(AnnouncementFields).extend(RowVersionSchema.shape);
export type AnnouncementUpdate = z.infer<typeof AnnouncementUpdateSchema>;

/** POST /:id/publish: optionally (re)set the expiry, which must be in the future. */
export const AnnouncementPublishSchema = RowVersionSchema.extend({ expiresAt: optionalInstant });
export type AnnouncementPublish = z.infer<typeof AnnouncementPublishSchema>;
export const AnnouncementPinSchema = RowVersionSchema.extend({ isPinned: z.boolean() });
export type AnnouncementPin = z.infer<typeof AnnouncementPinSchema>;

export const AnnouncementListQuerySchema = z.object({ status: z.string().trim().max(20).optional() });
export type AnnouncementListQuery = z.infer<typeof AnnouncementListQuerySchema>;

/** Branches, departments and published policies an announcement can target or link. */
export const AnnouncementOptionsSchema = z.object({
  branches: z.array(ref),
  departments: z.array(ref),
  policies: z.array(z.object({ id: z.string(), title: z.string() })),
});
export type AnnouncementOptions = z.infer<typeof AnnouncementOptionsSchema>;

/** One item of GET /api/me/announcements: published, not expired, for everyone or the employee's branch / department. */
export const MyAnnouncementSchema = AnnouncementSchema.pick({
  id: true, title: true, summary: true, body: true, kind: true, authorLabel: true, eventAt: true, venue: true, requiresRsvp: true, isPinned: true, publishedAt: true, expiresAt: true,
}).extend({ branch: z.string().nullable(), department: z.string().nullable() });
export type MyAnnouncement = z.infer<typeof MyAnnouncementSchema>;

/** Rules the DB checks too: a published announcement has publishedAt, and any expiry is after it. */
export function announcementPublishErrors(a: { publishedAt: string; expiresAt: string | null }): Record<string, string> {
  return a.expiresAt && a.expiresAt <= a.publishedAt ? { expiresAt: 'Expires before it is published' } : {};
}
