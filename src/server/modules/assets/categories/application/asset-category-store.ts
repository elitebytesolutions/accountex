import type { AssetCategory } from '../../../../../shared/index.js';

export abstract class AssetCategoryStore {
  abstract list(tenantId: string): Promise<AssetCategory[]>;
  abstract retiredCodes(tenantId: string): Promise<string[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
