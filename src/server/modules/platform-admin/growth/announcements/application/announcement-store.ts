import type { PlatformAnnouncement, PlatformAnnouncementList, PlatformMessage, PlatformNotice } from '../../../../../../shared/index.js';

export type AnnouncementRecipient = { tenantId: string; tenantName: string; email: string | null; language: string };

/**
 * Port: Platform.Announcements, AnnouncementTargets and AnnouncementReceipts, plus the company's in-app platform messages
 * (Company.Notifications, event PLATFORM_BROADCAST). Used by the Super Admin screen and the workspace banner.
 */
export abstract class AnnouncementStore {
  abstract list(q: { status?: string; type?: string }): Promise<PlatformAnnouncementList>;
  abstract get(id: string): Promise<PlatformAnnouncement | null>;
  /** Platform.announcementAddUpdate (targets replaced when given). */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Hard delete of a draft and its targets. */
  abstract remove(id: string): Promise<void>;
  /** SCHEDULED announcements whose time has come → PUBLISHED. Returns their ids. */
  abstract promoteDue(): Promise<string[]>;
  /** Companies an announcement reaches now (live, non-churned), with the owner email for "Email tenant admins". */
  abstract recipients(id: string): Promise<AnnouncementRecipient[]>;
  abstract maintenanceWindowExists(id: string): Promise<boolean>;

  // ---- company side
  /** Published announcements that match the company, newest first, with the user's dismissal. */
  abstract feed(tenantId: string, userId: string): Promise<PlatformNotice[]>;
  /** First view / click / dismissal by a user; counters on the announcement grow once per user. */
  abstract mark(announcementId: string, tenantId: string, userId: string, what: 'view' | 'click' | 'dismiss'): Promise<void>;
  abstract messages(tenantId: string, userId: string): Promise<PlatformMessage[]>;
  abstract readMessages(tenantId: string, userId: string): Promise<number>;
}
