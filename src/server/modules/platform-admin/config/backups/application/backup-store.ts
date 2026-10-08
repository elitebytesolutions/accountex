import type { BackupRun } from '../../../../../../shared/index.js';

/** Port: Platform.BackupRuns (no save function exists: plain inserts / updates, audited by backupRunsAudit). */
export abstract class BackupStore {
  abstract list(limit: number): Promise<BackupRun[]>;
  abstract get(id: string): Promise<BackupRun | null>;
  abstract running(): Promise<{ id: string; startedAt: Date }[]>;
  abstract start(data: { code: string; location: string; requestedByStaffId: string | null; retentionUntil: Date }): Promise<string>;
  abstract finish(id: string, result: { status: 'COMPLETED' | 'FAILED'; sizeBytes: number | null; failureMessage: string | null }): Promise<void>;
}

/** Port: writes a full logical backup of the database to a file. */
export abstract class BackupRunner {
  /** Where a backup with this code is written. */
  abstract locationFor(code: string): string;
  /** Runs the dump; resolves with the file size, rejects with a readable message. */
  abstract run(location: string): Promise<{ sizeBytes: number }>;
}
