import type { MyPayslips, Payslip, PayslipList } from '../../../../../shared/index.js';

export type PayslipQuery = { run?: string; status?: string; search?: string; department?: string; page: number; pageSize: number };

export abstract class PayslipStore {
  abstract list(tenantId: string, q: PayslipQuery): Promise<PayslipList>;
  abstract get(tenantId: string, id: string): Promise<Payslip | null>;
  /** Published payslips of one employee, newest first, with the tax year to date. */
  abstract mine(tenantId: string, employeeId: string): Promise<MyPayslips>;
  abstract markViewed(tenantId: string, id: string): Promise<void>;
  abstract markPrinted(tenantId: string, id: string): Promise<void>;
  abstract employeeOf(tenantId: string, userId: string): Promise<{ id: string } | null>;
}
