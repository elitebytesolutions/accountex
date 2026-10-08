import type { CompOffClaim, LeaveAdjustmentItem, LeaveBalanceQuery, LeaveBalanceView, YearEndClosing, YearEndPlanRow } from '../../../../../shared/index.js';

export abstract class LeaveBalanceStore {
  abstract today(tenantId: string): Promise<string>;
  abstract yearStart(tenantId: string, date: string): Promise<string>;
  abstract view(tenantId: string, q: LeaveBalanceQuery & { yearStart: string; today: string }): Promise<Omit<LeaveBalanceView, 'years'>>;
  abstract years(tenantId: string): Promise<string[]>;
  abstract adjustments(tenantId: string, q: { employeeId?: string; leaveTypeId?: string; yearStart?: string }): Promise<LeaveAdjustmentItem[]>;
  abstract compOffClaims(tenantId: string, employeeId: string): Promise<CompOffClaim[]>;
  abstract employeeActive(tenantId: string, employeeId: string): Promise<boolean>;
  abstract addAdjustment(data: Record<string, unknown>): Promise<string>;
  abstract accrue(month: string, employeeId?: string): Promise<{ credited: number; skipped: number; leaveYearStart: string }>;
  abstract plan(tenantId: string, closingYearStart: string): Promise<{ rows: YearEndPlanRow[]; employees: number }>;
  abstract closings(tenantId: string): Promise<YearEndClosing[]>;
  abstract createClosing(data: Record<string, unknown>): Promise<string>;
  abstract completeClosing(id: string): Promise<void>;
  abstract reverseClosing(id: string, reason: string): Promise<void>;
}
