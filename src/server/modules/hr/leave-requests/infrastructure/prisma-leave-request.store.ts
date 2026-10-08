import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { LeaveFormOptions, LeaveRequestQuery } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeName, employeeOfUser, employeeRefs, ids, num, tenantTimezone, todayIn, unknownEmp } from '../../attendance/infrastructure/hr-refs.js';
import { LeaveRequestStore, type LeaveEmployee } from '../application/leave-request-store.js';
import { figures, holidayMap, leaveItems, leaveTypes, leaveYearStart, typeFull, typeRef } from './leave-refs.js';

type Db = Prisma.TransactionClient;
const ACTIVE = ['PENDING', 'APPROVED'];
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const addM = (d: string, n: number) => { const x = asDate(d); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

@Injectable()
export class PrismaLeaveRequestStore extends LeaveRequestStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  private async searchEmployees(db: Db, tenantId: string, s: string) {
    return (await db.employees.findMany({ where: { tenantId, OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }, select: { id: true } })).map((e) => e.id);
  }

  async list(tenantId: string, q: LeaveRequestQuery & { employeeId?: string; yearStart: string }) {
    const db = this.db();
    const s = q.search?.trim();
    const [matching, deptEmps] = await Promise.all([
      s ? this.searchEmployees(db, tenantId, s) : null,
      q.departmentId ? db.employees.findMany({ where: { tenantId, departmentId: q.departmentId }, select: { id: true } }).then((r) => r.map((e) => e.id)) : null,
    ]);
    const period = q.period ?? 'YEAR';
    const [from, to] = period === 'ALL' ? [null, null] : period === 'YEAR' ? [q.yearStart, addM(q.yearStart, 12)] : [`${period}-01`, monthEnd(period)];
    const and: Prisma.LeaveRequestsWhereInput[] = [];
    if (q.employeeId) and.push({ employeeId: q.employeeId });
    if (deptEmps) and.push({ employeeId: { in: deptEmps } });
    if (q.leaveTypeId) and.push({ leaveTypeId: q.leaveTypeId });
    if (from && to) and.push({ fromDate: { lte: asDate(to) }, toDate: { gte: asDate(from) } });
    if (s) and.push({ OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { reason: { contains: s, mode: 'insensitive' } }, { employeeId: { in: matching ?? [] } }] });
    const base: Prisma.LeaveRequestsWhereInput = { tenantId, AND: and };
    const where = { ...base, ...(q.status && q.status !== 'ALL' && { status: q.status }) };
    const [rows, total, byStatus] = await Promise.all([
      db.leaveRequests.findMany({ where, orderBy: [{ submittedAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.leaveRequests.count({ where }),
      db.leaveRequests.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    return { items: await leaveItems(db, tenantId, rows), total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) };
  }

  async get(tenantId: string, id: string) {
    const r = await this.db().leaveRequests.findFirst({ where: { tenantId, id } });
    return r ? (await leaveItems(this.db(), tenantId, [r]))[0]! : null;
  }

  async overview(tenantId: string, q: { month: string; departmentId?: string; today: string; yearStart: string; yearEnd: string }) {
    const db = this.db();
    const emps = await db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' }, ...(q.departmentId && { departmentId: q.departmentId }) }, select: { id: true } });
    const empIds = emps.map((e) => e.id);
    const mFrom = `${q.month}-01`, mTo = monthEnd(q.month);
    const [types, cal, year, pending] = await Promise.all([
      leaveTypes(db, tenantId),
      db.leaveRequests.findMany({ where: { tenantId, employeeId: { in: empIds }, status: { in: ACTIVE }, fromDate: { lte: asDate(mTo) }, toDate: { gte: asDate(mFrom) } }, orderBy: { fromDate: 'asc' } }),
      db.leaveRequests.findMany({ where: { tenantId, employeeId: { in: empIds }, status: 'APPROVED', fromDate: { gte: asDate(q.yearStart), lt: asDate(q.yearEnd) } }, select: { leaveTypeId: true, days: true } }),
      db.leaveRequests.findMany({ where: { tenantId, employeeId: { in: empIds }, status: 'PENDING' }, orderBy: { submittedAt: 'asc' }, take: 20 }),
    ]);
    const refs = await employeeRefs(db, tenantId, cal.map((c) => c.employeeId));
    const activeTypes = [...types.values()].filter((t) => !t.deletedAt && t.status === 'ACTIVE');
    const out = cal.filter((c) => c.status === 'APPROVED' && day(c.fromDate)! <= q.today && day(c.toDate)! >= q.today);
    const usage = activeTypes.map((t) => ({ leaveType: typeRef(t), days: year.filter((y) => y.leaveTypeId === t.id).reduce((n, y) => n + num(y.days), 0) }));
    const taken = usage.reduce((n, u) => n + u.days, 0);
    const unplanned = usage.filter((u) => ['SICK', 'UNPAID'].includes(u.leaveType.category)).reduce((n, u) => n + u.days, 0);
    const pendingItems = await leaveItems(db, tenantId, pending);
    return {
      yearStart: q.yearStart, yearEnd: addM(q.yearStart, 12), typesCount: activeTypes.length, today: q.today, month: q.month,
      kpis: {
        onLeaveToday: new Set(out.map((o) => o.employeeId)).size, workforce: empIds.length, pending: pendingItems.length,
        pendingHr: pendingItems.filter((p) => p.stage !== 'LINE_MANAGER').length, daysTaken: taken,
        avgPerEmployee: empIds.length ? Math.round((taken / empIds.length) * 10) / 10 : 0, unplannedPct: taken ? Math.round((unplanned / taken) * 1000) / 10 : null,
      },
      calendar: cal.map((c) => ({ id: c.id, employee: refs.get(c.employeeId)?.name ?? '?', fromDate: day(c.fromDate)!, toDate: day(c.toDate)!, status: c.status, leaveType: typeRef(types.get(c.leaveTypeId)!), duration: c.duration })),
      outToday: out.map((c) => ({ employee: refs.get(c.employeeId) ?? unknownEmp(c.employeeId), leaveType: typeRef(types.get(c.leaveTypeId)!), fromDate: day(c.fromDate)!, toDate: day(c.toDate)!, duration: c.duration })),
      usage: usage.sort((a, b) => b.days - a.days),
      pending: pendingItems,
    };
  }

  async options(tenantId: string): Promise<LeaveFormOptions> {
    const db = this.db();
    const [emps, types] = await Promise.all([
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true, departmentId: true }, orderBy: { code: 'asc' } }),
      leaveTypes(db, tenantId),
    ]);
    const depts = await db.departments.findMany({ where: { tenantId, id: { in: ids(emps.map((e) => e.departmentId)) } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return {
      departments: depts,
      employees: emps.map((e) => ({ id: e.id, code: e.code, name: employeeName(e), department: depts.find((d) => d.id === e.departmentId)?.name ?? null })),
      types: [...types.values()].filter((t) => !t.deletedAt && t.status === 'ACTIVE').map((t) => ({ ...typeRef(t), daysPerYear: t.daysPerYear.toNumber(), approvalWorkflow: t.approvalWorkflow, hrApprovalAboveDays: t.hrApprovalAboveDays?.toNumber() ?? null })),
    };
  }

  async myLeave(tenantId: string, employeeId: string, today: string, yearStart: string) {
    const db = this.db();
    const emp = (await this.employee(tenantId, employeeId))!;
    const yearEnd = addM(yearStart, 12);
    const [types, balances, rows, refs] = await Promise.all([
      leaveTypes(db, tenantId),
      db.leaveBalances.findMany({ where: { tenantId, employeeId, leaveYearStart: asDate(yearStart) } }),
      db.leaveRequests.findMany({ where: { tenantId, employeeId }, orderBy: { fromDate: 'desc' }, take: 50 }),
      employeeRefs(db, tenantId, [employeeId]),
    ]);
    const mFrom = asDate(addM(`${today.slice(0, 7)}-01`, -1)), mTo = asDate(addM(`${today.slice(0, 7)}-01`, 3));
    const team = emp.departmentId ? await db.leaveRequests.findMany({
      where: { tenantId, status: { in: ACTIVE }, fromDate: { lt: mTo }, toDate: { gte: mFrom }, employeeId: { in: (await db.employees.findMany({ where: { tenantId, departmentId: emp.departmentId, deletedAt: null }, select: { id: true } })).map((e) => e.id) } },
      orderBy: { fromDate: 'asc' },
    }) : [];
    const teamRefs = await employeeRefs(db, tenantId, team.map((t) => t.employeeId));
    const hols = await holidayMap(db, tenantId, emp.branchId, today, addM(today, 6));
    const eligible = [...types.values()].filter((t) => !t.deletedAt && t.status === 'ACTIVE' && (t.gender === 'ALL' || t.gender === emp.gender));
    const acc = (t: (typeof eligible)[number]) =>
      t.accrualMethod === 'MONTHLY' ? `Accrues ${num(t.accrualAmount) || Math.round((t.daysPerYear.toNumber() / 12) * 100) / 100} / month` : t.accrualMethod === 'UPFRONT' ? `${t.daysPerYear.toNumber()} days a year` : !t.isPaid ? 'Unpaid' : 'Credited by HR';
    const policyLines = (t: (typeof eligible)[number]) => {
      const f = typeFull(t);
      return [
        `${t.daysPerYear.toNumber()} days a year${t.accrualMethod === 'MONTHLY' ? `, accrued ${acc(t).replace('Accrues ', '')}` : ''}.`,
        f.minNoticeDays ? `Apply at least ${f.minNoticeDays} days ahead.` : '',
        f.maxConsecutiveDays ? `At most ${f.maxConsecutiveDays} consecutive days.` : '',
        f.allowHalfDay ? 'Half days allowed.' : 'Full days only.',
        f.backdateDays ? `Can be applied up to ${f.backdateDays} days after.` : '',
        t.carryForwardMode === 'CAPPED' ? `Up to ${num(t.carryForwardMax)} days carry forward.` : t.carryForwardMode === 'UNLIMITED' ? 'Unused days carry forward.' : 'Unused days lapse at year end.',
        f.sandwichRule ? 'Weekly offs and holidays between leave days count.' : 'Weekly offs and holidays in a range are not counted.',
      ].filter(Boolean);
    };
    const bt = (t: (typeof eligible)[number]) => ({ ...typeRef(t), daysPerYear: t.daysPerYear.toNumber(), accrualMethod: t.accrualMethod, accrualAmount: t.accrualAmount?.toNumber() ?? null });
    const empty = { entitled: 0, carriedIn: 0, adjusted: 0, used: 0, booked: 0, encashed: 0, lapsed: 0, balance: 0, available: 0 };
    return {
      employee: refs.get(employeeId)!, today, yearStart, yearEnd,
      balances: eligible.map((t) => { const b = balances.find((x) => x.leaveTypeId === t.id); return { leaveType: bt(t), figures: b ? figures(b) : empty, note: acc(t) }; }),
      requests: (await leaveItems(db, tenantId, rows)).map((r) => ({ ...r, waitingOn: null })),
      team: team.map((t) => ({ name: teamRefs.get(t.employeeId)?.name ?? '?', fromDate: day(t.fromDate)!, toDate: day(t.toDate)!, leaveType: types.get(t.leaveTypeId)?.name ?? 'Leave', status: t.status, me: t.employeeId === employeeId })),
      holidays: [...new Map([...hols].map(([d, n]) => [n, d])).entries()].map(([name, date]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date)),
      policy: eligible.map((t) => ({ leaveType: bt(t), lines: policyLines(t) })),
    };
  }

  private async toEmployee(id: string | null | undefined, tenantId: string): Promise<LeaveEmployee | null> {
    if (!id) return null;
    const e = await this.db().employees.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!e) return null;
    return {
      id: e.id, name: employeeName(e), branchId: e.branchId, departmentId: e.departmentId, reportingManagerId: e.reportingManagerId, appUserId: e.appUserId,
      gender: e.gender, joiningDate: day(e.joiningDate)!, confirmedOn: day(e.confirmedOn), status: e.status, weeklyOff: e.weeklyOff,
    };
  }

  async employeeOfUser(tenantId: string, userId: string) {
    const e = await employeeOfUser(this.db(), tenantId, userId);
    return this.toEmployee(e?.id, tenantId);
  }

  employee(tenantId: string, employeeId: string) {
    return this.toEmployee(employeeId, tenantId);
  }

  async manager(tenantId: string, employeeId: string) {
    const db = this.db();
    const e = await db.employees.findFirst({ where: { tenantId, id: employeeId }, select: { reportingManagerId: true } });
    if (!e?.reportingManagerId) return null;
    const m = await db.employees.findFirst({ where: { tenantId, id: e.reportingManagerId } });
    if (!m) return null;
    const u = await db.users.findFirst({ where: { tenantId, deletedAt: null, status: 'ACTIVE', OR: [{ employeeId: m.id }, ...(m.appUserId ? [{ id: m.appUserId }] : [])] }, select: { id: true } });
    return { employeeId: m.id, name: employeeName(m), userId: u?.id ?? null };
  }

  async leaveType(tenantId: string, id: string) {
    const t = await this.db().leaveTypes.findFirst({ where: { tenantId, id } });
    return t ? typeFull(t) : null;
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.db(), tenantId));
  }

  yearStart(tenantId: string, date: string) {
    return leaveYearStart(this.db(), tenantId, date);
  }

  holidays(tenantId: string, branchId: string | null, from: string, to: string) {
    return holidayMap(this.db(), tenantId, branchId, from, to);
  }

  async balance(tenantId: string, employeeId: string, leaveTypeId: string, yearStart: string) {
    const b = await this.db().leaveBalances.findFirst({ where: { tenantId, employeeId, leaveTypeId, leaveYearStart: asDate(yearStart) } });
    return b ? figures(b) : null;
  }

  async overlaps(tenantId: string, employeeId: string, from: string, to: string) {
    return (await this.db().leaveRequests.count({ where: { tenantId, employeeId, status: { in: ACTIVE }, fromDate: { lte: asDate(to) }, toDate: { gte: asDate(from) } } })) > 0;
  }

  async daysInMonth(tenantId: string, employeeId: string, leaveTypeId: string, date: string) {
    const m = date.slice(0, 7);
    const rows = await this.db().leaveRequests.findMany({ where: { tenantId, employeeId, leaveTypeId, status: { in: ACTIVE }, fromDate: { gte: asDate(`${m}-01`), lte: asDate(monthEnd(m)) } }, select: { days: true } });
    return rows.reduce((n, r) => n + num(r.days), 0);
  }

  timesInService(tenantId: string, employeeId: string, leaveTypeId: string) {
    return this.db().leaveRequests.count({ where: { tenantId, employeeId, leaveTypeId, status: { in: ACTIVE } } });
  }

  async clashes(tenantId: string, employee: LeaveEmployee, from: string, to: string) {
    if (!employee.departmentId) return [];
    const db = this.db();
    const peers = (await db.employees.findMany({ where: { tenantId, departmentId: employee.departmentId, deletedAt: null, id: { not: employee.id } }, select: { id: true } })).map((e) => e.id);
    if (!peers.length) return [];
    const rows = await db.leaveRequests.findMany({ where: { tenantId, employeeId: { in: peers }, status: { in: ACTIVE }, fromDate: { lte: asDate(to) }, toDate: { gte: asDate(from) } }, orderBy: { fromDate: 'asc' }, take: 10 });
    const [refs, types] = await Promise.all([employeeRefs(db, tenantId, rows.map((r) => r.employeeId)), leaveTypes(db, tenantId, ids(rows.map((r) => r.leaveTypeId)))]);
    return rows.map((r) => ({ name: refs.get(r.employeeId)?.name ?? '?', fromDate: day(r.fromDate)!, toDate: day(r.toDate)!, leaveType: types.get(r.leaveTypeId)?.name ?? 'Leave', status: r.status }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'leaveRequestAddUpdate', data);
  }

  async approve(id: string, comment: string | null) {
    await this.db().$queryRaw`select "HumanResources"."leaveRequestApprove"(${id}::uuid, ${comment})::text`;
  }

  async reject(id: string, reason: string, comment: string | null, suggestAlternative: boolean) {
    await this.db().$queryRaw`select "HumanResources"."leaveRequestReject"(${id}::uuid, ${reason}, ${comment}, ${suggestAlternative})::text`;
  }

  async cancel(id: string, reason: string | null) {
    await this.db().$queryRaw`select "HumanResources"."leaveRequestCancel"(${id}::uuid, ${reason})::text`;
  }

  async note(tenantId: string, id: string, data: { decisionComment?: string | null; suggestAlternative?: boolean }) {
    const d = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    if (Object.keys(d).length) await this.db().leaveRequests.updateMany({ where: { tenantId, id }, data: d });
  }
}
