import type { AttendanceOptions, AttendanceRegisterView, AttendanceToday, Geofence, MyAttendance, RegisterDay } from '../../../../../shared/index.js';

export type MeEmployee = { id: string; branchId: string | null; departmentId: string | null; reportingManagerId: string | null; status: string };
export type MyAttendanceBase = Omit<MyAttendance, 'approver' | 'locked'>;

export abstract class AttendanceStore {
  abstract timezone(tenantId: string): Promise<string>;
  /** The employee record of a signed-in user (null when the user is not an employee). */
  abstract employeeOf(tenantId: string, userId: string): Promise<MeEmployee | null>;
  /** Of these ids, the employees working on that date (joined, not exited, not deleted). */
  abstract activeEmployees(tenantId: string, ids: string[], date: string): Promise<string[]>;
  abstract options(tenantId: string): Promise<AttendanceOptions>;
  abstract today(tenantId: string, date: string, tz: string, branchId: string | null): Promise<AttendanceToday>;
  abstract register(tenantId: string, q: { month: string; search?: string; department?: string; branch?: string }): Promise<AttendanceRegisterView>;
  abstract my(tenantId: string, employeeId: string, month: string, tz: string): Promise<MyAttendanceBase>;
  abstract geofence(tenantId: string, employeeId: string): Promise<Geofence>;
  /** The line manager's name (who regularisation requests go to first). */
  abstract managerName(tenantId: string, employeeId: string): Promise<string | null>;
  /** HumanResources.attendancePunchAdd (refused in a locked month). */
  abstract addPunch(data: Record<string, unknown>): Promise<string>;
  /** HumanResources.attendanceRegisterBuild for one day (one employee or all); returns the rows written. */
  abstract build(tenantId: string, date: string, employeeId: string | null): Promise<number>;
  abstract monthLocked(tenantId: string, date: string): Promise<boolean>;
  abstract lock(month: string): Promise<number>;
  abstract unlock(month: string): Promise<number>;
  abstract day(tenantId: string, id: string): Promise<RegisterDay | null>;
  /** A day HR marked by hand (absent, half day, WFH, on duty): a manual row the build never overwrites. */
  abstract manualDay(tenantId: string, d: { employeeId: string; date: string; status: string; firstIn: Date | null; lastOut: Date | null; reason: string; locationLabel: string | null }): Promise<void>;
  /** Waives a late mark (the day becomes a manual present day). */
  abstract waive(tenantId: string, id: string, rowVersion: number, userId: string, reason: string): Promise<void>;
}
