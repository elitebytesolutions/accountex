import type { VendorCategory } from '../../../../../shared/index.js';

export abstract class VendorCategoryStore {
  abstract list(tenantId: string): Promise<VendorCategory[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
