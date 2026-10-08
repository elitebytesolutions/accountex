import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeRefs, hm, ids, num, unknownEmp, userNames } from '../../attendance/infrastructure/hr-refs.js';
import { OvertimeClaimStore, type ActivePolicy, type ClaimBase } from '../application/overtime-claim-store.js';

type Row = Prisma.OvertimeClaimsGetPayload<object>;
const LIVE = ['PENDING', 'APPROVED', 'PUSHED'];
const BASIS: Record<string, { on: 'gross' | 'basic'; days: number; hours: number }> = {
  GROSS_26_8: { on: 'gross', days: 26, hours: 8 }, BASIC_26_8: { on: 'basic', days: 26, hours: 8 }, GROSS_30_8: { on: 'gross', days: 30, hours: 8 },
};
const monthRange = (month: string) => { const from = asDate(`${month}-01`); return { gte: from, lt: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)) }; };

@Injectable()
export class PrismaOvertimeClaimStore extends OvertimeClaimStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: { month: string; status?: string; search?: string; page: number; pageSize: number }) {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const matching = s ? (await db.employees.findMany({ where: { tenantId, OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }, select: { id: true } })).map((e) => e.id) : null;
    const base: Prisma.OvertimeClaimsWhereInput = { tenantId, payrollMonth: asDate(`${q.month}-01`), ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { employeeId: { in: matching ?? [] } }] }) };
    const where = { ...base, ...(q.status && q.status !== 'ALL' && { status: q.status }) };
    const prevFrom = asDate(`${q.month}-01`);
    const prev = new Date(Date.UTC(prevFrom.getUTCFullYear(), prevFrom.getUTCMonth() - 1, 1));
    const [rows, total, byStatus, all, policy, prevAgg] = await Promise.all([
      db.overtimeClaims.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.overtimeClaims.count({ where }),
      db.overtimeClaims.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.overtimeClaims.findMany({ where: { tenantId, payrollMonth: asDate(`${q.month}-01`), status: { in: LIVE } }, select: { employeeId: true, hours: true, amount: true, status: true } }),
      this.activePolicy(tenantId),
      db.overtimeClaims.aggregate({ where: { tenantId, payrollMonth: prev, status: { in: ['APPROVED', 'PUSHED'] } }, _sum: { hours: true } }),
    ]);
    const approved = all.filter((c) => c.status !== 'PENDING');
    const pending = all.filter((c) => c.status === 'PENDING');
    const perEmp = new Map<string, number>();
    for (const c of all) perEmp.set(c.employeeId, (perEmp.get(c.employeeId) ?? 0) + num(c.hours));
    const emps = await db.employees.findMany({ where: { tenantId, id: { in: ids(approved.map((c) => c.employeeId)) } }, select: { id: true, departmentId: true } });
    const depts = await db.departments.findMany({ where: { tenantId, id: { in: ids(emps.map((e) => e.departmentId)) } }, select: { id: true, name: true, code: true } });
    const byDept = new Map<string, number>();
    for (const c of approved) {
      const d = depts.find((x) => x.id === emps.find((e) => e.id === c.employeeId)?.departmentId);
      const k = d?.code ?? d?.name ?? '—';
      byDept.set(k, (byDept.get(k) ?? 0) + num(c.hours));
    }
    return {
      items: await this.map(tenantId, rows), total, month: q.month, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: {
        hours: approved.reduce((n, c) => n + num(c.hours), 0), cost: approved.reduce((n, c) => n + num(c.amount), 0), pendingCount: pending.length,
        pendingHours: pending.reduce((n, c) => n + num(c.hours), 0), pendingAmount: pending.reduce((n, c) => n + num(c.amount), 0),
        overCap: policy?.monthlyCapHours ? [...perEmp.values()].filter((h) => h > policy.monthlyCapHours!).length : 0, capHours: policy?.monthlyCapHours ?? null,
        prevHours: num(prevAgg._sum.hours),
      },
      byDepartment: [...byDept.entries()].map(([department, hours]) => ({ department, hours })).sort((a, b) => b.hours - a.hours),
    };
  }

  private async map(tenantId: string, rows: Row[]): Promise<ClaimBase[]> {
    const db = this.prisma.db();
    const [refs, users] = await Promise.all([employeeRefs(db, tenantId, rows.map((r) => r.employeeId)), userNames(db, tenantId, rows.map((r) => r.decidedByUserId))]);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), dateFrom: day(r.dateFrom)!, dateTo: day(r.dateTo)!, dayType: r.dayType,
      timeFrom: hm(r.timeFrom), timeTo: hm(r.timeTo), hours: num(r.hours), multiplier: num(r.multiplier), hourlyRate: num(r.hourlyRate), isCompOff: r.isCompOff, amount: num(r.amount),
      reason: r.reason, source: r.source, preApproved: r.preApproved, payrollMonth: day(r.payrollMonth)!, status: r.status, decidedBy: users.get(r.decidedByUserId ?? '') ?? null,
      decidedAt: r.decidedAt?.toISOString() ?? null, rejectionReason: r.rejectionReason, pushedAt: r.pushedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  async get(tenantId: string, id: string) {
    const r = await this.prisma.db().overtimeClaims.findFirst({ where: { tenantId, id } });
    return r ? (await this.map(tenantId, [r]))[0]! : null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'overtimeClaimAddUpdate', data);
  }

  async approve(id: string) {
    await this.prisma.db().$queryRaw`select "HumanResources"."overtimeClaimApprove"(${id}::uuid, null)::text`;
  }

  async reject(id: string, reason: string) {
    await this.prisma.db().$queryRaw`select "HumanResources"."overtimeClaimReject"(${id}::uuid, ${reason})::text`;
  }

  async cancel(id: string, reason: string | null) {
    await this.prisma.db().$queryRaw`select "HumanResources"."overtimeClaimCancel"(${id}::uuid, ${reason})::text`;
  }

  async activePolicy(tenantId: string): Promise<ActivePolicy | null> {
    const db = this.prisma.db();
    const p = await db.overtimePolicies.findFirst({ where: { tenantId, isActive: true, deletedAt: null } });
    if (!p) return null;
    const g = p.eligibleUpToGradeId ? await db.grades.findFirst({ where: { tenantId, id: p.eligibleUpToGradeId }, select: { levelRank: true } }) : null;
    return {
      id: p.id, weekdayMultiplier: num(p.weekdayMultiplier), weeklyOffMultiplier: num(p.weeklyOffMultiplier), holidayMultiplier: num(p.holidayMultiplier), hourlyRateBasis: p.hourlyRateBasis,
      minMinutes: p.minMinutes, dailyCapHours: p.dailyCapHours ? num(p.dailyCapHours) : null, monthlyCapHours: p.monthlyCapHours ? num(p.monthlyCapHours) : null, rounding: p.rounding,
      eligibleUpToGradeRank: g?.levelRank ?? null, allowCompOff: p.allowCompOff,
    };
  }

  async employee(tenantId: string, id: string, date: string) {
    const db = this.prisma.db();
    const e = await db.employees.findFirst({ where: { tenantId, id, deletedAt: null, joiningDate: { lte: asDate(date) }, OR: [{ exitDate: null }, { exitDate: { gte: asDate(date) } }] }, select: { id: true, branchId: true, gradeId: true } });
    if (!e) return null;
    const g = e.gradeId ? await db.grades.findFirst({ where: { tenantId, id: e.gradeId }, select: { levelRank: true } }) : null;
    return { id: e.id, branchId: e.branchId, gradeRank: g?.levelRank ?? null };
  }

  async hourlyRate(tenantId: string, employeeId: string, date: string, basis: string) {
    const s = await this.prisma.db().employeeSalaries.findFirst({
      where: { tenantId, employeeId, effectiveFrom: { lte: asDate(date) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: asDate(date) } }] }, orderBy: { effectiveFrom: 'desc' },
    });
    const b = BASIS[basis] ?? BASIS.GROSS_26_8!;
    if (!s) return null;
    const amount = b.on === 'basic' ? num(s.basicAmount) : num(s.grossAmount);
    return amount ? amount / b.days / b.hours : null;
  }

  async hoursInMonth(tenantId: string, employeeId: string, month: string, exceptId: string | null) {
    const r = await this.prisma.db().overtimeClaims.aggregate({ where: { tenantId, employeeId, status: { in: LIVE }, payrollMonth: monthRange(month), ...(exceptId && { id: { not: exceptId } }) }, _sum: { hours: true } });
    return num(r._sum.hours);
  }
}
