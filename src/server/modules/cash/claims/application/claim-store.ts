import type { ExpenseClaim, ExpenseClaimList } from '../../../../../shared/index.js';

export type ClaimBase = Omit<ExpenseClaim, 'approvalId' | 'canAct'>;

export abstract class ClaimStore {
  abstract list(tenantId: string, q: { status?: string; department?: string; search?: string; employeeId?: string; page: number; pageSize: number }): Promise<ExpenseClaimList>;
  abstract get(tenantId: string, id: string): Promise<ClaimBase | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Columns the save function leaves alone (status, stage, approval and payment details). */
  abstract set(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract addAction(tenantId: string, claimId: string, action: string, stage: string, actorUserId: string | null, comment: string | null): Promise<void>;
  abstract deleteDraft(tenantId: string, id: string, rowVersion: number): Promise<void>;
  /** The employee record of a signed-in user (null when the user is not an employee). */
  abstract employeeOf(tenantId: string, userId: string): Promise<{ id: string; branchId: string } | null>;
  /** Claimed in a category in the month of a date (submitted, approved or paid; not this claim). */
  abstract usedInMonth(tenantId: string, employeeId: string, categoryId: string, date: string, exceptId: string | null): Promise<number>;
  abstract approve(id: string, comment: string | null): Promise<void>;
  abstract pay(id: string): Promise<void>;
}
