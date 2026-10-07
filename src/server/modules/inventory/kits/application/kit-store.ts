import type { Kit } from '../../../../../shared/index.js';

export abstract class KitStore {
  abstract list(tenantId: string): Promise<Kit[]>;
  /** Every kit code ever used, deleted kits included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<string[]>;
  /** Live products by id (cost for the kit's cost). */
  abstract products(tenantId: string, ids: string[]): Promise<{ id: string; cost: number; isKit: boolean }[]>;
  /** The unit kits are counted in (PCS, else the first active count unit). */
  abstract pieceUnit(tenantId: string): Promise<string | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
