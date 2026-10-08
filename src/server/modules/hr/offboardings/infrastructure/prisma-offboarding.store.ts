import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { OffboardingBoard, OffboardingItem } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeName, employeeRefs, ids, tenantTimezone, todayIn, unknownEmp, userNames } from '../../attendance/infrastructure/hr-refs.js';
import { leaveYearStart } from '../../leave-requests/infrastructure/leave-refs.js';
import { OffboardingStore } from '../application/offboarding-store.js';

type Db = Prisma.TransactionClient;
type Row = Prisma.OffboardingsGetPayload<object>;
const OPEN = ['SERVING_NOTICE', 'RETENTION_TALK', 'SETTLEMENT'];
const AREA_ORDER = ['IT', 'ADMINISTRATION', 'FINANCE', 'LINE_MANAGER', 'HR'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Last day 31 Oct" or "Last days in Oct–Nov" (template KPI note). */
function lastDays(dates: string[]): string | null {
  if (!dates.length) return null;
  const mon = (d: string) => MON[Number(d.slice(5, 7)) - 1]!;
  if (dates.length === 1) return `Last day ${dates[0]!.slice(8, 10)} ${mon(dates[0]!)}`;
  const a = mon(dates[0]!), b = mon(dates.at(-1)!);
  return a === b ? `Last days in ${a}` : `Last days in ${a}–${b}`;
}

@Injectable()
export class PrismaOffboardingStore extends OffboardingStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.db(), tenantId));
  }

  private async items(db: Db, tenantId: string, rows: Row[]): Promise<OffboardingItem[]> {
    const [refs, emps, items, interviews] = await Promise.all([
      employeeRefs(db, tenantId, rows.map((r) => r.employeeId)),
      db.employees.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.employeeId)) } }, select: { id: true, status: true } }),
      db.clearanceItems.findMany({ where: { tenantId, offboardingId: { in: rows.map((r) => r.id) } }, select: { offboardingId: true, status: true } }),
      db.exitInterviews.findMany({ where: { tenantId, offboardingId: { in: rows.map((r) => r.id) } }, select: { offboardingId: true } }),
    ]);
    return rows.map((r) => {
      const mine = items.filter((i) => i.offboardingId === r.id);
      return {
        id: r.id, docNo: r.docNo, employee: { ...(refs.get(r.employeeId) ?? unknownEmp(r.employeeId)), status: emps.find((e) => e.id === r.employeeId)?.status ?? '?' },
        exitType: r.exitType, resignationDate: day(r.resignationDate), lastWorkingDay: day(r.lastWorkingDay)!, noticeDaysRequired: r.noticeDaysRequired,
        noticeDaysServed: r.noticeDaysServed, noticeWaived: r.noticeWaived, reasonCategory: r.reasonCategory, reasonDetail: r.reasonDetail, isVoluntary: r.isVoluntary,
        status: r.status, closedAt: r.closedAt?.toISOString() ?? null, remarks: r.remarks, clearanceDone: mine.filter((i) => i.status !== 'PENDING').length,
        clearanceTotal: mine.length, hasInterview: interviews.some((i) => i.offboardingId === r.id), createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
      };
    });
  }

  async board(tenantId: string, q: { status: string; today: string }): Promise<OffboardingBoard> {
    const db = this.db();
    const fyStart = await leaveYearStart(db, tenantId, q.today);
    const statusWhere = q.status === 'OPEN' ? { in: OPEN } : q.status === 'ALL' ? undefined : { equals: q.status };
    const yearAgo = new Date(asDate(q.today).getTime() - 365 * 86_400_000);
    const [rows, fy, last12, open, headcount] = await Promise.all([
      db.offboardings.findMany({ where: { tenantId, ...(statusWhere && { status: statusWhere }) }, orderBy: [{ lastWorkingDay: 'desc' }], take: 200 }),
      db.offboardings.findMany({ where: { tenantId, status: { not: 'WITHDRAWN' }, lastWorkingDay: { gte: asDate(fyStart), lte: asDate(q.today) } }, select: { isVoluntary: true } }),
      db.offboardings.groupBy({ by: ['reasonCategory'], where: { tenantId, status: { not: 'WITHDRAWN' }, lastWorkingDay: { gte: yearAgo } }, _count: { _all: true } }),
      db.offboardings.findMany({ where: { tenantId, status: { in: OPEN } }, select: { id: true, status: true, lastWorkingDay: true } }),
      db.employees.count({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } } }),
    ]);
    const clearance = await db.clearanceItems.groupBy({ by: ['clearanceArea', 'status'], where: { tenantId, offboardingId: { in: open.map((o) => o.id) } }, _count: { _all: true } });
    const serving = open.filter((o) => o.status === 'SERVING_NOTICE').sort((a, b) => a.lastWorkingDay.getTime() - b.lastWorkingDay.getTime());
    const months = Math.max(1, (asDate(q.today).getUTCFullYear() - asDate(fyStart).getUTCFullYear()) * 12 + asDate(q.today).getUTCMonth() - asDate(fyStart).getUTCMonth() + 1);
    const areas = [...new Set(clearance.map((c) => c.clearanceArea))];
    return {
      today: q.today, fyStart,
      items: await this.items(db, tenantId, rows),
      kpis: {
        exitsFy: fy.length, voluntaryFy: fy.filter((f) => f.isVoluntary).length, servingNotice: serving.length,
        lastDaysNote: lastDays(serving.map((o) => day(o.lastWorkingDay)!)),
        attritionPct: headcount ? Math.round(((fy.length * 12) / months / headcount) * 1000) / 10 : null,
        pendingSettlements: open.filter((o) => o.status === 'SETTLEMENT').length,
      },
      reasons: last12.map((r) => ({ reason: r.reasonCategory, count: r._count._all })).sort((a, b) => b.count - a.count),
      clearanceByArea: areas.sort((a, b) => AREA_ORDER.indexOf(a) - AREA_ORDER.indexOf(b)).map((a) => ({
        area: a, pending: clearance.filter((c) => c.clearanceArea === a && c.status === 'PENDING').reduce((n, c) => n + c._count._all, 0),
        cleared: clearance.filter((c) => c.clearanceArea === a && c.status !== 'PENDING').reduce((n, c) => n + c._count._all, 0),
      })),
    };
  }

  async get(tenantId: string, id: string) {
    const db = this.db();
    const r = await db.offboardings.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [item] = await this.items(db, tenantId, [r]);
    const [items, interview, emp, tenant] = await Promise.all([
      db.clearanceItems.findMany({ where: { tenantId, offboardingId: id }, orderBy: { createdAt: 'asc' } }),
      db.exitInterviews.findFirst({ where: { tenantId, offboardingId: id } }),
      db.employees.findFirst({ where: { tenantId, id: r.employeeId }, select: { id: true, appUserId: true } }),
      db.tenants.findFirst({ where: { id: tenantId }, select: { defaultUserId: true } }),
    ]);
    const user = await db.users.findFirst({ where: { tenantId, deletedAt: null, OR: [{ employeeId: r.employeeId }, ...(emp?.appUserId ? [{ id: emp.appUserId }] : [])] }, select: { id: true, email: true, status: true } });
    const [refs, users] = await Promise.all([
      employeeRefs(db, tenantId, [...items.map((i) => i.ownerEmployeeId), interview?.conductedByEmployeeId]),
      userNames(db, tenantId, items.map((i) => i.clearedByUserId)),
    ]);
    const who = (x: string | null | undefined) => { const e = x ? refs.get(x) : null; return e ? { id: e.id, name: e.name } : null; };
    return {
      ...item!,
      clearance: items.map((i) => ({
        id: i.id, clearanceArea: i.clearanceArea, description: i.description, owner: who(i.ownerEmployeeId), recoverableAmount: i.recoverableAmount?.toNumber() ?? null,
        status: i.status, clearedAt: i.clearedAt?.toISOString() ?? null, clearedBy: users.get(i.clearedByUserId ?? '') ?? null, remarks: i.remarks, rowVersion: i.rowVersion,
      })),
      interview: interview ? {
        id: interview.id, interviewDate: day(interview.interviewDate)!, conductedBy: who(interview.conductedByEmployeeId), primaryReason: interview.primaryReason,
        wouldRejoin: interview.wouldRejoin, roleSatisfaction: interview.roleSatisfaction, managerSatisfaction: interview.managerSatisfaction,
        compensationFairness: interview.compensationFairness, wouldRecommend: interview.wouldRecommend, valuedMost: interview.valuedMost, shouldImprove: interview.shouldImprove,
        eligibleForRehire: interview.eligibleForRehire, isConfidential: interview.isConfidential, rowVersion: interview.rowVersion,
      } : null,
      appUser: user ? { id: user.id, email: user.email, status: user.status, isDefault: user.id === tenant?.defaultUserId } : null,
    };
  }

  async options(tenantId: string) {
    const db = this.db();
    const [emps, open] = await Promise.all([
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, orderBy: { code: 'asc' }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true, noticeDays: true, status: true } }),
      db.offboardings.findMany({ where: { tenantId, status: { in: OPEN } }, select: { employeeId: true } }),
    ]);
    return { employees: emps.map((e) => ({ id: e.id, code: e.code, name: employeeName(e), noticeDays: e.noticeDays, status: e.status, hasOpen: open.some((o) => o.employeeId === e.id) })) };
  }

  async employee(tenantId: string, id: string) {
    const e = await this.db().employees.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true, status: true, noticeDays: true, reportingManagerId: true } });
    return e;
  }

  async hasOpen(tenantId: string, employeeId: string) {
    return (await this.db().offboardings.count({ where: { tenantId, employeeId, status: { in: OPEN } } })) > 0;
  }

  async clearanceOf(tenantId: string, itemId: string) {
    return this.db().clearanceItems.findFirst({ where: { tenantId, id: itemId }, select: { offboardingId: true } });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'offboardingAddUpdate', data);
  }

  async clear(itemId: string, status: 'CLEARED' | 'WAIVED', remarks: string | null) {
    await this.db().$queryRaw`select "HumanResources"."clearanceItemClear"(${itemId}::uuid, ${status}, ${remarks})::text`;
  }

  async complete(id: string) {
    const r = await this.db().$queryRaw<{ r: { suspendedUserIds: string[] } }[]>`select "HumanResources"."offboardingComplete"(${id}::uuid) as r`;
    return { suspendedUserIds: r[0]!.r.suspendedUserIds ?? [] };
  }

  async withdraw(id: string, reason: string | null) {
    await this.db().$queryRaw`select "HumanResources"."offboardingWithdraw"(${id}::uuid, ${reason})::text`;
  }
}
