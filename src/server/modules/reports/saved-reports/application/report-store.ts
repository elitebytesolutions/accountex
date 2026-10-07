import type { ReportOptions, SavedReport } from '../../../../../shared/reports/saved-report.js';

/** A saved report as stored, before the viewer's canEdit is worked out. */
export type StoredReport = Omit<SavedReport, 'canEdit'> & { ownerUserId: string };

/** One output column of a preview query: a field of the source, aggregated when the query groups. */
export type PlannedColumn = { key: string; type: string; aggregate: 'NONE' | 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX'; grouped: boolean };
/** A filter with its value already typed for its field (text / number / date). */
export type PlannedFilter = { key: string; type: string; op: string; value: string | number; onAggregate: boolean };
/** A preview query made only of allow-listed field keys; the store maps each key to fixed SQL and binds every value. */
export type QueryPlan = {
  source: string;
  columns: PlannedColumn[];
  grouped: boolean;
  filters: PlannedFilter[];
  /** 0-based index into columns. */
  sort: { index: number; dir: 'ASC' | 'DESC' } | null;
  from: string | null;
  to: string | null;
  branchId: string | null;
  /** Rows to return (the caller asks for one more to detect truncation). */
  limit: number;
};

export abstract class ReportStore {
  abstract list(tenantId: string): Promise<StoredReport[]>;
  abstract get(tenantId: string, id: string): Promise<StoredReport | null>;
  abstract roleIdsOf(tenantId: string, userId: string): Promise<string[]>;
  abstract options(tenantId: string): Promise<Omit<ReportOptions, 'allowedSources'>>;
  abstract rolesExist(tenantId: string, ids: string[]): Promise<boolean>;
  abstract usersExist(tenantId: string, ids: string[]): Promise<boolean>;
  abstract activeBranch(tenantId: string, id: string): Promise<boolean>;
  /** savedReportAddUpdate (columns[] / shares[] synced when present). */
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract saveSchedule(data: Record<string, unknown>): Promise<string>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
  /** Pauses the report's active schedules (when the report is deleted). */
  abstract pauseSchedules(tenantId: string, reportId: string): Promise<void>;
  abstract scheduleInUse(id: string): Promise<boolean>;
  abstract deleteSchedule(tenantId: string, reportId: string, id: string, rowVersion: number): Promise<void>;
  /** Runs the plan read-only, in the tenant's context, and returns raw rows (one array per row, in column order). */
  abstract run(tenantId: string, plan: QueryPlan): Promise<(string | number | null)[][]>;
}
