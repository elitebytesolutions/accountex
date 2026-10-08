import type { SalaryStructure } from '../../../../../shared/index.js';

export abstract class StructureStore {
  abstract list(tenantId: string): Promise<SalaryStructure[]>;
  /** Every code ever used, deleted structures included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
