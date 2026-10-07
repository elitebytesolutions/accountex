import type { Department, DepartmentListQuery, ListResult } from '../../../../../shared/index.js';

export abstract class DepartmentStore {
  abstract page(tenantId: string, q: DepartmentListQuery): Promise<ListResult<Department>>;
  abstract get(tenantId: string, id: string): Promise<Department | null>;
  /** id → parentId and active flag of every live department (for cycle and child checks). */
  abstract tree(tenantId: string): Promise<{ id: string; parentId: string | null; isActive: boolean }[]>;
  /** Every code ever used, deleted departments included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract activeCostCentre(tenantId: string, id: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
