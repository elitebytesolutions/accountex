import type { Warehouse } from '../../../../../shared/index.js';

export abstract class WarehouseStore {
  /** Live warehouses (primary first) with live bins, names of branch / manager / GL account and stock figures. */
  abstract list(tenantId: string): Promise<Warehouse[]>;
  /** Every warehouse code ever used, deleted rows included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  /** Every bin code of a warehouse, deleted bins included. */
  abstract allBinCodes(tenantId: string, warehouseId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract activeBranch(tenantId: string, id: string): Promise<boolean>;
  abstract activeUser(tenantId: string, id: string): Promise<boolean>;
  /** Form choices: active users (manager) and active postable asset accounts (inventory account). */
  abstract formOptions(tenantId: string): Promise<{ managers: { id: string; name: string }[]; accounts: { id: string; code: string; name: string }[] }>;
  /** Any stock on hand (non-zero quantity) in the warehouse. */
  abstract hasStock(tenantId: string, warehouseId: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract saveBin(data: Record<string, unknown>): Promise<string>;
  /** Used by anything other than its own bins. */
  abstract inUse(id: string): Promise<boolean>;
  abstract binInUse(id: string): Promise<boolean>;
  /** Soft-deletes the warehouse and its bins. */
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract softDeleteBin(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
