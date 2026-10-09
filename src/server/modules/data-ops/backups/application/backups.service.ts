import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BackupOverview, BackupSettingsInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { DataOpsStore, TenantSnapshots } from '../../common/application/data-ops-store.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * Company backups: "Back up now" writes a snapshot of every company table (the platform tenant export, JSON, secrets
 * removed) in the background — one at a time; completed snapshots download. The schedule is stored (an automatic job
 * runs it later). A restore is a request with the company code typed to confirm and an optional safety snapshot; it is
 * carried out by Accountex support, never by the app itself.
 */
@Injectable()
export class BackupsService {
  constructor(private readonly store: DataOpsStore, private readonly snapshots: TenantSnapshots, private readonly unitOfWork: UnitOfWork) {}

  async overview(user: SessionUser): Promise<BackupOverview> {
    const [o, companyCode] = await Promise.all([this.store.backupOverview(user.tenantId), this.store.companyCode(user.tenantId)]);
    return { ...o, companyCode };
  }

  async saveSettings(user: SessionUser, meta: RequestMeta, input: BackupSettingsInput) {
    const [h, m] = input.runAt.split(':').map(Number);
    const next = new Date();
    next.setUTCHours(h! - 5, m!, 0, 0); // Asia/Karachi is UTC+5
    if (next <= new Date()) next.setUTCDate(next.getUTCDate() + (input.frequency === 'WEEKLY' ? 7 : 1));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBackupSettings(user.tenantId, {
      frequency: input.frequency, runAt: new Date(`1970-01-01T${input.runAt}:00Z`), keepDailyDays: Number(input.keepDailyDays), keepMonthlyMonths: Number(input.keepMonthlyMonths),
      includeAttachments: input.includeAttachments ?? true, emailOwnerOnFailure: input.emailOwnerOnFailure ?? true, nextRunAt: next,
    }));
    return this.overview(user);
  }

  /** Starts a snapshot (409 BACKUP_RUNNING when one is running); the export finishes in the background. */
  async run(user: SessionUser, meta: RequestMeta, kind: 'MANUAL' | 'SAFETY' = 'MANUAL', note: string | null = null) {
    const o = await this.store.backupOverview(user.tenantId);
    if (o.snapshots.some((s) => s.status === 'RUNNING')) throw new ConflictError('A backup is already running. Try again when it finishes.', undefined, { code: 'BACKUP_RUNNING' });
    const now = new Date();
    const snapshotCode = `snap-${ymd(now)}-${kind.toLowerCase()}-${randomBytes(3).toString('hex')}`;
    const expiresAt = new Date(now.getTime() + o.settings.keepDailyDays * 86_400_000);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.startBackup(user.tenantId, { snapshotCode, kind, note, requestedByUserId: user.id, expiresAt }));
    const location = this.snapshots.locationFor(user.tenantId, snapshotCode);
    void this.snapshots.export(user.tenantId, location)
      .then((r) => this.unitOfWork.run(actorContext(user, meta), () => this.store.finishBackup(user.tenantId, id, { status: 'COMPLETED', sizeBytes: r.sizeBytes, statusNote: null })))
      .catch((e: unknown) => this.unitOfWork.run(actorContext(user, meta), () => this.store.finishBackup(user.tenantId, id, { status: 'FAILED', sizeBytes: null, statusNote: e instanceof Error ? e.message : 'Export failed' })).catch(() => undefined));
    return { id, snapshotCode };
  }

  async download(user: SessionUser, id: string) {
    const b = await this.store.getBackup(user.tenantId, id);
    if (!b) throw new NotFoundError('Backup not found');
    if (b.status !== 'COMPLETED') throw new ConflictError('This backup did not complete and can’t be downloaded.', undefined, { code: 'BACKUP_NOT_AVAILABLE' });
    return { fileName: `${b.snapshotCode}.json`, data: await this.snapshots.read(this.snapshots.locationFor(user.tenantId, b.snapshotCode)) };
  }

  /** Records a restore request (company code typed exactly; one open at a time; optional safety snapshot first). */
  async requestRestore(user: SessionUser, meta: RequestMeta, snapshotId: string, input: { reason: string; confirmText: string; takeSafetyBackup?: boolean }) {
    const b = await this.store.getBackup(user.tenantId, snapshotId);
    if (!b) throw new NotFoundError('Backup not found');
    if (b.status !== 'COMPLETED') throw new ConflictError('This backup did not complete and can’t be restored.', undefined, { code: 'BACKUP_NOT_AVAILABLE' });
    const code = await this.store.companyCode(user.tenantId);
    if (input.confirmText.trim() !== code) throw new ValidationError('Type the company code exactly to confirm the restore.', { confirmText: [`Type ${code}`] }, { code: 'RESTORE_CONFIRM_MISMATCH' });
    if (await this.store.openRestore(user.tenantId)) throw new ConflictError('A restore request is already open.', undefined, { code: 'RESTORE_ALREADY_OPEN' });
    const safety = input.takeSafetyBackup ?? true ? await this.run(user, meta, 'SAFETY', `Before restoring ${b.snapshotCode}`) : null;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.createRestore(user.tenantId, {
      snapshotId, reason: input.reason, confirmText: input.confirmText.trim(), takeSafetyBackup: input.takeSafetyBackup ?? true, safetySnapshotId: safety?.id ?? null, requestedByUserId: user.id,
    }));
    return (await this.store.getRestore(user.tenantId, id))!;
  }

  async cancelRestore(user: SessionUser, meta: RequestMeta, id: string) {
    const r = await this.store.getRestore(user.tenantId, id);
    if (!r) throw new NotFoundError('Restore request not found');
    if (!['REQUESTED', 'SCHEDULED'].includes(r.status)) throw new ConflictError('This restore request is no longer open.', undefined, { code: 'RESTORE_NOT_OPEN' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.cancelRestore(user.tenantId, id, r.rowVersion));
    if (!ok) throw new ConcurrencyError('This request was changed. Reload and try again.');
    return (await this.store.getRestore(user.tenantId, id))!;
  }
}
