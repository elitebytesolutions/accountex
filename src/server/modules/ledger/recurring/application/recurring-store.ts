import type { RecurringRun, RecurringTemplate } from '../../../../../shared/index.js';

export abstract class RecurringStore {
  abstract list(tenantId: string): Promise<RecurringTemplate[]>;
  abstract get(tenantId: string, id: string): Promise<RecurringTemplate | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract delete(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract hasRuns(tenantId: string, id: string): Promise<boolean>;
  abstract runs(tenantId: string, id: string): Promise<RecurringRun[]>;
  /** The first run date on or after `from` (the DB's getRecurringVoucherNextDate counts from the day before). */
  abstract firstRun(from: string, t: { frequency: string; runDay: number | null; runOnLastDay: boolean; runWeekday: number | null; runMonth: number | null }): Promise<string | null>;
  /** Runs a template for a date (the DB records the run, posts when auto-post, advances the schedule). Returns the voucher id or null. */
  abstract run(id: string, date: string, trigger: 'MANUAL' | 'SCHEDULE'): Promise<string | null>;
  /** Active tenants (the job runs each one in its own context). */
  abstract tenants(): Promise<string[]>;
  /** Active templates whose next run date has come. */
  abstract due(tenantId: string, today: string): Promise<{ id: string; nextRunDate: string }[]>;
}
