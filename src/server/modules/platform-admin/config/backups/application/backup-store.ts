import type { BackupRun } from '../../../../../../shared/index.js';

/** Port: Platform.BackupRuns (no save function exists: plain inserts / updates, audited by backupRunsAudit). */
export abstract class BackupStore {
  abstract list(limit: number): Promise<BackupRun[]>;
  abstract get(id: string): Promise<BackupRun | null>;
  /** RUNNING rows of one type (FULL backups and TENANT_EXPORT exports don't block each other). */
  abstract running(backupType?: 'FULL' | 'TENANT_EXPORT'): Promise<{ id: string; startedAt: Date }[]>;
  abstract start(data: { code: string; location: string; requestedByStaffId: string | null; retentionUntil: Date }): Promise<string>;
  /** Phase 43: a RUNNING TENANT_EXPORT row (one company, JSON). */
  abstract startExport(data: { code: string; location: string; tenantId: string; requestedByStaffId: string | null; retentionUntil: Date }): Promise<string>;
  abstract finish(id: string, result: { status: 'COMPLETED' | 'FAILED'; sizeBytes: number | null; failureMessage: string | null }): Promise<void>;
}

/** Port: writes a full logical backup of the database to a file, or (Phase 43) one company's data as JSON. */
export abstract class BackupRunner {
  /** Where a backup with this code is written. */
  abstract locationFor(code: string): string;
  /** Runs the dump; resolves with the file size, rejects with a readable message. */
  abstract run(location: string): Promise<{ sizeBytes: number }>;
  /** Phase 43: where a tenant export with this code is written. */
  abstract exportLocationFor(code: string): string;
  /** Phase 43: every row of the company (each table with a tenantId), secrets left out, as one JSON file. */
  abstract exportTenant(tenantId: string, location: string): Promise<{ sizeBytes: number }>;
}
