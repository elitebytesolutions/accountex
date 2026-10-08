import type { LeaveBalanceFigures, LeaveFormOptions, LeaveOverview, LeaveRequestItem, LeaveRequestQuery, LeaveTypeRef, MyLeave } from '../../../../../shared/index.js';
import type { EmployeeFacts, LeaveTypeRules } from '../domain/leave-rules.js';

export type LeaveRequestBase = Omit<LeaveRequestItem, 'waitingOn'>;
export type LeaveEmployee = EmployeeFacts & {
  id: string; name: string; branchId: string | null; departmentId: string | null; reportingManagerId: string | null; appUserId: string | null;
};
export type LeaveTypeFull = LeaveTypeRules & LeaveTypeRef & { status: string; daysPerYear: number };
export type LeaveManager = { employeeId: string; name: string; userId: string | null };

export abstract class LeaveRequestStore {
  abstract list(tenantId: string, q: LeaveRequestQuery & { employeeId?: string; yearStart: string }): Promise<{ items: LeaveRequestBase[]; total: number; counts: Record<string, number> }>;
  abstract get(tenantId: string, id: string): Promise<LeaveRequestBase | null>;
  abstract overview(tenantId: string, q: { month: string; departmentId?: string; today: string; yearStart: string; yearEnd: string }): Promise<Omit<LeaveOverview, 'pending' | 'routeNote'> & { pending: LeaveRequestBase[] }>;
  abstract options(tenantId: string): Promise<LeaveFormOptions>;
  abstract myLeave(tenantId: string, employeeId: string, today: string, yearStart: string): Promise<Omit<MyLeave, 'route'>>;

  abstract employeeOfUser(tenantId: string, userId: string): Promise<LeaveEmployee | null>;
  abstract employee(tenantId: string, employeeId: string): Promise<LeaveEmployee | null>;
  abstract manager(tenantId: string, employeeId: string): Promise<LeaveManager | null>;
  abstract leaveType(tenantId: string, id: string): Promise<LeaveTypeFull | null>;
  abstract today(tenantId: string): Promise<string>;
  abstract yearStart(tenantId: string, date: string): Promise<string>;
  abstract holidays(tenantId: string, branchId: string | null, from: string, to: string): Promise<Map<string, string>>;
  abstract balance(tenantId: string, employeeId: string, leaveTypeId: string, yearStart: string): Promise<LeaveBalanceFigures | null>;
  abstract overlaps(tenantId: string, employeeId: string, from: string, to: string): Promise<boolean>;
  /** Pending + approved days of a type in the month of `date`. */
  abstract daysInMonth(tenantId: string, employeeId: string, leaveTypeId: string, date: string): Promise<number>;
  abstract timesInService(tenantId: string, employeeId: string, leaveTypeId: string): Promise<number>;
  /** Others in the employee's department with pending / approved leave in the range. */
  abstract clashes(tenantId: string, employee: LeaveEmployee, from: string, to: string): Promise<{ name: string; fromDate: string; toDate: string; leaveType: string; status: string }[]>;

  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract approve(id: string, comment: string | null): Promise<void>;
  abstract reject(id: string, reason: string, comment: string | null, suggestAlternative: boolean): Promise<void>;
  abstract cancel(id: string, reason: string | null): Promise<void>;
  /** Decision note on a decided request (the engine's reject / approve carries only the reason). */
  abstract note(tenantId: string, id: string, data: { decisionComment?: string | null; suggestAlternative?: boolean }): Promise<void>;
}
