import type { Designation } from '../../../../../shared/index.js';

export abstract class DesignationStore {
  abstract list(tenantId: string, departmentId?: string): Promise<Designation[]>;
  /** id → reports-to of every live designation (for the cycle check). */
  abstract chain(tenantId: string): Promise<{ id: string; reportsToDesignationId: string | null }[]>;
  abstract activeDepartment(tenantId: string, id: string): Promise<boolean>;
  abstract activeGrade(tenantId: string, id: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
