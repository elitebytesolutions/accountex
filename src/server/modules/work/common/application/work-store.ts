import type {
  DueItem, NotificationItem, NotificationPreferences, NotificationQuery, NotificationSummary, Task, TaskQuery, TodayKpis, WorkUser, WorkspaceDashboard,
} from '../../../../../shared/index.js';

export type TaskRow = Omit<Task, 'canEdit' | 'overdue'> & { assigneeUserId: string; assignedByUserId: string | null };

/** Persistence for Phase 44: tasks, today's due items, notifications, preferences and the dashboard figures. */
export abstract class WorkStore {
  /** Active users of the company (assignee picker). */
  abstract users(tenantId: string): Promise<WorkUser[]>;
  abstract companyToday(tenantId: string): Promise<string>;

  // ---------------------------------------------------------------- tasks (reads run in the user's context: the views use getCurrentUserId)
  abstract listTasks(tenantId: string, userId: string, q: TaskQuery): Promise<TaskRow[]>;
  abstract getTask(tenantId: string, id: string): Promise<TaskRow | null>;
  abstract saveTask(data: Record<string, unknown>): Promise<string>;
  abstract completeTask(id: string): Promise<string | null>;
  abstract setTaskStatus(tenantId: string, id: string, rowVersion: number, status: 'IN_PROGRESS' | 'CANCELLED' | 'PENDING'): Promise<boolean>;
  abstract deleteTask(tenantId: string, id: string, rowVersion: number): Promise<boolean>;
  abstract todayKpis(): Promise<TodayKpis>;
  abstract dueItems(): Promise<DueItem[]>;
  /** Open tasks and money items due per day between from and to (both included). */
  abstract weekCounts(tenantId: string, userId: string, from: string, to: string): Promise<{ date: string; tasks: number; overdue: number; due: number }[]>;
  /** For validating an assignee. */
  abstract isActiveUser(tenantId: string, userId: string): Promise<boolean>;

  // ---------------------------------------------------------------- notifications
  abstract listNotifications(tenantId: string, userId: string, q: NotificationQuery): Promise<{ items: NotificationItem[]; total: number }>;
  abstract notificationSummary(): Promise<NotificationSummary>;
  abstract latestUnread(tenantId: string, userId: string, limit: number): Promise<NotificationItem[]>;
  abstract markRead(tenantId: string, userId: string, ids: string[] | null, category: string | null): Promise<number>;
  abstract archive(tenantId: string, userId: string, id: string): Promise<boolean>;
  abstract preferences(tenantId: string, userId: string): Promise<NotificationPreferences>;
  abstract savePreferences(tenantId: string, userId: string, p: NotificationPreferences): Promise<void>;

  // ---------------------------------------------------------------- jobs
  abstract activeTenants(): Promise<{ id: string; timeZone: string }[]>;
  abstract runTaskReminders(tenantId: string): Promise<number>;
  abstract runDueItems(tenantId: string, date: string): Promise<number>;

  // ---------------------------------------------------------------- dashboard
  abstract dashboard(tenantId: string, today: string): Promise<Omit<WorkspaceDashboard, 'approvals'>>;
}
