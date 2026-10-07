import type { Van, VanWarehouse } from '../../../../../shared/distribution/index.js';

export abstract class VanStore {
  /** Live vans; `drivers` resolves default-driver employee ids to names. */
  abstract list(tenantId: string, drivers: (ids: string[]) => Promise<{ id: string; code: string; name: string }[]>): Promise<Van[]>;
  /** VAN-type warehouses (not deleted) and the van on each. */
  abstract vanWarehouses(tenantId: string): Promise<VanWarehouse[]>;
  /** A live warehouse's type, or null when it doesn't exist. */
  abstract warehouseType(tenantId: string, id: string): Promise<string | null>;
  /** The live van on a warehouse, other than `exceptId`. */
  abstract vanOnWarehouse(tenantId: string, warehouseId: string, exceptId?: string): Promise<string | null>;
  abstract regNoTaken(tenantId: string, regNo: string, exceptId?: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  /** Every warehouse code ever used (live or deleted: codes are never reused). */
  abstract warehouseCodes(tenantId: string): Promise<string[]>;
  /** The branch a new van stock location goes under: the van's (when active), else the default / head-office branch. */
  abstract stockBranch(tenantId: string, vanBranchId: string | null): Promise<string | null>;
  /** Creates a warehouse through the warehouses' save function (Inventory.warehouseAddUpdate); returns its id. */
  abstract saveWarehouse(data: Record<string, unknown>): Promise<string>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
