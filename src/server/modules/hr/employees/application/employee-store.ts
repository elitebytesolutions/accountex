import type { Employee, EmployeeFormOptions, EmployeeList, EmployeeListQuery } from '../../../../../shared/index.js';

/** A row of position history as written (ids; names are resolved on read). */
export type PositionRow = {
  employeeId: string; effectiveDate: string; eventType: string; reason: string | null;
  fromDepartmentId?: string | null; toDepartmentId?: string | null; fromDesignationId?: string | null; toDesignationId?: string | null;
  fromGradeId?: string | null; toGradeId?: string | null; fromBranchId?: string | null; toBranchId?: string | null;
  fromManagerId?: string | null; toManagerId?: string | null; fromEmploymentType?: string | null; toEmploymentType?: string | null;
  fromStatus?: string | null; toStatus?: string | null;
};

export abstract class EmployeeStore {
  abstract page(tenantId: string, q: EmployeeListQuery): Promise<EmployeeList>;
  abstract get(tenantId: string, id: string): Promise<Employee | null>;
  abstract options(tenantId: string): Promise<EmployeeFormOptions>;
  /** Other employees (deleted included) already holding this CNIC or biometric ID. */
  abstract clashes(tenantId: string, values: { cnic?: string; biometricId?: string | null }, exceptId?: string): Promise<{ cnic: boolean; biometricId: boolean }>;
  /** employee id → reporting manager id, for cycle checks. */
  abstract managers(tenantId: string): Promise<Map<string, string | null>>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract addHistory(tenantId: string, row: PositionRow): Promise<void>;
  /** Is the user active, in this tenant and not linked to another employee? */
  abstract userFree(tenantId: string, userId: string, employeeId: string): Promise<'ok' | 'missing' | 'linked'>;
  abstract setUserLink(tenantId: string, userId: string, employeeId: string | null): Promise<void>;
  abstract inUse(tenantId: string, id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
