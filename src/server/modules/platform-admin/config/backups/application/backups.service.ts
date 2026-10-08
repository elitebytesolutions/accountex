import { Injectable, Logger } from '@nestjs/common';
import type { AdminSession, BackupRun } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConflictError } from '../../../../../core/domain/errors.js';
import { backupCode, exportCode, isStale, retentionUntil } from '../domain/backup-rules.js';
import { BackupRunner, BackupStore } from './backup-store.js';

/** Phase 43: callbacks of a tenant export (privacy requests). */
export type TenantExportHooks = {
  /** Runs in the transaction that records the RUNNING export row (e.g. links it to the privacy request). */
  inTransaction?: (runId: string) => Promise<void>;
  /** Runs after the row became COMPLETED or FAILED. */
  onFinish?: (runId: string, status: 'COMPLETED' | 'FAILED') => Promise<void>;
};

/**
 * On-demand full backups (System Health › Backups). POST /run records a RUNNING row and returns at once; pg_dump runs in
 * the background and the row becomes COMPLETED (size, duration) or FAILED (message). One backup at a time.
 * Phase 43: the TENANT_EXPORT mode writes one company's data as JSON the same way (privacy EXPORT requests).
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger('Backups');

  constructor(
    private readonly store: BackupStore,
    private readonly runner: BackupRunner,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list(50);
  }

  async run(admin: AdminSession, meta: RequestMeta): Promise<BackupRun> {
    const ctx = adminActorContext(admin, meta);
    const now = new Date();
    // A RUNNING row left by a server restart would block every later backup: it is closed as failed first.
    for (const r of await this.store.running('FULL')) {
      if (isStale(r.startedAt, now)) {
        await this.unitOfWork.run(ctx, () => this.store.finish(r.id, { status: 'FAILED', sizeBytes: null, failureMessage: 'Interrupted (no result after 6 hours)' }));
      } else {
        throw new ConflictError('A backup is already running. Wait for it to finish.', undefined, { code: 'BACKUP_ALREADY_RUNNING' });
      }
    }
    const code = backupCode(now);
    const location = this.runner.locationFor(code);
    const id = await this.unitOfWork.run(ctx, () =>
      this.store.start({ code, location, requestedByStaffId: admin.staffId, retentionUntil: retentionUntil(now) }));

    void this.runner.run(location)
      .then(({ sizeBytes }) => this.unitOfWork.run(ctx, () => this.store.finish(id, { status: 'COMPLETED', sizeBytes, failureMessage: null })))
      .catch((e: unknown) => this.unitOfWork.run(ctx, () =>
        this.store.finish(id, { status: 'FAILED', sizeBytes: null, failureMessage: (e instanceof Error ? e.message : String(e)).slice(0, 1000) })))
      .catch((e: unknown) => this.logger.error(`Could not record the result of backup ${code}: ${String(e)}`));

    return (await this.store.get(id))!;
  }

  /**
   * Phase 43: TENANT_EXPORT. Records a RUNNING export row (and runs `hooks.inTransaction` in the same transaction),
   * then writes the company's JSON in the background; the row becomes COMPLETED / FAILED and `hooks.onFinish` runs.
   */
  async exportTenant(admin: AdminSession, meta: RequestMeta, tenant: { id: string; code: string }, hooks: TenantExportHooks = {}): Promise<BackupRun> {
    const ctx = adminActorContext(admin, meta);
    const now = new Date();
    const code = exportCode(tenant.code, now);
    const location = this.runner.exportLocationFor(code);
    const id = await this.unitOfWork.run(ctx, async () => {
      const runId = await this.store.startExport({ code, location, tenantId: tenant.id, requestedByStaffId: admin.staffId, retentionUntil: retentionUntil(now) });
      await hooks.inTransaction?.(runId);
      return runId;
    });

    const finish = async (status: 'COMPLETED' | 'FAILED', sizeBytes: number | null, failureMessage: string | null) => {
      await this.unitOfWork.run(ctx, () => this.store.finish(id, { status, sizeBytes, failureMessage }));
      await hooks.onFinish?.(id, status);
    };
    void this.runner.exportTenant(tenant.id, location)
      .then(
        ({ sizeBytes }) => finish('COMPLETED', sizeBytes, null),
        (e: unknown) => finish('FAILED', null, (e instanceof Error ? e.message : String(e)).slice(0, 1000)),
      )
      .catch((e: unknown) => this.logger.error(`Could not record the result of export ${code}: ${String(e)}`));

    return (await this.store.get(id))!;
  }

  /** The file of a COMPLETED run (export download). */
  async fileOf(id: string): Promise<{ location: string; code: string; status: string } | null> {
    const r = await this.store.get(id);
    return r ? { location: r.location, code: r.code, status: r.status } : null;
  }
}
