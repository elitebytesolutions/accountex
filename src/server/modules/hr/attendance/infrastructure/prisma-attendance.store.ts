import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { REGISTER_CODE, monthDays, type AttendanceOptions, type AttendanceRegisterView, type AttendanceToday, type EmpRef, type Geofence, type MyAttendanceDay, type PunchItem, type RegisterDay } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { AttendanceStore, type MeEmployee, type MyAttendanceBase } from '../application/attendance-store.js';
import { asDate, clockIn, day, employeeName, employeeOfUser, employeeRefs, hm, ids, num, tenantTimezone, todayIn, unknownEmp, zonedInstant } from './hr-refs.js';

type Db = Prisma.TransactionClient;
type RegRow = Prisma.AttendanceRegisterGetPayload<object>;
type PunchRow = Prisma.AttendancePunchesGetPayload<object>;
const PRESENTISH = ['PRESENT', 'LATE', 'WFH', 'ON_DUTY', 'HALF_DAY'];
const nextMonth = (month: string) => { const [y, m] = month.split('-').map(Number) as [number, number]; return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const OFF_DOW: Record<string, number[]> = { SUNDAY: [0], FRIDAY: [5], SATURDAY_SUNDAY: [0, 6] };
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

@Injectable()
export class PrismaAttendanceStore extends AttendanceStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  timezone(tenantId: string) {
    return tenantTimezone(this.prisma.db(), tenantId);
  }

  async employeeOf(tenantId: string, userId: string): Promise<MeEmployee | null> {
    const e = await employeeOfUser(this.prisma.db(), tenantId, userId);
    return e ? { id: e.id, branchId: e.branchId, departmentId: e.departmentId, reportingManagerId: e.reportingManagerId, status: e.status } : null;
  }

  async activeEmployees(tenantId: string, list: string[], date: string) {
    const rows = await this.prisma.db().employees.findMany({ where: { tenantId, id: { in: list }, ...this.workingOn(date, date) }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** Employees employed at some point between two dates. */
  private workingOn(from: string, to: string): Prisma.EmployeesWhereInput {
    return { deletedAt: null, joiningDate: { lte: asDate(to) }, OR: [{ exitDate: null }, { exitDate: { gte: asDate(from) } }] };
  }

  async options(tenantId: string): Promise<AttendanceOptions> {
    const db = this.prisma.db();
    const [emps, depts, branches, shifts] = await Promise.all([
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, select: { id: true }, orderBy: { code: 'asc' } }),
      db.departments.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.workShifts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' }, { startTime: 'asc' }] }),
    ]);
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    return {
      employees: emps.map((e) => refs.get(e.id)!).map((r) => ({ id: r.id, code: r.code, name: r.name, department: r.department, branch: r.branch })),
      departments: depts, branches,
      shifts: shifts.map((s) => ({ id: s.id, code: s.code, name: s.name, startTime: hm(s.startTime)!, endTime: hm(s.endTime)!, colour: s.colour, scheduledHours: num(s.scheduledHours) })),
    };
  }

  // ---------------------------------------------------------------- today
  async today(tenantId: string, date: string, tz: string, branchId: string | null): Promise<AttendanceToday> {
    const db = this.prisma.db();
    const emps = await db.employees.findMany({ where: { tenantId, ...this.workingOn(date, date), status: { not: 'EXITED' }, ...(branchId && { branchId }) }, select: { id: true, departmentId: true } });
    const empIds = emps.map((e) => e.id);
    const from = zonedInstant(tz, date, '00:00');
    const to = new Date(from.getTime() + 86_400_000);
    const [rows, punches, devices, depts, monthLate] = await Promise.all([
      db.attendanceRegister.findMany({ where: { tenantId, attDate: asDate(date), employeeId: { in: empIds } } }),
      db.attendancePunches.findMany({ where: { tenantId, employeeId: { in: empIds }, isVoid: false, punchAt: { gte: from, lt: to } }, orderBy: { punchAt: 'desc' }, take: 12 }),
      db.biometricDevices.findMany({ where: { tenantId, deletedAt: null, isActive: true, ...(branchId && { branchId }) }, select: { lastSyncAt: true } }),
      db.departments.findMany({ where: { tenantId, id: { in: ids(emps.map((e) => e.departmentId)) } }, select: { id: true, name: true } }),
      db.attendanceRegister.groupBy({ by: ['employeeId'], where: { tenantId, status: 'LATE', employeeId: { in: empIds }, attDate: { gte: asDate(`${date.slice(0, 7)}-01`), lte: asDate(date) } }, _count: { _all: true } }),
    ]);
    const days = await this.days(db, tenantId, rows);
    const refs = await employeeRefs(db, tenantId, [...empIds, ...punches.map((p) => p.employeeId)]);
    const count = (s: string[]) => rows.filter((r) => s.includes(r.status)).length;
    const lateRows = rows.filter((r) => r.status === 'LATE');
    const byDept = new Map<string, { department: string; total: number; in: number; onTime: number; late: number; leave: number; absent: number }>();
    for (const e of emps) {
      const name = depts.find((d) => d.id === e.departmentId)?.name ?? 'No department';
      const g = byDept.get(name) ?? { department: name, total: 0, in: 0, onTime: 0, late: 0, leave: 0, absent: 0 };
      const r = rows.find((x) => x.employeeId === e.id);
      g.total++;
      if (r && PRESENTISH.includes(r.status)) { g.in++; if (r.status === 'LATE') g.late++; else g.onTime++; }
      if (r?.status === 'LEAVE') g.leave++;
      if (r?.status === 'ABSENT') g.absent++;
      byDept.set(name, g);
    }
    const syncs = devices.map((d) => d.lastSyncAt).filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime());
    return {
      date, total: emps.length, devices: devices.length, lastSync: syncs[0]?.toISOString() ?? null,
      kpis: {
        present: count(PRESENTISH), absent: count(['ABSENT']), onLeave: count(['LEAVE']), late: lateRows.length, wfh: count(['WFH']),
        notYetIn: emps.filter((e) => !rows.some((r) => r.employeeId === e.id)).length,
        avgLateMinutes: lateRows.length ? Math.round(lateRows.reduce((s, r) => s + r.lateMinutes, 0) / lateRows.length) : 0,
        absentNoPunch: rows.filter((r) => r.status === 'ABSENT' && !r.attendanceRequestId).length,
      },
      byDepartment: [...byDept.values()].sort((a, b) => b.total - a.total),
      late: lateRows.sort((a, b) => b.lateMinutes - a.lateMinutes).map((r) => ({
        day: days.get(r.id)!, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), lateThisMonth: monthLate.find((m) => m.employeeId === r.employeeId)?._count._all ?? 1,
      })),
      live: await this.punchItems(db, tenantId, punches, refs),
    };
  }

  private async punchItems(db: Db, tenantId: string, punches: PunchRow[], known?: Map<string, EmpRef>): Promise<PunchItem[]> {
    const refs = known ?? await employeeRefs(db, tenantId, punches.map((p) => p.employeeId));
    const devices = await db.biometricDevices.findMany({ where: { tenantId, id: { in: ids(punches.map((p) => p.deviceId)) } }, select: { id: true, code: true, locationLabel: true } });
    return punches.map((p) => {
      const d = devices.find((x) => x.id === p.deviceId);
      return {
        id: p.id, employee: refs.get(p.employeeId ?? '') ?? unknownEmp(p.employeeId ?? ''), punchAt: p.punchAt.toISOString(), direction: p.direction, source: p.source, workMode: p.workMode,
        device: d ? `${d.code}${d.locationLabel ? ` ${d.locationLabel}` : ''}` : null, locationLabel: p.locationLabel, insideGeofence: p.insideGeofence,
        geofenceDistanceM: p.geofenceDistanceM, manualReason: p.manualReason, isVoid: p.isVoid,
      };
    });
  }

  /** Register rows as RegisterDay (shift, holiday, leave type and request names resolved). */
  private async days(db: Db, tenantId: string, rows: RegRow[]): Promise<Map<string, RegisterDay>> {
    const [shifts, hols, types, reqs] = await Promise.all([
      db.workShifts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.shiftId)) } }, select: { id: true, code: true, name: true, startTime: true, endTime: true } }),
      db.holidays.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.holidayId)) } }, select: { id: true, name: true } }),
      db.leaveTypes.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.leaveTypeId)) } }, select: { id: true, name: true } }),
      db.regularisationRequests.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.attendanceRequestId)) } }, select: { id: true, docNo: true } }),
    ]);
    return new Map(rows.map((r) => {
      const s = shifts.find((x) => x.id === r.shiftId);
      return [r.id, {
        id: r.id, employeeId: r.employeeId, date: day(r.attDate)!, status: r.status, code: REGISTER_CODE[r.status] ?? '?',
        shift: s ? { id: s.id, code: s.code, name: s.name, startTime: hm(s.startTime)!, endTime: hm(s.endTime)! } : null,
        firstIn: r.firstIn?.toISOString() ?? null, lastOut: r.lastOut?.toISOString() ?? null, lateMinutes: r.lateMinutes, earlyLeaveMinutes: r.earlyLeaveMinutes,
        workedMinutes: r.workedMinutes, overtimeMinutes: r.overtimeMinutes, payableFraction: num(r.payableFraction), lateMarkWaived: r.lateMarkWaived, isManual: r.isManual,
        manualReason: r.manualReason, locationLabel: r.locationLabel, lockedAt: r.lockedAt?.toISOString() ?? null, holiday: hols.find((h) => h.id === r.holidayId)?.name ?? null,
        leaveType: types.find((t) => t.id === r.leaveTypeId)?.name ?? null, requestDocNo: reqs.find((q) => q.id === r.attendanceRequestId)?.docNo ?? null, rowVersion: r.rowVersion,
      }];
    }));
  }

  // ---------------------------------------------------------------- register
  async register(tenantId: string, q: { month: string; search?: string; department?: string; branch?: string }): Promise<AttendanceRegisterView> {
    const db = this.prisma.db();
    const days = monthDays(q.month);
    const first = days[0]!, last = days.at(-1)!;
    const s = q.search?.trim();
    const emps = await db.employees.findMany({
      where: {
        tenantId, ...this.workingOn(first, last), ...(q.department && { departmentId: q.department }), ...(q.branch && { branchId: q.branch }),
        ...(s && { AND: [{ OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }] }),
      },
      select: { id: true }, orderBy: { code: 'asc' },
    });
    const [rows, def, lockedRows] = await Promise.all([
      db.attendanceRegister.findMany({ where: { tenantId, employeeId: { in: emps.map((e) => e.id) }, attDate: { gte: asDate(first), lte: asDate(last) } } }),
      db.workShifts.findFirst({ where: { tenantId, isDefault: true, deletedAt: null }, select: { weeklyOff: true } }),
      db.attendanceRegister.findMany({ where: { tenantId, lockedAt: { not: null }, attDate: { gte: asDate(first), lte: asDate(last) } }, select: { lockedAt: true, payrollRunId: true }, orderBy: { lockedAt: 'desc' }, take: 1 }),
    ]);
    const [map, refs] = await Promise.all([this.days(db, tenantId, rows), employeeRefs(db, tenantId, emps.map((e) => e.id))]);
    const offs = OFF_DOW[def?.weeklyOff ?? 'SUNDAY'] ?? [];
    const weeklyOffs = days.filter((d) => offs.includes(dow(d))).length;
    const out = emps.map((e) => {
      const mine = rows.filter((r) => r.employeeId === e.id);
      return {
        employee: refs.get(e.id)!, days: Object.fromEntries(mine.map((r) => [day(r.attDate)!, map.get(r.id)!])),
        payable: mine.reduce((sum, r) => sum + num(r.payableFraction), 0), present: mine.filter((r) => PRESENTISH.includes(r.status)).length,
        absent: mine.filter((r) => r.status === 'ABSENT').length, late: mine.filter((r) => r.status === 'LATE').length, leave: mine.filter((r) => r.status === 'LEAVE').length,
        manual: mine.filter((r) => r.isManual || r.attendanceRequestId).length,
      };
    });
    const worked = rows.filter((r) => PRESENTISH.includes(r.status)).length, absent = rows.filter((r) => r.status === 'ABSENT').length;
    const l = lockedRows[0];
    return {
      month: q.month, days, workingDays: days.length - weeklyOffs, weeklyOffs, total: emps.length,
      locked: l ? { lockedAt: l.lockedAt!.toISOString(), payrollRunId: l.payrollRunId } : null,
      rows: out,
      kpis: { avgAttendance: worked + absent ? Math.round((worked / (worked + absent)) * 1000) / 10 : null, absentDays: absent, lateMarks: rows.filter((r) => r.status === 'LATE').length, manualEntries: rows.filter((r) => r.isManual || r.attendanceRequestId).length },
    };
  }

  // ---------------------------------------------------------------- my attendance
  async my(tenantId: string, employeeId: string, month: string, tz: string): Promise<MyAttendanceBase> {
    const db = this.prisma.db();
    const today = todayIn(tz);
    const days = monthDays(month);
    const first = days[0]!, last = days.at(-1)!;
    const emp = (await db.employees.findFirst({ where: { tenantId, id: employeeId }, select: { shiftId: true, weeklyOff: true, branchId: true } }))!;
    const roster = await db.shiftRosters.findFirst({ where: { tenantId, employeeId, rosterDate: asDate(today), isPublished: true } });
    const shift = await db.workShifts.findFirst({
      where: { tenantId, deletedAt: null, ...(roster?.shiftId ? { id: roster.shiftId } : emp.shiftId ? { id: emp.shiftId } : { isDefault: true }) },
    });
    const from = zonedInstant(tz, today, '00:00');
    const sevenAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    const [punches, rows, pend, hols, last7] = await Promise.all([
      db.attendancePunches.findMany({ where: { tenantId, employeeId, isVoid: false, punchAt: { gte: from, lt: new Date(from.getTime() + 86_400_000) } }, orderBy: { punchAt: 'asc' } }),
      db.attendanceRegister.findMany({ where: { tenantId, employeeId, attDate: { gte: asDate(first), lte: asDate(last) } } }),
      db.regularisationRequests.findMany({ where: { tenantId, employeeId, status: 'PENDING', attDate: { gte: asDate(first), lte: asDate(last) } }, select: { attDate: true, docNo: true } }),
      db.holidays.findMany({ where: { tenantId, deletedAt: null, status: { not: 'CANCELLED' }, holidayType: { in: ['PUBLIC', 'COMPANY'] }, fromDate: { lte: asDate(last) }, toDate: { gte: asDate(first) } }, select: { name: true, fromDate: true, toDate: true } }),
      db.attendanceRegister.findMany({ where: { tenantId, employeeId, attDate: { gte: asDate(sevenAgo), lt: asDate(today) }, status: { in: PRESENTISH } }, orderBy: { attDate: 'asc' }, select: { attDate: true, workedMinutes: true } }),
    ]);
    const map = await this.days(db, tenantId, rows);
    const types = new Map((await db.leaveTypes.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.leaveTypeId)) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    const offs = OFF_DOW[emp.weeklyOff ?? shift?.weeklyOff ?? 'SUNDAY'] ?? [];
    const firstPunches = await db.attendancePunches.findMany({ where: { tenantId, employeeId, isVoid: false, punchAt: { gte: zonedInstant(tz, first, '00:00'), lt: zonedInstant(tz, last, '23:59') } }, orderBy: { punchAt: 'asc' }, select: { punchAt: true, source: true } });
    const cal: MyAttendanceDay[] = days.map((d) => {
      const r = rows.find((x) => day(x.attDate) === d);
      const h = hols.find((x) => day(x.fromDate)! <= d && day(x.toDate)! >= d);
      const src = firstPunches.find((p) => todayIn(tz, p.punchAt) === d)?.source ?? null;
      return {
        date: d, status: r?.status ?? null, code: r ? REGISTER_CODE[r.status] ?? null : null, firstIn: r?.firstIn?.toISOString() ?? null, lastOut: r?.lastOut?.toISOString() ?? null,
        workedMinutes: r?.workedMinutes ?? 0, overtimeMinutes: r?.overtimeMinutes ?? 0, lateMinutes: r?.lateMinutes ?? 0, location: r?.locationLabel ?? null,
        source: src === 'ESS_GEO' ? 'Self-service · geofence' : src === 'DEVICE' ? 'Biometric device' : src === 'MANUAL' ? 'Manual / regularised' : null,
        holiday: h?.name ?? null, leave: r?.leaveTypeId ? types.get(r.leaveTypeId) ?? 'Leave' : null, pending: pend.find((p) => day(p.attDate) === d)?.docNo ?? null,
        weeklyOff: r ? r.status === 'WEEKLY_OFF' : offs.includes(dow(d)),
      };
    });
    const worked = rows.filter((r) => PRESENTISH.includes(r.status));
    const ins = worked.map((r) => r.firstIn).filter((x): x is Date => !!x).map((x) => { const [hh, mm] = clockIn(tz, x).split(':').map(Number) as [number, number]; return hh * 60 + mm; });
    const avg = ins.length ? Math.round(ins.reduce((s, x) => s + x, 0) / ins.length) : null;
    const lastPunch = punches.at(-1);
    const firstIn = punches.find((p) => p.direction !== 'OUT')?.punchAt ?? null;
    const lastOut = [...punches].reverse().find((p) => p.direction === 'OUT')?.punchAt ?? null;
    const fence = await this.geofence(tenantId, employeeId);
    const refs = await employeeRefs(db, tenantId, [employeeId]);
    const workingDays = days.filter((d) => d <= today && !offs.includes(dow(d)) && !hols.some((x) => day(x.fromDate)! <= d && day(x.toDate)! >= d)).length;
    void map;
    return {
      employee: refs.get(employeeId)!, today, timezone: tz,
      shift: shift ? { code: shift.code, name: shift.name, startTime: hm(shift.startTime)!, endTime: hm(shift.endTime)!, graceMinutes: shift.graceMinutes, scheduledHours: num(shift.scheduledHours) } : null,
      geofence: fence, punches: await this.punchItems(db, tenantId, punches, refs), firstIn: firstIn?.toISOString() ?? null, lastOut: lastOut?.toISOString() ?? null,
      state: !lastPunch ? 'out' : lastPunch.direction === 'OUT' ? 'done' : 'in',
      month, days: cal,
      stats: {
        onTimePct: worked.length ? Math.round((worked.filter((r) => r.status !== 'LATE').length / worked.length) * 100) : null, present: worked.length, workingDays,
        lateMarks: rows.filter((r) => r.status === 'LATE').length, avgCheckIn: avg === null ? null : `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`,
        overtimeMinutes: rows.reduce((s, r) => s + r.overtimeMinutes, 0),
      },
      last7: last7.map((r) => ({ date: day(r.attDate)!, minutes: r.workedMinutes })),
    };
  }

  /** The branch geofence: HR branch settings first, else the branch's own coordinates (Q30-4). */
  async geofence(tenantId: string, employeeId: string): Promise<Geofence> {
    const db = this.prisma.db();
    const e = await db.employees.findFirst({ where: { tenantId, id: employeeId }, select: { branchId: true } });
    if (!e?.branchId) return null;
    const [hr, b] = await Promise.all([
      db.branchHrSettings.findFirst({ where: { tenantId, branchId: e.branchId } }),
      db.branches.findFirst({ where: { tenantId, id: e.branchId }, select: { name: true, latitude: true, longitude: true, geofenceRadiusM: true } }),
    ]);
    if (hr?.geofenceLat && hr.geofenceLng) return { branch: b?.name ?? 'Branch', latitude: num(hr.geofenceLat), longitude: num(hr.geofenceLng), radiusM: hr.geofenceRadiusM ?? 150 };
    if (b?.latitude && b.longitude) return { branch: b.name, latitude: num(b.latitude), longitude: num(b.longitude), radiusM: b.geofenceRadiusM ?? 150 };
    return null;
  }

  async managerName(tenantId: string, employeeId: string) {
    const db = this.prisma.db();
    const e = await db.employees.findFirst({ where: { tenantId, id: employeeId }, select: { reportingManagerId: true } });
    if (!e?.reportingManagerId) return null;
    const m = await db.employees.findFirst({ where: { tenantId, id: e.reportingManagerId }, select: { displayName: true, firstName: true, lastName: true } });
    return m ? employeeName(m) : null;
  }

  // ---------------------------------------------------------------- writes
  async addPunch(data: Record<string, unknown>) {
    const rows = await this.prisma.db().$queryRawUnsafe<{ id: string }[]>('select "HumanResources"."attendancePunchAdd"($1::jsonb)::text as id', JSON.stringify(data));
    return rows[0]!.id;
  }

  async build(tenantId: string, date: string, employeeId: string | null) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`select "HumanResources"."attendanceRegisterBuild"(${tenantId}::uuid, ${date}::date, ${employeeId}::uuid) as n`;
    return Number(rows[0]?.n ?? 0);
  }

  async monthLocked(tenantId: string, date: string) {
    const n = await this.prisma.db().attendanceRegister.count({ where: { tenantId, lockedAt: { not: null }, attDate: { gte: asDate(`${date.slice(0, 7)}-01`), lt: asDate(`${nextMonth(date.slice(0, 7))}-01`) } } });
    return n > 0;
  }

  async lock(month: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`select "HumanResources"."attendanceRegisterLock"(${month}::date) as n`;
    return Number(rows[0]?.n ?? 0);
  }

  async unlock(month: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`select "HumanResources"."attendanceRegisterUnlock"(${month}::date) as n`;
    return Number(rows[0]?.n ?? 0);
  }

  async day(tenantId: string, id: string) {
    const db = this.prisma.db();
    const r = await db.attendanceRegister.findFirst({ where: { tenantId, id } });
    return r ? (await this.days(db, tenantId, [r])).get(r.id)! : null;
  }

  async manualDay(tenantId: string, d: { employeeId: string; date: string; status: string; firstIn: Date | null; lastOut: Date | null; reason: string; locationLabel: string | null }) {
    const pay = d.status === 'ABSENT' ? 0 : d.status === 'HALF_DAY' ? 0.5 : 1;
    const data = {
      status: d.status, firstIn: d.firstIn, lastOut: d.lastOut, payableFraction: pay, isManual: true, manualReason: d.reason, locationLabel: d.locationLabel,
      lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, lateMarkWaived: false, lateWaivedByUserId: null, leaveRequestId: null, leaveTypeId: null, holidayId: null,
      workedMinutes: d.firstIn && d.lastOut ? Math.min(1440, Math.round((d.lastOut.getTime() - d.firstIn.getTime()) / 60_000)) : 0,
    };
    await this.prisma.db().attendanceRegister.upsert({
      where: { tenantId_employeeId_attDate: { tenantId, employeeId: d.employeeId, attDate: asDate(d.date) } },
      create: { tenantId, employeeId: d.employeeId, attDate: asDate(d.date), ...data },
      update: data,
    });
  }

  async waive(tenantId: string, id: string, rowVersion: number, userId: string, reason: string) {
    const { count } = await this.prisma.db().attendanceRegister.updateMany({
      where: { tenantId, id, rowVersion, lockedAt: null },
      data: { status: 'PRESENT', lateMarkWaived: true, lateWaivedByUserId: userId, isManual: true, manualReason: reason },
    });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this day. Reload and try again.');
  }
}
