import type { OvertimePolicy } from '../../../../../shared/index.js';

export abstract class OvertimeStore {
  abstract list(tenantId: string): Promise<OvertimePolicy[]>;
  abstract grades(tenantId: string): Promise<{ id: string; code: string; name: string }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
