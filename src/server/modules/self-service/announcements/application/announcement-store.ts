import type { Announcement, AnnouncementOptions, MyAnnouncement } from '../../../../../shared/self-service/announcement.js';

/** The employee's placement, which decides the branch / department items they see. Null until they have an employee record. */
export type EmployeePlacement = { branchId: string; departmentId: string } | null;

export abstract class AnnouncementStore {
  abstract list(tenantId: string, status?: string): Promise<Announcement[]>;
  abstract get(tenantId: string, id: string): Promise<Announcement | null>;
  abstract options(tenantId: string): Promise<AnnouncementOptions>;
  abstract activeBranch(tenantId: string, id: string): Promise<boolean>;
  abstract activeDepartment(tenantId: string, id: string): Promise<boolean>;
  /** A live (not deleted, not exited) employee. */
  abstract activeEmployee(tenantId: string, id: string): Promise<boolean>;
  abstract policyExists(tenantId: string, id: string): Promise<boolean>;
  /** companyAnnouncementAddUpdate (drafts only; the function edits nothing else). Never sends `reads`. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Status / pin changes the save function does not allow on published rows. Stale rowVersion ⇒ ConcurrencyError. */
  abstract setState(tenantId: string, id: string, rowVersion: number, data: { status?: string; publishedAt?: Date; expiresAt?: Date | null; isPinned?: boolean }): Promise<void>;
  abstract placement(tenantId: string, userId: string): Promise<EmployeePlacement>;
  abstract feed(tenantId: string, placement: EmployeePlacement, now: Date): Promise<MyAnnouncement[]>;
}
