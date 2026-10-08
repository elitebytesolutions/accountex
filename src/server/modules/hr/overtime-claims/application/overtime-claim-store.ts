import type { OvertimeClaim, OvertimeClaimList } from '../../../../../shared/index.js';

export type ClaimBase = Omit<OvertimeClaim, 'approval' | 'canAct' | 'waitingOn'>;
export type ActivePolicy = {
  id: string; weekdayMultiplier: number; weeklyOffMultiplier: number; holidayMultiplier: number; hourlyRateBasis: string; minMinutes: number;
  dailyCapHours: number | null; monthlyCapHours: number | null; rounding: string; eligibleUpToGradeRank: number | null; allowCompOff: boolean;
};

export abstract class OvertimeClaimStore {
  abstract list(tenantId: string, q: { month: string; status?: string; search?: string; page: number; pageSize: number }): Promise<Omit<OvertimeClaimList, 'items'> & { items: ClaimBase[] }>;
  abstract get(tenantId: string, id: string): Promise<ClaimBase | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract approve(id: string): Promise<void>;
  abstract reject(id: string, reason: string): Promise<void>;
  abstract cancel(id: string, reason: string | null): Promise<void>;
  abstract activePolicy(tenantId: string): Promise<ActivePolicy | null>;
  /** The employee (working on the date) with their grade rank and branch. */
  abstract employee(tenantId: string, id: string, date: string): Promise<{ id: string; branchId: string | null; gradeRank: number | null } | null>;
  /** Hourly rate from the salary in force on the date and the policy basis (null when no salary is on record). */
  abstract hourlyRate(tenantId: string, employeeId: string, date: string, basis: string): Promise<number | null>;
  /** Hours claimed in a payroll month (pending, approved or pushed), except one claim. */
  abstract hoursInMonth(tenantId: string, employeeId: string, month: string, exceptId: string | null): Promise<number>;
}
