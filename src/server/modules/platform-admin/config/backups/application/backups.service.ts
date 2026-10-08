import { Injectable, Logger } from '@nestjs/common';
import type { AdminSession, BackupRun } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConflictError } from '../../../../../core/domain/errors.js';
import { backupCode, isStale, retentionUntil } from '../domain/backup-rules.js';
import { BackupRunner, BackupStore } from './backup-store.js';

/**
 * On-demand full backups (System Health › Backups). POST /run records a RUNNING row and returns at once; pg_dump runs in
 * the background and the row becomes COMPLETED (size, duration) or FAILED (message). One backup at a time.
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
    for (const r of await this.store.running()) {
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
}
