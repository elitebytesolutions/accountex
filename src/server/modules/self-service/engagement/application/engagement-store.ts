import type { MyEngagement, Poll, PulseSurvey } from '../../../../../shared/self-service/engagement.js';
import type { EmployeePlacement } from '../../announcements/application/announcement-store.js';

export abstract class EngagementStore {
  abstract polls(tenantId: string): Promise<Poll[]>;
  abstract surveys(tenantId: string): Promise<PulseSurvey[]>;
  abstract departments(tenantId: string): Promise<{ id: string; name: string }[]>;
  abstract activeDepartment(tenantId: string, id: string): Promise<boolean>;
  /** pollAddUpdate with options[] (synced: missing rows deleted, rows with id updated, others inserted). */
  abstract savePoll(data: Record<string, unknown>): Promise<string>;
  /** pulseSurveyAddUpdate with questions[]. */
  abstract saveSurvey(data: Record<string, unknown>): Promise<string>;
  /** Hard delete of a draft (options / questions cascade). Stale rowVersion ⇒ ConcurrencyError. */
  abstract deletePoll(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract deleteSurvey(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract placement(tenantId: string, userId: string): Promise<EmployeePlacement>;
  abstract openFor(tenantId: string, placement: EmployeePlacement, now: Date): Promise<MyEngagement>;
}
