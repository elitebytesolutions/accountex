import type { PayGroup, TaxSlab } from '../../../../../shared/index.js';

export abstract class PayGroupStore {
  abstract list(tenantId: string): Promise<PayGroup[]>;
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}

/** Salary tax slabs, a tax year at a time. */
export abstract class TaxSlabStore {
  abstract years(tenantId: string): Promise<{ taxYear: string; slabs: TaxSlab[] }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Hard-deletes slab rows (they are child-free and audited). */
  abstract remove(tenantId: string, ids: string[]): Promise<void>;
}
