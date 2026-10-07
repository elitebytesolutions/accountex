import type { Shift } from '../../../../../shared/index.js';

export abstract class ShiftStore {
  abstract list(tenantId: string): Promise<Shift[]>;
  /** Every code ever used, deleted shifts included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
