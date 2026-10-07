import type { Unit } from '../../../../../shared/index.js';

export abstract class UnitStore {
  abstract list(tenantId: string): Promise<Unit[]>;
  /** Codes of deleted units (from row history: the table has no soft delete). */
  abstract retiredCodes(tenantId: string): Promise<string[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract delete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
