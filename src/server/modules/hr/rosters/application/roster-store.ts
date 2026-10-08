import type { OpenShiftItem, RosterCell, RosterWeek, SwapItem } from '../../../../../shared/index.js';

export type SwapBase = Omit<SwapItem, 'approval' | 'canAct'>;
export type OpenShiftBase = Omit<OpenShiftItem, 'myClaim'>;
export type Planned = { entryType: 'SHIFT' | 'OFF' | 'LEAVE'; shiftId: string | null; published: boolean };
export type Me = { id: string; branchId: string | null; departmentId: string | null; appUserId: string | null };

export abstract class RosterStore {
  abstract today(tenantId: string): Promise<string>;
  abstract employeeOf(tenantId: string, userId: string): Promise<Me | null>;
  abstract employee(tenantId: string, id: string): Promise<Me | null>;
  /** Of these ids, employees working on the date. */
  abstract activeEmployees(tenantId: string, ids: string[], date: string): Promise<string[]>;
  abstract activeShifts(tenantId: string): Promise<{ id: string; scheduledHours: number }[]>;
  abstract week(tenantId: string, monday: string, q: { department?: string; branch?: string; employeeIds?: string[] }): Promise<RosterWeek>;
  abstract cells(tenantId: string, employeeIds: string[], from: string, to: string): Promise<Map<string, RosterCell>>;
  abstract saveEntry(data: Record<string, unknown>): Promise<string>;
  abstract deleteEntry(tenantId: string, id: string): Promise<void>;
  abstract publish(from: string, to: string, employeeIds: string[] | null): Promise<number>;
  /** The day's planned shift: the published roster, else the employee's shift (or the default) unless it is the weekly off. */
  abstract planned(tenantId: string, employeeId: string, date: string): Promise<Planned>;

  abstract swaps(tenantId: string, q: { status?: string; employeeId?: string; counterpartId?: string; ids?: string[] }): Promise<SwapBase[]>;
  abstract swap(tenantId: string, id: string): Promise<SwapBase | null>;
  abstract saveSwap(data: Record<string, unknown>): Promise<string>;
  abstract setSwap(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract approveSwap(id: string, comment: string | null): Promise<void>;
  abstract rejectSwap(id: string, reason: string): Promise<void>;
  abstract swapsThisMonth(tenantId: string, employeeId: string, month: string): Promise<number>;

  abstract openShifts(tenantId: string, q: { status?: string; from?: string; branchId?: string | null; departmentId?: string | null; forEmployee?: boolean }): Promise<OpenShiftBase[]>;
  abstract openShift(tenantId: string, id: string): Promise<OpenShiftBase | null>;
  abstract nextOpenCode(tenantId: string): Promise<string>;
  abstract saveOpen(data: Record<string, unknown>): Promise<string>;
  abstract cancelOpen(id: string, reason: string | null): Promise<void>;
  abstract claimOpen(openShiftId: string, employeeId: string): Promise<string>;
  abstract decideClaim(claimId: string, confirm: boolean): Promise<void>;
  abstract claim(tenantId: string, id: string): Promise<{ id: string; openShiftId: string; employeeId: string; status: string } | null>;
  abstract setClaim(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  /** Hours worked and overtime this week (register) for My Profile › Shifts. */
  abstract worked(tenantId: string, employeeId: string, from: string, to: string): Promise<{ minutes: number; overtime: number }>;
  abstract firstInToday(tenantId: string, employeeId: string): Promise<string | null>;
  abstract shift(tenantId: string, id: string): Promise<{ code: string; name: string; startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null } | null>;
  abstract managerName(tenantId: string, employeeId: string): Promise<string | null>;
}
