import type { CustomerGroup } from '../../../../../shared/index.js';

export abstract class CustomerGroupStore {
  abstract list(tenantId: string): Promise<CustomerGroup[]>;
  /** Every code ever used, deleted rows included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract activePriceList(tenantId: string, id: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
