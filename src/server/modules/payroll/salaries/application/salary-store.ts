import type { EmployeeSalary } from '../../../../../shared/index.js';

export abstract class SalaryStore {
  /** The employee's salaries, newest first (isCurrent = in force today). */
  abstract history(tenantId: string, employeeId: string): Promise<EmployeeSalary[]>;
  abstract employee(tenantId: string, id: string): Promise<{ id: string; status: string; joiningDate: string } | null>;
  abstract employeeOfSalary(tenantId: string, salaryId: string): Promise<string | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract remove(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
