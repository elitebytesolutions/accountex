import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { LeaveBalanceQuery, LeaveBalanceRow, YearEndClosing } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeRefs, ids, num, tenantTimezone, todayIn, unknownEmp, userNames } from '../../attendance/infrastructure/hr-refs.js';
import { figures, leaveTypes, leaveYearStart, typeRef, unknownType } from '../../leave-requests/infrastructure/leave-refs.js';
import { LeaveBalanceStore } from '../application/leave-balance-store.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
const addM = (d: string, n: number) => { const x = asDate(d); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

@Injectable()
export class PrismaLeaveBalanceStore extends LeaveBalanceStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.db(), tenantId));
  }

  yearStart(tenantId: string, date: string) {
    return leaveYearStart(this.db(), tenantId, date);
  }

  async view(tenantId: string, q: LeaveBalanceQuery & { yearStart: string; today: string }) {
    const db = this.db();
    const s = q.search?.trim();
    const where: Prisma.EmployeesWhereInput = {
      tenantId, deletedAt: null, status: { not: 'EXITED' }, ...(q.departmentId && { departmentId: q.departmentId }),
      ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }),
    };
    const [emps, types, balances] = await Promise.all([
      db.employees.findMany({ where, select: { id: true, joiningDate: true }, orderBy: { code: 'asc' } }),
      leaveTypes(db, tenantId),
      db.leaveBalances.findMany({ where: { tenantId, leaveYearStart: asDate(q.yearStart) } }),
    ]);
    const shown = [...types.values()].filter((t) => !t.deletedAt && t.status === 'ACTIVE');
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    const all: LeaveBalanceRow[] = emps.map((e) => {
      const mine = balances.filter((b) => b.employeeId === e.id);
      const cells = Object.fromEntries(mine.map((b) => [b.leaveTypeId, { ...figures(b), carriedExpiresOn: day(b.carriedExpiresOn) }]));
      const paid = mine.filter((b) => types.get(b.leaveTypeId)?.isPaid);
      return {
        employee: { ...(refs.get(e.id) ?? unknownEmp(e.id)), joiningDate: day(e.joiningDate)! },
        cells,
        carriedIn: r2(mine.reduce((n, b) => n + num(b.carriedIn), 0)),
        unpaidTaken: r2(mine.filter((b) => !types.get(b.leaveTypeId)?.isPaid).reduce((n, b) => n + num(b.used), 0)),
        encashable: r2(mine.reduce((n, b) => n + num(b.encashable), 0)),
        negative: paid.some((b) => num(b.balance) < 0),
        low: paid.some((b) => { const t = types.get(b.leaveTypeId)!; const ent = num(b.entitled) + num(b.carriedIn) + num(b.adjusted); return ent > 0 && num(b.available) >= 0 && num(b.available) <= Math.max(1, ent * 0.15) && t.category !== 'UNPAID'; }),
      };
    });
    const filtered = q.filter === 'LOW' ? all.filter((r) => r.low) : q.filter === 'NEGATIVE' ? all.filter((r) => r.negative) : all;
    return {
      yearStart: q.yearStart, yearEnd: addM(q.yearStart, 12), today: q.today,
      types: shown.map((t) => ({ ...typeRef(t), daysPerYear: t.daysPerYear.toNumber(), accrualMethod: t.accrualMethod, accrualAmount: t.accrualAmount?.toNumber() ?? null })),
      rows: filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: filtered.length,
      counts: { all: all.length, low: all.filter((r) => r.low).length, negative: all.filter((r) => r.negative).length },
    };
  }

  async years(tenantId: string) {
    const rows = await this.db().leaveBalances.findMany({ where: { tenantId }, distinct: ['leaveYearStart'], select: { leaveYearStart: true } });
    return rows.map((r) => day(r.leaveYearStart)!);
  }

  async adjustments(tenantId: string, q: { employeeId?: string; leaveTypeId?: string; yearStart?: string }) {
    const db = this.db();
    const rows = await db.leaveAdjustments.findMany({
      where: { tenantId, ...(q.employeeId && { employeeId: q.employeeId }), ...(q.leaveTypeId && { leaveTypeId: q.leaveTypeId }), ...(q.yearStart && { leaveYearStart: asDate(q.yearStart) }) },
      orderBy: [{ createdAt: 'desc' }], take: 300,
    });
    const [refs, types, users, claims] = await Promise.all([
      employeeRefs(db, tenantId, rows.map((r) => r.employeeId)), leaveTypes(db, tenantId, ids(rows.map((r) => r.leaveTypeId))),
      userNames(db, tenantId, rows.map((r) => r.createdBy)),
      db.overtimeClaims.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.overtimeEntryId)) } }, select: { id: true, docNo: true } }),
    ]);
    return rows.map((r) => {
      const t = types.get(r.leaveTypeId);
      return {
        id: r.id, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), leaveType: t ? typeRef(t) : unknownType(r.leaveTypeId), leaveYearStart: day(r.leaveYearStart)!,
        kind: r.kind, direction: r.direction, days: num(r.days), effectiveDate: day(r.effectiveDate)!, reason: r.reason,
        overtimeClaim: claims.find((c) => c.id === r.overtimeEntryId) ?? null, yearEndCloseId: r.leaveYearCloseId, encashAmount: r.encashAmount?.toNumber() ?? null,
        createdBy: users.get(r.createdBy ?? '') ?? null, createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** Phase 30 owns overtime claims; this only reads approved comp-off claims not yet credited. */
  async compOffClaims(tenantId: string, employeeId: string) {
    const db = this.db();
    const used = (await db.leaveAdjustments.findMany({ where: { tenantId, employeeId, kind: 'COMP_OFF' }, select: { overtimeEntryId: true } })).map((a) => a.overtimeEntryId!);
    const rows = await db.overtimeClaims.findMany({ where: { tenantId, employeeId, isCompOff: true, status: 'APPROVED', id: { notIn: used } }, orderBy: { dateFrom: 'desc' } });
    return rows.map((c) => ({ id: c.id, docNo: c.docNo, dateFrom: day(c.dateFrom)!, dateTo: day(c.dateTo)!, hours: num(c.hours), reason: c.reason, suggestedDays: num(c.hours) >= 6 ? 1 : 0.5 }));
  }

  async employeeActive(tenantId: string, employeeId: string) {
    return (await this.db().employees.count({ where: { tenantId, id: employeeId, deletedAt: null, status: { not: 'EXITED' } } })) > 0;
  }

  addAdjustment(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'leaveAdjustmentAdd', data);
  }

  async accrue(month: string, employeeId?: string) {
    const r = await this.db().$queryRaw<{ r: { credited: number; skipped: number; leaveYearStart: string } }[]>`select "HumanResources"."leaveAccrueMonth"(${month}::date, ${employeeId ?? null}::uuid) as r`;
    return r[0]!.r;
  }

  async plan(tenantId: string, closingYearStart: string) {
    const db = this.db();
    const rows = await db.$queryRaw<{ employeeId: string; leaveTypeId: string; unused: string; carry: string; encash: string; lapse: string; encashAmount: string }[]>`
      select "employeeId"::text, "leaveTypeId"::text, unused::text, carry::text, encash::text, lapse::text, "encashAmount"::text from "HumanResources"."leaveYearEndPlan"(${closingYearStart}::date, ${tenantId}::uuid)`;
    const types = await leaveTypes(db, tenantId, ids(rows.map((r) => r.leaveTypeId)));
    const byType = new Map<string, { unused: number; carry: number; encash: number; lapse: number; amount: number; emps: Set<string> }>();
    for (const r of rows) {
      const a = byType.get(r.leaveTypeId) ?? { unused: 0, carry: 0, encash: 0, lapse: 0, amount: 0, emps: new Set<string>() };
      a.unused += Number(r.unused); a.carry += Number(r.carry); a.encash += Number(r.encash); a.lapse += Number(r.lapse); a.amount += Number(r.encashAmount); a.emps.add(r.employeeId);
      byType.set(r.leaveTypeId, a);
    }
    const rule = (t: NonNullable<ReturnType<typeof types.get>>) => [
      t.carryForwardMode === 'CAPPED' ? `Carry max ${num(t.carryForwardMax)}` : t.carryForwardMode === 'UNLIMITED' ? 'Carry all' : 'Lapses at year end',
      t.accumulationCap ? `accumulate to ${num(t.accumulationCap)}` : '',
      t.encashmentMode === 'YEAR_END' ? `encash ${t.encashMaxDays ? `up to ${num(t.encashMaxDays)}` : 'the rest'} (${t.encashBasis === 'GROSS_DIV_30' ? 'gross' : 'basic'} ÷ 30)` : '',
    ].filter(Boolean).join(' · ');
    return {
      employees: new Set(rows.map((r) => r.employeeId)).size,
      rows: [...byType.entries()].map(([id, a]) => {
        const t = types.get(id)!;
        return { leaveType: typeRef(t), rule: rule(t), unused: r2(a.unused), carry: r2(a.carry), encash: r2(a.encash), lapse: r2(a.lapse), amount: r2(a.amount), employees: a.emps.size };
      }),
    };
  }

  async closings(tenantId: string): Promise<YearEndClosing[]> {
    const db = this.db();
    const rows = await db.leaveYearEndClosings.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    const users = await userNames(db, tenantId, rows.map((r) => r.completedByUserId));
    return rows.map((c) => ({
      id: c.id, closingYearStart: day(c.closingYearStart)!, openingYearStart: day(c.openingYearStart)!, status: c.status, encashmentTarget: c.encashmentTarget,
      emailStatements: c.emailStatements, employeesCount: c.employeesCount, daysCarried: num(c.daysCarried), daysEncashed: num(c.daysEncashed), daysLapsed: num(c.daysLapsed),
      encashAmount: num(c.encashAmount), completedAt: c.completedAt?.toISOString() ?? null, completedBy: users.get(c.completedByUserId ?? '') ?? null,
      createdAt: c.createdAt.toISOString(), rowVersion: c.rowVersion,
    }));
  }

  createClosing(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'leaveYearEndClosingAddUpdate', data);
  }

  async completeClosing(id: string) {
    await this.db().$queryRaw`select "HumanResources"."leaveYearEndClosingComplete"(${id}::uuid)::text`;
  }

  async reverseClosing(id: string, reason: string) {
    await this.db().$queryRaw`select "HumanResources"."leaveYearEndClosingReverse"(${id}::uuid, ${reason})::text`;
  }
}
