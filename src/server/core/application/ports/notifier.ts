/** One in-app notification (Company.Notifications through Company.notify). */
export type NotificationInput = {
  userId: string;
  /** e.g. APPROVAL_PENDING; preferences are kept per event code. */
  eventCode: string;
  /** APPROVALS / FINANCE / HR / SYSTEM */
  category: string;
  title: string;
  body?: string | null;
  /** App path the notification opens (e.g. /approvals). */
  linkRoute?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  amount?: number | null;
  severity?: 'INFO' | 'GOOD' | 'WARN' | 'DANGER';
  needsAction?: boolean;
  actorUserId?: string | null;
};

/**
 * Port: in-app notifications. Writes in the caller's unit of work, so a notification exists only if the change that
 * raised it commits. The database skips the actor themselves, inactive users and events a user switched off.
 */
export abstract class Notifier {
  abstract notify(tenantId: string, n: NotificationInput): Promise<void>;
  /** Everyone holding a permission (through any role). */
  abstract notifyPermission(tenantId: string, permission: string, n: Omit<NotificationInput, 'userId'>): Promise<void>;
}
