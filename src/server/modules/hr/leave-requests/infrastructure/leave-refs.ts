import type { Prisma } from '../../../../generated/prisma/client.js';
import type { LeaveBalanceFigures, LeaveTypeRef } from '../../../../../shared/index.js';
import { day, employeeRefs, ids, num, unknownEmp, userNames } from '../../attendance/infrastructure/hr-refs.js';
import type { LeaveRequestBase, LeaveTypeFull } from '../application/leave-request-store.js';

/** Lookups shared by the Phase 31 leave stores (requests, balances, year-end). */
type Db = Prisma.TransactionClient;
type TypeRow = Prisma.LeaveTypesGetPayload<object>;
type BalanceRow = Prisma.LeaveBalancesGetPayload<object>;
type RequestRow = Prisma.LeaveRequestsGetPayload<object>;

const opt = (d: { toNumber(): number } | null) => (d ? d.toNumber() : null);

export const typeRef = (t: TypeRow): LeaveTypeRef => ({
  id: t.id, code: t.code, name: t.name, category: t.category, colour: t.colour, isPaid: t.isPaid, allowNegative: t.allowNegative, allowHalfDay: t.allowHalfDay,
});
export const typeFull = (t: TypeRow): LeaveTypeFull => ({
  ...typeRef(t), status: t.deletedAt ? 'DELETED' : t.status, daysPerYear: t.daysPerYear.toNumber(), sandwichRule: t.sandwichRule,
  minNoticeDays: t.minNoticeDays, backdateDays: t.backdateDays, maxConsecutiveDays: opt(t.maxConsecutiveDays), maxPerMonth: opt(t.maxPerMonth),
  maxTimesInService: t.maxTimesInService, applyWindowDays: t.applyWindowDays, gender: t.gender, availableAfter: t.availableAfter, probationRule: t.probationRule,
  attachmentRequired: t.attachmentRequired, attachmentAfterDays: opt(t.attachmentAfterDays), approvalWorkflow: t.approvalWorkflow, hrApprovalAboveDays: opt(t.hrApprovalAboveDays),
});
export const figures = (b: BalanceRow): LeaveBalanceFigures => ({
  entitled: num(b.entitled), carriedIn: num(b.carriedIn), adjusted: num(b.adjusted), used: num(b.used), booked: num(b.booked),
  encashed: num(b.encashed), lapsed: num(b.lapsed), balance: num(b.balance), available: num(b.available),
});
export const unknownType = (id: string): LeaveTypeRef => ({ id, code: '?', name: '?', category: 'OTHER', colour: 'GREY', isPaid: true, allowNegative: false, allowHalfDay: false });

/** HumanResources.getLeaveYearStart: the leave year follows the company's fiscal year. */
export async function leaveYearStart(db: Db, tenantId: string, date: string): Promise<string> {
  const r = await db.$queryRaw<{ y: string }[]>`select "HumanResources"."getLeaveYearStart"(${tenantId}::uuid, ${date}::date)::text as y`;
  return r[0]!.y;
}

export async function leaveTypes(db: Db, tenantId: string, typeIds?: string[]) {
  const rows = await db.leaveTypes.findMany({ where: { tenantId, ...(typeIds && { id: { in: typeIds } }) }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return new Map(rows.map((t) => [t.id, t]));
}

/** Leave request rows as LeaveRequestBase (employee, type, handover and decider resolved). */
export async function leaveItems(db: Db, tenantId: string, rows: RequestRow[]): Promise<LeaveRequestBase[]> {
  const [refs, types, users] = await Promise.all([
    employeeRefs(db, tenantId, rows.flatMap((r) => [r.employeeId, r.handoverEmployeeId])),
    leaveTypes(db, tenantId, ids(rows.map((r) => r.leaveTypeId))),
    userNames(db, tenantId, rows.map((r) => r.decidedByUserId)),
  ]);
  return rows.map((r) => {
    const t = types.get(r.leaveTypeId);
    const h = r.handoverEmployeeId ? refs.get(r.handoverEmployeeId) : null;
    return {
      id: r.id, docNo: r.docNo, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), leaveType: t ? typeRef(t) : unknownType(r.leaveTypeId),
      duration: r.duration, fromDate: day(r.fromDate)!, toDate: day(r.toDate)!, days: num(r.days), calendarDays: r.calendarDays ?? 0, reason: r.reason,
      handover: h ? { id: h.id, name: h.name } : null, contactDuringLeave: r.contactDuringLeave, balanceBefore: opt(r.balanceBefore), balanceAfter: opt(r.balanceAfter),
      channel: r.channel, appliedOnBehalf: r.appliedOnBehalf, submittedAt: r.submittedAt.toISOString(), status: r.status, stage: r.stage,
      decidedBy: users.get(r.decidedByUserId ?? '') ?? null, decidedAt: r.decidedAt?.toISOString() ?? null, rejectionReason: r.rejectionReason,
      decisionComment: r.decisionComment, suggestAlternative: r.suggestAlternative, cancelledAt: r.cancelledAt?.toISOString() ?? null, cancelReason: r.cancelReason,
      rowVersion: r.rowVersion,
    };
  });
}

/** Holidays (public and company, not cancelled) for a branch in a range, by date. */
export async function holidayMap(db: Db, tenantId: string, branchId: string | null, from: string, to: string): Promise<Map<string, string>> {
  const rows = await db.holidays.findMany({
    where: { tenantId, deletedAt: null, status: { not: 'CANCELLED' }, holidayType: { in: ['PUBLIC', 'COMPANY'] }, fromDate: { lte: new Date(`${to}T00:00:00Z`) }, toDate: { gte: new Date(`${from}T00:00:00Z`) } },
    select: { id: true, name: true, fromDate: true, toDate: true, appliesToAllBranches: true },
  });
  const scoped = rows.filter((h) => !h.appliesToAllBranches).map((h) => h.id);
  const links = scoped.length && branchId ? await db.holidayBranches.findMany({ where: { tenantId, holidayId: { in: scoped }, branchId }, select: { holidayId: true } }) : [];
  const ok = new Set(links.map((l) => l.holidayId));
  const out = new Map<string, string>();
  for (const h of rows) {
    if (!h.appliesToAllBranches && !ok.has(h.id)) continue;
    for (let t = h.fromDate.getTime(); t <= h.toDate.getTime(); t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      if (d >= from && d <= to) out.set(d, h.name);
    }
  }
  return out;
}
