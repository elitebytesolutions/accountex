import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { weekDays, type RosterCell, type RosterWeek } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeName, employeeOfUser, employeeRefs, hm, ids, num, tenantTimezone, todayIn, unknownEmp, userNames, zonedInstant } from '../../attendance/infrastructure/hr-refs.js';
import { RosterStore, type Me, type OpenShiftBase, type Planned, type SwapBase } from '../application/roster-store.js';

type SwapRow = Prisma.ShiftSwapRequestsGetPayload<object>;
type OpenRow = Prisma.OpenShiftsGetPayload<object>;
const OFF_DOW: Record<string, number[]> = { SUNDAY: [0], FRIDAY: [5], SATURDAY_SUNDAY: [0, 6] };

@Injectable()
export class PrismaRosterStore extends RosterStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.prisma.db(), tenantId));
  }

  async employeeOf(tenantId: string, userId: string): Promise<Me | null> {
    const e = await employeeOfUser(this.prisma.db(), tenantId, userId);
    return e ? { id: e.id, branchId: e.branchId, departmentId: e.departmentId, appUserId: e.appUserId ?? userId } : null;
  }

  async employee(tenantId: string, id: string): Promise<Me | null> {
    const db = this.prisma.db();
    const e = await db.employees.findFirst({ where: { tenantId, id }, select: { id: true, branchId: true, departmentId: true, appUserId: true } });
    if (!e) return null;
    const u = e.appUserId ?? (await db.users.findFirst({ where: { tenantId, employeeId: id }, select: { id: true } }))?.id ?? null;
    return { ...e, appUserId: u };
  }

  async activeEmployees(tenantId: string, list: string[], date: string) {
    const rows = await this.prisma.db().employees.findMany({ where: { tenantId, id: { in: list }, deletedAt: null, joiningDate: { lte: asDate(date) }, OR: [{ exitDate: null }, { exitDate: { gte: asDate(date) } }] }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async activeShifts(tenantId: string) {
    const rows = await this.prisma.db().workShifts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, scheduledHours: true } });
    return rows.map((r) => ({ id: r.id, scheduledHours: num(r.scheduledHours) }));
  }

  async week(tenantId: string, monday: string, q: { department?: string; branch?: string; employeeIds?: string[] }): Promise<RosterWeek> {
    const db = this.prisma.db();
    const days = weekDays(monday);
    const emps = await db.employees.findMany({
      where: {
        tenantId, deletedAt: null, joiningDate: { lte: asDate(days[6]!) }, OR: [{ exitDate: null }, { exitDate: { gte: asDate(days[0]!) } }],
        ...(q.department && { departmentId: q.department }), ...(q.branch && { branchId: q.branch }), ...(q.employeeIds && { id: { in: q.employeeIds } }),
      },
      select: { id: true }, orderBy: { code: 'asc' }, take: 200,
    });
    const [shifts, refs, cells] = await Promise.all([
      db.workShifts.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { startTime: 'asc' }] }),
      employeeRefs(db, tenantId, emps.map((e) => e.id)),
      this.cells(tenantId, emps.map((e) => e.id), days[0]!, days[6]!),
    ]);
    const hours = new Map(shifts.map((s) => [s.id, num(s.scheduledHours)]));
    const rows = emps.map((e) => {
      const c = Object.fromEntries(days.map((d) => [d, cells.get(`${e.id}|${d}`)]).filter(([, x]) => x)) as Record<string, RosterCell>;
      return { employee: refs.get(e.id)!, cells: c, hours: Object.values(c).reduce((s, x) => s + (x.entryType === 'SHIFT' && x.shiftId ? hours.get(x.shiftId) ?? 0 : 0), 0) };
    });
    const all = [...cells.values()];
    return {
      weekStart: monday, days,
      shifts: shifts.filter((s) => s.status === 'ACTIVE').map((s) => ({ id: s.id, code: s.code, name: s.name, startTime: hm(s.startTime)!, endTime: hm(s.endTime)!, colour: s.colour, scheduledHours: num(s.scheduledHours) })),
      rows, unpublished: all.filter((c) => !c.isPublished).length, published: all.filter((c) => c.isPublished).length,
      coverage: Object.fromEntries(days.map((d) => [d, rows.filter((r) => r.cells[d]?.entryType === 'SHIFT').length])),
    };
  }

  async cells(tenantId: string, employeeIds: string[], from: string, to: string) {
    const rows = await this.prisma.db().shiftRosters.findMany({ where: { tenantId, employeeId: { in: employeeIds }, rosterDate: { gte: asDate(from), lte: asDate(to) } } });
    return new Map<string, RosterCell>(rows.map((r) => [`${r.employeeId}|${day(r.rosterDate)}`, { id: r.id, entryType: r.entryType, shiftId: r.shiftId, isPublished: r.isPublished, remarks: r.remarks, rowVersion: r.rowVersion }]));
  }

  saveEntry(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'shiftRosterEntryAddUpdate', data);
  }

  async deleteEntry(tenantId: string, id: string) {
    await this.prisma.db().shiftRosters.deleteMany({ where: { tenantId, id, isPublished: false } });
  }

  async publish(from: string, to: string, employeeIds: string[] | null) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`select "HumanResources"."shiftRosterPublish"(${from}::date, ${to}::date, ${employeeIds}::uuid[]) as n`;
    return Number(rows[0]?.n ?? 0);
  }

  async planned(tenantId: string, employeeId: string, date: string): Promise<Planned> {
    const db = this.prisma.db();
    const r = await db.shiftRosters.findFirst({ where: { tenantId, employeeId, rosterDate: asDate(date), isPublished: true } });
    if (r) return { entryType: r.entryType as Planned['entryType'], shiftId: r.shiftId, published: true };
    const e = await db.employees.findFirst({ where: { tenantId, id: employeeId }, select: { shiftId: true, weeklyOff: true } });
    const s = await db.workShifts.findFirst({ where: { tenantId, deletedAt: null, ...(e?.shiftId ? { id: e.shiftId } : { isDefault: true }) }, select: { id: true, weeklyOff: true } });
    const off = OFF_DOW[e?.weeklyOff ?? s?.weeklyOff ?? 'SUNDAY'] ?? [];
    if (off.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) return { entryType: 'OFF', shiftId: null, published: false };
    return { entryType: 'SHIFT', shiftId: s?.id ?? null, published: false };
  }

  // ---------------------------------------------------------------- swaps
  async swaps(tenantId: string, q: { status?: string; employeeId?: string; counterpartId?: string; ids?: string[] }) {
    const rows = await this.prisma.db().shiftSwapRequests.findMany({
      where: { tenantId, ...(q.status && q.status !== 'ALL' && { status: q.status }), ...(q.employeeId && { requesterEmployeeId: q.employeeId }), ...(q.counterpartId && { counterpartEmployeeId: q.counterpartId }), ...(q.ids && { id: { in: q.ids } }) },
      orderBy: [{ createdAt: 'desc' }], take: 200,
    });
    return this.mapSwaps(tenantId, rows);
  }

  async swap(tenantId: string, id: string) {
    const r = await this.prisma.db().shiftSwapRequests.findFirst({ where: { tenantId, id } });
    return r ? (await this.mapSwaps(tenantId, [r]))[0]! : null;
  }

  private async mapSwaps(tenantId: string, rows: SwapRow[]): Promise<SwapBase[]> {
    const db = this.prisma.db();
    const [refs, users, shifts] = await Promise.all([
      employeeRefs(db, tenantId, rows.flatMap((r) => [r.requesterEmployeeId, r.counterpartEmployeeId])),
      userNames(db, tenantId, rows.map((r) => r.decidedByUserId)),
      db.workShifts.findMany({ where: { tenantId, id: { in: ids(rows.flatMap((r) => [r.requesterShiftId, r.counterpartShiftId])) } }, select: { id: true, code: true, name: true, startTime: true, endTime: true } }),
    ]);
    const sh = (id: string | null) => { const s = shifts.find((x) => x.id === id); return s ? { id: s.id, code: s.code, name: s.name, startTime: hm(s.startTime)!, endTime: hm(s.endTime)! } : null; };
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, requester: refs.get(r.requesterEmployeeId) ?? unknownEmp(r.requesterEmployeeId), counterpart: refs.get(r.counterpartEmployeeId) ?? unknownEmp(r.counterpartEmployeeId),
      swapDate: day(r.swapDate)!, swapMode: r.swapMode, requesterShift: sh(r.requesterShiftId), counterpartShift: sh(r.counterpartShiftId), reasonCategory: r.reasonCategory, reason: r.reason,
      noteToCounterpart: r.noteToCounterpart, status: r.status, acceptedAt: r.acceptedAt?.toISOString() ?? null, decidedBy: users.get(r.decidedByUserId ?? '') ?? null,
      decidedAt: r.decidedAt?.toISOString() ?? null, decisionReason: r.decisionReason, createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  saveSwap(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'shiftSwapRequestAddUpdate', data);
  }

  async setSwap(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().shiftSwapRequests.updateMany({ where: { tenantId, id }, data });
  }

  async approveSwap(id: string, comment: string | null) {
    await this.prisma.db().$queryRaw`select "EmployeeSelfService"."shiftSwapRequestApprove"(${id}::uuid, ${comment})::text`;
  }

  async rejectSwap(id: string, reason: string) {
    await this.prisma.db().$queryRaw`select "EmployeeSelfService"."shiftSwapRequestReject"(${id}::uuid, ${reason})::text`;
  }

  async swapsThisMonth(tenantId: string, employeeId: string, month: string) {
    const from = asDate(`${month}-01`);
    return this.prisma.db().shiftSwapRequests.count({ where: { tenantId, requesterEmployeeId: employeeId, status: { in: ['REQUESTED', 'ACCEPTED', 'APPROVED'] }, swapDate: { gte: from, lt: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)) } } });
  }

  // ---------------------------------------------------------------- open shifts
  async openShifts(tenantId: string, q: { status?: string; from?: string; branchId?: string | null; departmentId?: string | null; forEmployee?: boolean }) {
    const rows = await this.prisma.db().openShifts.findMany({
      where: {
        tenantId, ...(q.status && q.status !== 'ALL' && { status: q.status }), ...(q.from && { shiftDate: { gte: asDate(q.from) } }),
        ...(q.forEmployee && { AND: [{ OR: [{ branchId: null }, { branchId: q.branchId ?? undefined }] }, { OR: [{ departmentId: null }, { departmentId: q.departmentId ?? undefined }] }] }),
      },
      orderBy: [{ shiftDate: q.forEmployee ? 'asc' : 'desc' }, { code: 'asc' }], take: 200,
    });
    return this.mapOpen(tenantId, rows);
  }

  async openShift(tenantId: string, id: string) {
    const r = await this.prisma.db().openShifts.findFirst({ where: { tenantId, id } });
    return r ? (await this.mapOpen(tenantId, [r]))[0]! : null;
  }

  private async mapOpen(tenantId: string, rows: OpenRow[]): Promise<OpenShiftBase[]> {
    const db = this.prisma.db();
    const [shifts, branches, depts, claims] = await Promise.all([
      db.workShifts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.shiftId)) } } }),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, name: true } }),
      db.departments.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.departmentId)) } }, select: { id: true, name: true } }),
      db.openShiftClaims.findMany({ where: { tenantId, openShiftId: { in: rows.map((r) => r.id) } }, orderBy: { claimedAt: 'asc' } }),
    ]);
    const refs = await employeeRefs(db, tenantId, claims.map((c) => c.employeeId));
    return rows.map((r) => {
      const s = shifts.find((x) => x.id === r.shiftId)!;
      const mine = claims.filter((c) => c.openShiftId === r.id);
      return {
        id: r.id, code: r.code, shiftDate: day(r.shiftDate)!, shift: { id: s.id, code: s.code, name: s.name, startTime: hm(s.startTime)!, endTime: hm(s.endTime)!, scheduledHours: num(s.scheduledHours) },
        branch: branches.find((b) => b.id === r.branchId) ?? null, department: depts.find((d) => d.id === r.departmentId) ?? null, title: r.title, perkText: r.perkText,
        allowanceAmount: r.allowanceAmount ? num(r.allowanceAmount) : null, overtimeMultiplier: r.overtimeMultiplier ? num(r.overtimeMultiplier) : null, slotsTotal: r.slotsTotal,
        slotsTaken: mine.filter((c) => c.status === 'REQUESTED' || c.status === 'CONFIRMED').length, status: r.status, rowVersion: r.rowVersion,
        claims: mine.map((c) => ({ id: c.id, employee: refs.get(c.employeeId) ?? unknownEmp(c.employeeId), claimedAt: c.claimedAt.toISOString(), status: c.status, decidedAt: c.decidedAt?.toISOString() ?? null, rowVersion: c.rowVersion })),
      };
    });
  }

  async nextOpenCode(tenantId: string) {
    const rows = await this.prisma.db().openShifts.findMany({ where: { tenantId }, select: { code: true } });
    const max = rows.reduce((m, r) => Math.max(m, Number(/^OS-(\d+)$/.exec(r.code)?.[1] ?? 0)), 0);
    return `OS-${String(max + 1).padStart(3, '0')}`;
  }

  saveOpen(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'openShiftAddUpdate', data);
  }

  async cancelOpen(id: string, reason: string | null) {
    await this.prisma.db().$queryRaw`select "EmployeeSelfService"."openShiftCancel"(${id}::uuid, ${reason})::text`;
  }

  async claimOpen(openShiftId: string, employeeId: string) {
    const rows = await this.prisma.db().$queryRaw<{ id: string }[]>`select "EmployeeSelfService"."openShiftClaim"(${openShiftId}::uuid, ${employeeId}::uuid)::text as id`;
    return rows[0]!.id;
  }

  async decideClaim(claimId: string, confirm: boolean) {
    await this.prisma.db().$queryRaw`select "EmployeeSelfService"."openShiftClaimDecide"(${claimId}::uuid, ${confirm})::text`;
  }

  async claim(tenantId: string, id: string) {
    return this.prisma.db().openShiftClaims.findFirst({ where: { tenantId, id }, select: { id: true, openShiftId: true, employeeId: true, status: true } });
  }

  async setClaim(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().openShiftClaims.updateMany({ where: { tenantId, id }, data });
  }

  async worked(tenantId: string, employeeId: string, from: string, to: string) {
    const r = await this.prisma.db().attendanceRegister.aggregate({ where: { tenantId, employeeId, attDate: { gte: asDate(from), lte: asDate(to) } }, _sum: { workedMinutes: true, overtimeMinutes: true } });
    return { minutes: r._sum.workedMinutes ?? 0, overtime: r._sum.overtimeMinutes ?? 0 };
  }

  async firstInToday(tenantId: string, employeeId: string) {
    const db = this.prisma.db();
    const tz = await tenantTimezone(db, tenantId);
    const from = zonedInstant(tz, todayIn(tz), '00:00');
    const p = await db.attendancePunches.findFirst({ where: { tenantId, employeeId, isVoid: false, punchAt: { gte: from, lt: new Date(from.getTime() + 86_400_000) } }, orderBy: { punchAt: 'asc' } });
    return p?.punchAt.toISOString() ?? null;
  }

  async shift(tenantId: string, id: string) {
    const s = await this.prisma.db().workShifts.findFirst({ where: { tenantId, id } });
    return s ? { code: s.code, name: s.name, startTime: hm(s.startTime)!, endTime: hm(s.endTime)!, breakStart: hm(s.breakStart), breakEnd: hm(s.breakEnd) } : null;
  }

  async managerName(tenantId: string, employeeId: string) {
    const db = this.prisma.db();
    const e = await db.employees.findFirst({ where: { tenantId, id: employeeId }, select: { reportingManagerId: true } });
    const m = e?.reportingManagerId ? await db.employees.findFirst({ where: { tenantId, id: e.reportingManagerId }, select: { displayName: true, firstName: true, lastName: true } }) : null;
    return m ? employeeName(m) : null;
  }
}

