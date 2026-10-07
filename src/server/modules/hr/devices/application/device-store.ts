import type { Device, DeviceSyncLog } from '../../../../../shared/index.js';

export abstract class DeviceStore {
  abstract list(tenantId: string): Promise<Device[]>;
  abstract logs(tenantId: string, deviceId?: string): Promise<DeviceSyncLog[]>;
  abstract taken(tenantId: string): Promise<{ id: string; code: string; serialNo: string; deleted: boolean }[]>;
  abstract activeBranch(tenantId: string, id: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
