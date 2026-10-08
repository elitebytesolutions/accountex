import type { Prisma } from '../../../../generated/prisma/client.js';
import type { EmpRef } from '../../../../../shared/index.js';

/** Small lookups shared by the attendance, roster, overtime and leave stores (Phases 30–31). */
export const ids = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
export const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0);
/** A Postgres `time` column (Prisma reads it as 1970-01-01T…Z) as HH:MM. */
export const hm = (d: Date | null | undefined) => (d ? d.toISOString().slice(11, 16) : null);
/** HH:MM as a Prisma `time` value. */
export const asTime = (t: string | null | undefined) => (t ? new Date(`1970-01-01T${t}:00Z`) : null);
export const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
export const employeeName = (e: { displayName: string | null; firstName: string; lastName: string | null }) => e.displayName ?? `${e.firstName} ${e.lastName ?? ''}`.trim();

type Db = Prisma.TransactionClient;

/** Employee references (code, name, department, designation, branch) by id. */
export async function employeeRefs(db: Db, tenantId: string, employeeIds: (string | null | undefined)[]): Promise<Map<string, EmpRef>> {
  const list = ids(employeeIds);
  if (!list.length) return new Map();
  const emps = await db.employees.findMany({ where: { tenantId, id: { in: list } }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true, departmentId: true, designationId: true, branchId: true } });
  const [depts, desigs, branches] = await Promise.all([
    db.departments.findMany({ where: { tenantId, id: { in: ids(emps.map((e) => e.departmentId)) } }, select: { id: true, name: true } }),
    db.designations.findMany({ where: { tenantId, id: { in: ids(emps.map((e) => e.designationId)) } }, select: { id: true, title: true } }),
    db.branches.findMany({ where: { tenantId, id: { in: ids(emps.map((e) => e.branchId)) } }, select: { id: true, name: true } }),
  ]);
  return new Map(emps.map((e) => [e.id, {
    id: e.id, code: e.code, name: employeeName(e), department: depts.find((d) => d.id === e.departmentId)?.name ?? null,
    designation: desigs.find((d) => d.id === e.designationId)?.title ?? null, branch: branches.find((b) => b.id === e.branchId)?.name ?? null,
  }]));
}
export const unknownEmp = (id: string): EmpRef => ({ id, code: '?', name: '?', department: null, designation: null, branch: null });

export async function userNames(db: Db, tenantId: string, userIds: (string | null | undefined)[]) {
  const rows = await db.users.findMany({ where: { tenantId, id: { in: ids(userIds) } }, select: { id: true, fullName: true } });
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.fullName }]));
}

/** The employee record of a signed-in user (Users.employeeId, else Employees.appUserId). */
export async function employeeOfUser(db: Db, tenantId: string, userId: string) {
  const u = await db.users.findFirst({ where: { tenantId, id: userId }, select: { employeeId: true } });
  return db.employees.findFirst({
    where: { tenantId, deletedAt: null, ...(u?.employeeId ? { id: u.employeeId } : { appUserId: userId }) },
    select: { id: true, branchId: true, departmentId: true, shiftId: true, weeklyOff: true, reportingManagerId: true, appUserId: true, status: true, gradeId: true },
  });
}

/** The company's time zone (Platform.Tenants.timezone, default Asia/Karachi). */
export async function tenantTimezone(db: Db, tenantId: string) {
  const t = await db.tenants.findFirst({ where: { id: tenantId }, select: { timezone: true } });
  return t?.timezone || 'Asia/Karachi';
}
/** Today's date (YYYY-MM-DD) in a time zone. */
export const todayIn = (tz: string, at = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
/** HH:MM of an instant in a time zone. */
export const clockIn = (tz: string, at: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
/** The UTC instant of a local wall-clock date + time in a time zone. */
export function zonedInstant(tz: string, date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .format(guess).replace(', ', 'T') + 'Z');
  return new Date(guess.getTime() - (local.getTime() - guess.getTime()));
}
