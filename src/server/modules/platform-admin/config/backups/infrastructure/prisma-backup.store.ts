import { Injectable } from '@nestjs/common';
import type { BackupRun } from '../../../../../../shared/index.js';
import type { BackupRuns } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { BackupStore } from '../application/backup-store.js';

@Injectable()
export class PrismaBackupStore extends BackupStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(limit: number) {
    return this.map(await this.prisma.db().backupRuns.findMany({ orderBy: { startedAt: 'desc' }, take: limit }));
  }

  async get(id: string) {
    const r = await this.prisma.db().backupRuns.findUnique({ where: { id } });
    return r ? (await this.map([r]))[0]! : null;
  }

  running(backupType?: 'FULL' | 'TENANT_EXPORT') {
    return this.prisma.db().backupRuns.findMany({ where: { status: 'RUNNING', ...(backupType && { backupType }) }, select: { id: true, startedAt: true } });
  }

  async start(data: { code: string; location: string; requestedByStaffId: string | null; retentionUntil: Date }) {
    const row = await this.prisma.db().backupRuns.create({
      data: {
        ...data, backupType: 'FULL', status: 'RUNNING',
        // A plain pg_dump file: not encrypted, not verified (honest values, not the column defaults).
        encryption: 'NONE', verification: 'NONE', notifyOwner: false,
      },
      select: { id: true },
    });
    return row.id;
  }

  /** Phase 43: a tenant export (JSON, not encrypted, not verified). */
  async startExport(data: { code: string; location: string; tenantId: string; requestedByStaffId: string | null; retentionUntil: Date }) {
    const row = await this.prisma.db().backupRuns.create({
      data: { ...data, backupType: 'TENANT_EXPORT', exportFormat: 'JSON', status: 'RUNNING', encryption: 'NONE', verification: 'NONE', notifyOwner: false },
      select: { id: true },
    });
    return row.id;
  }

  async finish(id: string, result: { status: 'COMPLETED' | 'FAILED'; sizeBytes: number | null; failureMessage: string | null }) {
    await this.prisma.db().backupRuns.update({
      where: { id },
      data: { status: result.status, sizeBytes: result.sizeBytes === null ? null : BigInt(result.sizeBytes), failureMessage: result.failureMessage, finishedAt: new Date() },
    });
  }

  private async map(rows: BackupRuns[]): Promise<BackupRun[]> {
    const staffIds = [...new Set(rows.map((r) => r.requestedByStaffId).filter((x): x is string => !!x))];
    const staff = staffIds.length
      ? await this.prisma.db().$queryRaw<{ id: string; fullName: string }[]>`select id::text as id, "fullName" from "Platform"."PlatformStaff" where id = any(${staffIds}::uuid[])`
      : [];
    const names = new Map(staff.map((s) => [s.id, s.fullName]));
    return rows.map((r) => ({
      id: r.id, code: r.code, backupType: r.backupType, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
      durationSeconds: r.finishedAt ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000) : null,
      sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes), location: r.location, encryption: r.encryption, verification: r.verification,
      status: r.status, failureMessage: r.failureMessage, requestedBy: r.requestedByStaffId ? (names.get(r.requestedByStaffId) ?? null) : null,
    }));
  }
}
