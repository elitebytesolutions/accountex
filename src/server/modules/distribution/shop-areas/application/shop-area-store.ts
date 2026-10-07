import type { ShopArea } from '../../../../../shared/distribution/index.js';

export abstract class ShopAreaStore {
  abstract list(tenantId: string): Promise<ShopArea[]>;
  /** Live areas with the same code, or the same name + city (case-insensitive), other than `exceptId`. */
  abstract clashes(tenantId: string, a: { code: string | null; name: string; city: string | null }, exceptId?: string): Promise<{ code: boolean; name: boolean }>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
