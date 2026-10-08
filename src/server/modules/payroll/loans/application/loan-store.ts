import type { Loan, LoanList } from '../../../../../shared/index.js';

export type LoanBase = Omit<Loan, 'approval' | 'waitingOn' | 'canAct'>;
export type LoanQuery = { status?: string; type?: string; search?: string; employeeId?: string; page: number; pageSize: number };

export abstract class LoanStore {
  abstract list(tenantId: string, q: LoanQuery): Promise<LoanList>;
  abstract get(tenantId: string, id: string): Promise<LoanBase | null>;
  /** Salary and loan facts for the policy checks. */
  abstract facts(tenantId: string, employeeId: string): Promise<{ gross: number; basic: number; joiningDate: string | null; status: string | null; openLoans: number; openAdvances: number; runningInstallments: number } | null>;
  abstract employeeOf(tenantId: string, userId: string): Promise<{ id: string } | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract approve(id: string, comment: string | null): Promise<void>;
  abstract reject(id: string, reason: string): Promise<void>;
  abstract disburse(id: string, date: string, bankAccountId: string | null, cashAccountId: string | null): Promise<void>;
  abstract setApprovalRequest(tenantId: string, id: string, approvalRequestId: string): Promise<void>;
}
