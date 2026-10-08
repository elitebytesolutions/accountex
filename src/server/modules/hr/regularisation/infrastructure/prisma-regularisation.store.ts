import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PunchItem, RegularisationItem } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { asDate, day, employeeOfUser, employeeRefs, hm, ids, tenantTimezone, todayIn, unknownEmp, userNames, zonedInstant } from '../../attendance/infrastructure/hr-refs.js';
import { RegularisationStore, type RegularisationBase, type RegularisationQuery } from '../application/regularisation-store.js';

type Row = Prisma.RegularisationRequestsGetPayload<object>;
type Item = Omit<RegularisationItem, 'waitingOn'>;

@Injectable()
export class PrismaRegularisationStore extends RegularisationStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: RegularisationQuery) {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const matching = s ? (await db.employees.findMany({ where: { tenantId, OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }, select: { id: true } })).map((e) => e.id) : null;
    const base: Prisma.RegularisationRequestsWhereInput = {
      tenantId, ...(q.employeeId && { employeeId: q.employeeId }), ...(q.type && { requestType: q.type }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { reason: { contains: s, mode: 'insensitive' } }, { employeeId: { in: matching ?? [] } }] }),
    };
    const where = { ...base, ...(q.status && q.status !== 'ALL' && { status: q.status }) };
    const monthStart = new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`);
    const [rows, total, byStatus, decided, byType, oldPending] = await Promise.all([
      db.regularisationRequests.findMany({ where, orderBy: [{ submittedAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.regularisationRequests.count({ where }),
      db.regularisationRequests.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.regularisationRequests.findMany({ where: { ...base, status: { in: ['APPROVED', 'REJECTED'] }, decidedAt: { gte: monthStart } }, select: { status: true, submittedAt: true, decidedAt: true } }),
      db.regularisationRequests.groupBy({ by: ['requestType'], where: base, _count: { _all: true } }),
      db.regularisationRequests.count({ where: { ...base, status: 'PENDING', submittedAt: { lt: new Date(Date.now() - 48 * 3600_000) } } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    const approved = decided.filter((d) => d.status === 'APPROVED');
    const totalTypes = byType.reduce((n, t) => n + t._count._all, 0);
    const top = [...byType].sort((a, b) => b._count._all - a._count._all)[0];
    return {
      items: await this.map(tenantId, rows), total, counts,
      kpis: {
        pending: counts.PENDING ?? 0, pendingOld: oldPending, approvedMonth: approved.length, rejectedMonth: decided.length - approved.length,
        avgTurnaroundHours: approved.length ? Math.round(approved.reduce((n, d) => n + (d.decidedAt!.getTime() - d.submittedAt.getTime()), 0) / approved.length / 3600_000) : null,
        topType: top?.requestType ?? null, topTypePct: top && totalTypes ? Math.round((top._count._all / totalTypes) * 100) : null,
      },
    };
  }

  private async map(tenantId: string, rows: Row[]): Promise<Item[]> {
    const db = this.prisma.db();
    const [refs, users] = await Promise.all([employeeRefs(db, tenantId, rows.map((r) => r.employeeId)), userNames(db, tenantId, rows.map((r) => r.decidedByUserId))]);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), requestType: r.requestType, punchDirection: r.punchDirection,
      attDate: day(r.attDate)!, requestedIn: hm(r.requestedIn), requestedOut: hm(r.requestedOut), reason: r.reason, channel: r.channel, submittedAt: r.submittedAt.toISOString(),
      status: r.status, stage: r.stage, decidedBy: users.get(r.decidedByUserId ?? '') ?? null, decidedAt: r.decidedAt?.toISOString() ?? null,
      rejectionReason: r.rejectionReason, decisionComment: r.decisionComment, markAbsentIfUnresolved: r.markAbsentIfUnresolved, rowVersion: r.rowVersion,
    }));
  }

  async get(tenantId: string, id: string): Promise<RegularisationBase | null> {
    const db = this.prisma.db();
    const r = await db.regularisationRequests.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [item] = await this.map(tenantId, [r]);
    const tz = await tenantTimezone(db, tenantId);
    const date = day(r.attDate)!;
    const from = zonedInstant(tz, date, '00:00');
    const [emp, roster, punches, month] = await Promise.all([
      db.employees.findFirst({ where: { tenantId, id: r.employeeId }, select: { shiftId: true } }),
      db.shiftRosters.findFirst({ where: { tenantId, employeeId: r.employeeId, rosterDate: r.attDate, isPublished: true, entryType: 'SHIFT' } }),
      db.attendancePunches.findMany({ where: { tenantId, employeeId: r.employeeId, punchAt: { gte: from, lt: new Date(from.getTime() + 86_400_000) } }, orderBy: { punchAt: 'asc' } }),
      db.regularisationRequests.count({ where: { tenantId, employeeId: r.employeeId, status: { not: 'WITHDRAWN' }, attDate: { gte: asDate(`${date.slice(0, 7)}-01`), lt: new Date(Date.UTC(r.attDate.getUTCFullYear(), r.attDate.getUTCMonth() + 1, 1)) } } }),
    ]);
    const shiftId = roster?.shiftId ?? emp?.shiftId ?? null;
    const shift = await db.workShifts.findFirst({ where: { tenantId, deletedAt: null, ...(shiftId ? { id: shiftId } : { isDefault: true }) } });
    const devices = await db.biometricDevices.findMany({ where: { tenantId, id: { in: ids(punches.map((p) => p.deviceId)) } }, select: { id: true, code: true } });
    const p: PunchItem[] = punches.map((x) => ({
      id: x.id, employee: item!.employee, punchAt: x.punchAt.toISOString(), direction: x.direction, source: x.source, workMode: x.workMode,
      device: devices.find((d) => d.id === x.deviceId)?.code ?? null, locationLabel: x.locationLabel, insideGeofence: x.insideGeofence, geofenceDistanceM: x.geofenceDistanceM,
      manualReason: x.manualReason, isVoid: x.isVoid,
    }));
    return { ...item!, shift: shift ? { code: shift.code, name: shift.name, startTime: hm(shift.startTime)!, endTime: hm(shift.endTime)! } : null, punches: p, requestsThisMonth: month };
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'regularisationRequestAddUpdate', data);
  }

  async set(tenantId: string, id: string, data: Record<string, unknown>) {
    await this.prisma.db().regularisationRequests.updateMany({ where: { tenantId, id }, data });
  }

  async approve(id: string, comment: string | null) {
    await this.prisma.db().$queryRaw`select "HumanResources"."regularisationRequestApprove"(${id}::uuid, ${comment})::text`;
  }

  async reject(id: string, reason: string, comment: string | null, markAbsent: boolean) {
    await this.prisma.db().$queryRaw`select "HumanResources"."regularisationRequestReject"(${id}::uuid, ${reason}, ${comment}, ${markAbsent})::text`;
  }

  async employeeOf(tenantId: string, userId: string) {
    const e = await employeeOfUser(this.prisma.db(), tenantId, userId);
    return e ? { id: e.id, branchId: e.branchId } : null;
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.prisma.db(), tenantId));
  }

  async monthLocked(tenantId: string, date: string) {
    const from = asDate(`${date.slice(0, 7)}-01`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return (await this.prisma.db().attendanceRegister.count({ where: { tenantId, lockedAt: { not: null }, attDate: { gte: from, lt: to } } })) > 0;
  }
}
