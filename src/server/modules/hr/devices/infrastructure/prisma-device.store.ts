import { Injectable } from '@nestjs/common';
import type { Device, DeviceSyncLog } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { DeviceStore } from '../application/device-store.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

@Injectable()
export class PrismaDeviceStore extends DeviceStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<Device[]> {
    const db = this.prisma.db();
    const rows = await db.biometricDevices.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } });
    const branches = await db.branches.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.branchId))] } }, select: { id: true, code: true, name: true } });
    return rows.map((d) => ({
      id: d.id, code: d.code, locationLabel: d.locationLabel, brand: d.brand, model: d.model, serialNo: d.serialNo,
      branch: branches.find((b) => b.id === d.branchId) ?? { id: d.branchId, code: '', name: '' },
      connectionType: d.connectionType, ipAddress: d.ipAddress, port: d.port, hasCommKey: !!d.commKeySecret, timezone: d.timezone, punchDirection: d.punchDirection,
      syncIntervalMin: d.syncIntervalMin, firmwareVersion: d.firmwareVersion, status: d.status, lastHeartbeatAt: iso(d.lastHeartbeatAt), lastSyncAt: iso(d.lastSyncAt),
      usersEnrolled: d.usersEnrolled, facesEnrolled: d.facesEnrolled, fingersEnrolled: d.fingersEnrolled, isActive: d.isActive, rowVersion: d.rowVersion,
    }));
  }

  async logs(tenantId: string, deviceId?: string): Promise<DeviceSyncLog[]> {
    const db = this.prisma.db();
    const rows = await db.deviceSyncLogs.findMany({ where: { tenantId, ...(deviceId && { deviceId }) }, orderBy: { occurredAt: 'desc' }, take: 100 });
    const devices = await db.biometricDevices.findMany({ where: { tenantId, id: { in: rows.map((r) => r.deviceId).filter((x): x is string => !!x) } }, select: { id: true, code: true } });
    return rows.map((r) => ({
      id: r.id, device: devices.find((d) => d.id === r.deviceId)?.code ?? null, occurredAt: r.occurredAt.toISOString(), operation: r.operation,
      records: r.records, durationMs: r.durationMs, result: r.result, message: r.message,
    }));
  }

  async taken(tenantId: string) {
    const rows = await this.prisma.db().biometricDevices.findMany({ where: { tenantId }, select: { id: true, code: true, serialNo: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, code: r.code, serialNo: r.serialNo, deleted: r.deletedAt !== null }));
  }

  async activeBranch(tenantId: string, id: string) {
    return (await this.prisma.db().branches.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'biometricDeviceAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'devices', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().biometricDevices.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this device. Reload and try again.');
  }
}
