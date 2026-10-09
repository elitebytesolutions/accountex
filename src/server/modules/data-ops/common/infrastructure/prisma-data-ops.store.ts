import { Injectable } from '@nestjs/common';
import type { BackupOverview, BackupSnapshot, DataImport, ImportError, IntegrationCard, IssuedApiKey, RestoreRequest, TenantWebhook, TenantWebhookDelivery } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { userRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { DataOpsStore } from '../application/data-ops-store.js';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** Where each provider is managed in the app (FBR has its own screen; bank feeds live under banking). */
const MANAGE: Record<string, string> = { FBR_IRIS_POS: '/tax/fbr', BANK_FEED: '/bank/reconciliation', ZKTECO: '/hr/devices' };
const CATEGORY: Record<string, string> = {
  FBR_IRIS_POS: 'TAX', BANK_FEED: 'BANKING', ZKTECO: 'HR', GOOGLE_WORKSPACE: 'SSO', MICROSOFT_365: 'SSO', WHATSAPP_BUSINESS: 'MESSAGING', SMTP: 'EMAIL', DARAZ: 'COMMERCE', SHOPIFY: 'COMMERCE',
};

@Injectable()
export class PrismaDataOpsStore extends DataOpsStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ---------------------------------------------------------------- imports
  async nextImportNo() {
    const r = await this.prisma.db().$queryRawUnsafe<{ no: string }[]>(`select "Company"."getNextDocNo"('IMP', current_date, null) as no`);
    return r[0]!.no;
  }

  async createImport(tenantId: string, data: Record<string, unknown>) {
    return (await this.prisma.db().dataImports.create({ data: { tenantId, ...data } as never, select: { id: true } })).id;
  }

  async updateImport(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().dataImports.updateMany({ where: { tenantId, id }, data });
  }

  async replaceImportErrors(tenantId: string, id: string, errors: ImportError[]) {
    const db = this.prisma.db();
    await db.dataImportErrors.deleteMany({ where: { tenantId, jobId: id } });
    await this.addImportErrors(tenantId, id, errors);
  }

  async addImportErrors(tenantId: string, id: string, errors: ImportError[]) {
    if (errors.length) await this.prisma.db().dataImportErrors.createMany({ data: errors.slice(0, 5000).map((e) => ({ tenantId, jobId: id, rowNo: e.rowNo, fieldKey: e.fieldKey, badValue: e.badValue?.slice(0, 500) ?? null, message: e.message.slice(0, 500) })) });
  }

  async listImports(tenantId: string) {
    const rows = await this.prisma.db().dataImports.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return this.mapImports(tenantId, rows, false);
  }

  async getImport(tenantId: string, id: string, withErrors: boolean) {
    const row = await this.prisma.db().dataImports.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapImports(tenantId, [row], withErrors))[0]! : null;
  }

  private async mapImports(tenantId: string, rows: Awaited<ReturnType<PrismaService['dataImports']['findMany']>>, withErrors: boolean): Promise<DataImport[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [users, errors] = await Promise.all([
      userRefs(db, tenantId, rows.map((r) => r.startedByUserId)),
      withErrors ? db.dataImportErrors.findMany({ where: { tenantId, jobId: { in: rows.map((r) => r.id) } }, orderBy: [{ rowNo: 'asc' }] }) : Promise.resolve([]),
    ]);
    return rows.map((r) => ({
      id: r.id, jobNo: r.jobNo, entity: r.entity, fileName: r.fileName, fileSizeBytes: n(r.fileSizeBytes), sourceSystem: r.sourceSystem, totalRows: r.totalRows ?? 0,
      columnMap: (r.columnMap ?? {}) as Record<string, string>, skipErrorRows: r.skipErrorRows, status: r.status, errorCount: r.errorCount, rowsCreated: r.rowsCreated,
      rowsUpdated: r.rowsUpdated, rowsSkipped: r.rowsSkipped, startedBy: users.get(r.startedByUserId ?? '') ?? null, startedAt: iso(r.startedAt), finishedAt: iso(r.finishedAt),
      createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
      ...(withErrors && { errors: errors.filter((e) => e.jobId === r.id).map((e) => ({ rowNo: e.rowNo, fieldKey: e.fieldKey, badValue: e.badValue, message: e.message })) }),
    }));
  }

  async unitIds(tenantId: string) {
    const rows = await this.prisma.db().unitsOfMeasure.findMany({ where: { tenantId }, select: { id: true, code: true } });
    return new Map(rows.map((u) => [u.code.toUpperCase(), u.id]));
  }

  // ---------------------------------------------------------------- integrations
  async integrationCards(tenantId: string): Promise<IntegrationCard[]> {
    const db = this.prisma.db();
    const [providers, rows, fbr] = await Promise.all([
      db.lookups.findMany({ where: { lookupType: 'Provider', isActive: true, OR: [{ tenantId: null }, { tenantId }] }, orderBy: { sortOrder: 'asc' } }),
      db.integrations.findMany({ where: { tenantId } }),
      db.fbrSettings.findFirst({ where: { tenantId, isActive: true }, select: { authority: true, connectionStatus: true, updatedAt: true } }),
    ]);
    const users = await userRefs(db, tenantId, rows.map((r) => r.connectedByUserId));
    return providers.map((p) => {
      const r = rows.find((x) => x.provider === p.code && !x.bankAccountId);
      const fbrCard = p.code === 'FBR_IRIS_POS' && fbr;
      return {
        provider: p.code, label: p.label, category: r?.category ?? CATEGORY[p.code] ?? 'OTHER',
        status: fbrCard ? (fbr.connectionStatus === 'CONNECTED' ? 'CONNECTED' : 'NOT_CONNECTED') : r?.status ?? 'NOT_CONNECTED',
        displayName: r?.displayName ?? p.label, referenceLabel: fbrCard ? `${fbr.authority} settings saved` : r?.referenceLabel ?? null,
        connectedAt: iso(r?.connectedAt), connectedBy: users.get(r?.connectedByUserId ?? '') ?? null, lastSyncAt: iso(r?.lastSyncAt), lastError: r?.lastError ?? null,
        manageRoute: MANAGE[p.code] ?? null, rowVersion: r?.rowVersion ?? null,
      };
    });
  }

  async setIntegration(tenantId: string, provider: string, category: string, displayName: string, status: 'CONNECTED' | 'NOT_CONNECTED', userId: string) {
    const db = this.prisma.db();
    const data = { status, connectedAt: status === 'CONNECTED' ? new Date() : null, connectedByUserId: status === 'CONNECTED' ? userId : null, lastError: null };
    const existing = await db.integrations.findFirst({ where: { tenantId, provider, bankAccountId: null }, select: { id: true } });
    if (existing) await db.integrations.updateMany({ where: { tenantId, id: existing.id }, data });
    else await db.integrations.create({ data: { tenantId, provider, category, displayName, ...data } });
  }

  async issuedKeys(tenantId: string): Promise<IssuedApiKey[]> {
    const rows = await this.prisma.db().platformApiKeys.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return rows.map((k) => ({
      id: k.id, name: k.name, environment: k.environment, prefix: k.keyPrefix, last4: k.keyLast4, scopes: k.scopes, createdAt: k.createdAt.toISOString(),
      expiresAt: iso(k.expiresAt), lastUsedAt: iso(k.lastUsedAt), status: k.status,
    }));
  }

  async listWebhooks(tenantId: string) {
    const rows = await this.prisma.db().integrationWebhooks.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return rows.map((w) => this.webhook(w));
  }

  async getWebhook(tenantId: string, id: string) {
    const w = await this.prisma.db().integrationWebhooks.findFirst({ where: { tenantId, id, deletedAt: null } });
    return w ? { ...this.webhook(w), signingSecretEnc: Buffer.from(w.signingSecretEnc) } : null;
  }

  private webhook(w: { id: string; url: string; events: string[]; isActive: boolean; healthStatus: string; successRatePct: unknown; lastDeliveryAt: Date | null; createdAt: Date; rowVersion: number }): TenantWebhook {
    return { id: w.id, url: w.url, events: w.events, isActive: w.isActive, healthStatus: w.healthStatus, successRatePct: n(w.successRatePct), lastDeliveryAt: iso(w.lastDeliveryAt), createdAt: w.createdAt.toISOString(), rowVersion: w.rowVersion };
  }

  async createWebhook(tenantId: string, data: { url: string; events: string[]; isActive: boolean; signingSecretEnc: Buffer }) {
    return (await this.prisma.db().integrationWebhooks.create({ data: { tenantId, url: data.url, events: data.events, isActive: data.isActive, signingSecretEnc: new Uint8Array(data.signingSecretEnc) }, select: { id: true } })).id;
  }

  async updateWebhook(tenantId: string, id: string, rowVersion: number, data: { url: string; events: string[]; isActive: boolean }) {
    return (await this.prisma.db().integrationWebhooks.updateMany({ where: { tenantId, id, rowVersion }, data: { ...data, healthStatus: data.isActive ? undefined : 'DISABLED' } })).count > 0;
  }

  async deleteWebhook(tenantId: string, id: string) {
    const db = this.prisma.db();
    // the delivery log is append-only, so an endpoint that has one is soft-deleted (hidden, never sent to again)
    if (await db.integrationWebhookDeliveries.count({ where: { tenantId, endpointId: id } })) {
      await db.integrationWebhooks.updateMany({ where: { tenantId, id }, data: { isActive: false, healthStatus: 'DISABLED', deletedAt: new Date() } });
    } else await db.integrationWebhooks.deleteMany({ where: { tenantId, id } });
  }

  async recordDelivery(tenantId: string, d: { endpointId: string; event: string; payload: unknown; attempt: number; responseStatus: number | null; isSuccess: boolean; error: string | null; durationMs: number }) {
    const db = this.prisma.db();
    const row = await db.integrationWebhookDeliveries.create({
      data: { tenantId, endpointId: d.endpointId, event: d.event, payload: d.payload as never, attempt: Math.min(d.attempt, 20), responseStatus: d.responseStatus, isSuccess: d.isSuccess, error: d.error?.slice(0, 500) ?? null, durationMs: d.durationMs },
      select: { id: true },
    });
    const recent = await db.integrationWebhookDeliveries.findMany({ where: { tenantId, endpointId: d.endpointId }, orderBy: { deliveredAt: 'desc' }, take: 50, select: { isSuccess: true } });
    const rate = Math.round((recent.filter((x) => x.isSuccess).length / recent.length) * 1000) / 10;
    await db.integrationWebhooks.updateMany({ where: { tenantId, id: d.endpointId, isActive: true }, data: { lastDeliveryAt: new Date(), successRatePct: rate, healthStatus: rate >= 90 ? 'HEALTHY' : 'FAILING' } });
    return row.id;
  }

  async deliveries(tenantId: string, endpointId: string): Promise<TenantWebhookDelivery[]> {
    const rows = await this.prisma.db().integrationWebhookDeliveries.findMany({ where: { tenantId, endpointId }, orderBy: { deliveredAt: 'desc' }, take: 50 });
    return rows.map((d) => ({ id: d.id, endpointId: d.endpointId, event: d.event, attempt: d.attempt, responseStatus: d.responseStatus, isSuccess: d.isSuccess, error: d.error, durationMs: d.durationMs, deliveredAt: d.deliveredAt.toISOString() }));
  }

  async getDelivery(tenantId: string, id: string) {
    const d = await this.prisma.db().integrationWebhookDeliveries.findFirst({ where: { tenantId, id } });
    return d ? { id: d.id, endpointId: d.endpointId, event: d.event, attempt: d.attempt, responseStatus: d.responseStatus, isSuccess: d.isSuccess, error: d.error, durationMs: d.durationMs, deliveredAt: d.deliveredAt.toISOString(), payload: d.payload } : null;
  }

  // ---------------------------------------------------------------- backups
  async backupOverview(tenantId: string): Promise<Omit<BackupOverview, 'companyCode'>> {
    const db = this.prisma.db();
    const [s, snaps, restores] = await Promise.all([
      db.backupSettings.findFirst({ where: { tenantId } }),
      db.backups.findMany({ where: { tenantId }, orderBy: { startedAt: 'desc' }, take: 60 }),
      db.backupRestoreRequests.findMany({ where: { tenantId }, orderBy: { requestedAt: 'desc' }, take: 20 }),
    ]);
    const users = await userRefs(db, tenantId, [...snaps.map((b) => b.requestedByUserId), ...restores.map((r) => r.requestedByUserId)]);
    const snapshots = snaps.map((b) => this.snapshot(b, users));
    const last = snapshots.find((b) => b.status !== 'RUNNING') ?? null;
    const runAt = s?.runAt ? s.runAt.toISOString().slice(11, 16) : '02:00';
    return {
      settings: {
        frequency: s?.frequency ?? 'DAILY', runAt, timezone: s?.timezone ?? 'Asia/Karachi', keepDailyDays: s?.keepDailyDays ?? 35, keepMonthlyMonths: s?.keepMonthlyMonths ?? 12,
        includeAttachments: s?.includeAttachments ?? true, emailOwnerOnFailure: s?.emailOwnerOnFailure ?? true, nextRunAt: iso(s?.nextRunAt), rowVersion: s?.rowVersion ?? null,
      },
      snapshots,
      restoreRequests: restores.map((r) => {
        const snap = snaps.find((b) => b.id === r.snapshotId);
        const safety = snaps.find((b) => b.id === r.safetySnapshotId);
        return {
          id: r.id, snapshot: { id: r.snapshotId, snapshotCode: snap?.snapshotCode ?? '?' }, reason: r.reason, takeSafetyBackup: r.takeSafetyBackup, safetySnapshotCode: safety?.snapshotCode ?? null,
          requestedBy: users.get(r.requestedByUserId) ?? null, requestedAt: r.requestedAt.toISOString(), status: r.status, completedAt: iso(r.completedAt), error: r.error, rowVersion: r.rowVersion,
        };
      }),
      kpis: {
        lastBackupAt: last?.startedAt ?? null, lastStatus: last?.status ?? null,
        lastDurationSec: last?.finishedAt ? Math.round((Date.parse(last.finishedAt) - Date.parse(last.startedAt)) / 1000) : null, lastSizeBytes: last?.sizeBytes ?? null,
        retentionDays: s?.keepDailyDays ?? 35, nextRunAt: iso(s?.nextRunAt),
      },
    };
  }

  private snapshot(b: { id: string; snapshotCode: string; kind: string; note: string | null; startedAt: Date; finishedAt: Date | null; sizeBytes: bigint | null; status: string; statusNote: string | null; isLocked: boolean; expiresAt: Date | null; requestedByUserId: string | null }, users: Map<string, { id: string; name: string }>): BackupSnapshot {
    return {
      id: b.id, snapshotCode: b.snapshotCode, kind: b.kind, note: b.note, startedAt: b.startedAt.toISOString(), finishedAt: iso(b.finishedAt), sizeBytes: n(b.sizeBytes), status: b.status,
      statusNote: b.statusNote, isLocked: b.isLocked, expiresAt: iso(b.expiresAt), requestedBy: users.get(b.requestedByUserId ?? '') ?? null,
    };
  }

  async companyCode(tenantId: string) {
    return (await this.prisma.db().tenants.findFirstOrThrow({ where: { id: tenantId }, select: { code: true } })).code;
  }

  async saveBackupSettings(tenantId: string, data: Record<string, unknown>) {
    const db = this.prisma.db();
    const s = await db.backupSettings.findFirst({ where: { tenantId }, select: { id: true } });
    if (s) await db.backupSettings.updateMany({ where: { tenantId, id: s.id }, data });
    else await db.backupSettings.create({ data: { tenantId, ...data } as never });
  }

  async startBackup(tenantId: string, data: { snapshotCode: string; kind: string; note: string | null; requestedByUserId: string; expiresAt: Date | null }) {
    return (await this.prisma.db().backups.create({ data: { tenantId, ...data, startedAt: new Date(), status: 'RUNNING' }, select: { id: true } })).id;
  }

  async finishBackup(tenantId: string, id: string, result: { status: 'COMPLETED' | 'FAILED'; sizeBytes: number | null; statusNote: string | null }) {
    await this.prisma.db().backups.updateMany({ where: { tenantId, id }, data: { status: result.status, finishedAt: new Date(), sizeBytes: result.sizeBytes === null ? null : BigInt(result.sizeBytes), statusNote: result.statusNote?.slice(0, 300) ?? null } });
  }

  async getBackup(tenantId: string, id: string) {
    const db = this.prisma.db();
    const b = await db.backups.findFirst({ where: { tenantId, id } });
    return b ? this.snapshot(b, await userRefs(db, tenantId, [b.requestedByUserId])) : null;
  }

  async openRestore(tenantId: string) {
    return this.prisma.db().backupRestoreRequests.findFirst({ where: { tenantId, status: { in: ['REQUESTED', 'SCHEDULED', 'RUNNING'] } }, select: { id: true } });
  }

  async createRestore(tenantId: string, data: { snapshotId: string; reason: string; confirmText: string; takeSafetyBackup: boolean; safetySnapshotId: string | null; requestedByUserId: string }) {
    return (await this.prisma.db().backupRestoreRequests.create({ data: { tenantId, ...data, status: 'REQUESTED' }, select: { id: true } })).id;
  }

  async getRestore(tenantId: string, id: string): Promise<RestoreRequest | null> {
    const o = await this.backupOverview(tenantId);
    return o.restoreRequests.find((r) => r.id === id) ?? null;
  }

  async cancelRestore(tenantId: string, id: string, rowVersion: number) {
    return (await this.prisma.db().backupRestoreRequests.updateMany({ where: { tenantId, id, rowVersion, status: { in: ['REQUESTED', 'SCHEDULED'] } }, data: { status: 'CANCELLED' } })).count > 0;
  }
}
