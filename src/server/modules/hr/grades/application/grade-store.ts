import type { Grade } from '../../../../../shared/index.js';

export abstract class GradeStore {
  abstract list(tenantId: string): Promise<Grade[]>;
  /** Every code ever used, deleted grades included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  /** Level ranks held by any grade, deleted ones included (the DB keeps ranks unique across all rows). */
  abstract allRanks(tenantId: string): Promise<{ id: string; levelRank: number; deleted: boolean }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
