import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { TrainingBoardQuery, TrainingCertificationItem, TrainingEnrolmentItem, TrainingOptions, TrainingSessionItem } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, employeeRefs, ids, tenantTimezone, todayIn, unknownEmp } from '../../attendance/infrastructure/hr-refs.js';
import { TrainingStore } from '../application/training-store.js';

type Db = Prisma.TransactionClient;
const n = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : null);
const z0 = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0);
const ACTIVE = ['ENROLLED', 'IN_PROGRESS', 'BEHIND'];
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const addDays = (d: string, k: number) => { const x = asDate(d); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

@Injectable()
export class PrismaTrainingStore extends TrainingStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.db(), tenantId));
  }

  private async sessionItems(db: Db, tenantId: string, rows: Prisma.TrainingSessionsGetPayload<object>[]): Promise<TrainingSessionItem[]> {
    const programIds = ids(rows.map((r) => r.programId));
    const [programs, branches, counts] = await Promise.all([
      db.trainingPrograms.findMany({ where: { tenantId, id: { in: programIds } }, select: { id: true, name: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.branchId)) } }, select: { id: true, name: true } }),
      db.trainingEnrolments.groupBy({ by: ['programId'], where: { tenantId, programId: { in: programIds }, status: { not: 'WITHDRAWN' } }, _count: { _all: true } }),
    ]);
    return rows.map((r) => ({
      id: r.id, program: programs.find((p) => p.id === r.programId) ?? { id: r.programId, name: '?' }, title: r.title, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(),
      deliveryMode: r.deliveryMode, venue: r.venue, branch: branches.find((b) => b.id === r.branchId) ?? null, trainer: r.trainer, seats: r.seats, isMandatory: r.isMandatory,
      status: r.status, enrolled: counts.find((c) => c.programId === r.programId)?._count._all ?? 0, rowVersion: r.rowVersion,
    }));
  }

  private async enrolmentItems(db: Db, tenantId: string, rows: Prisma.TrainingEnrolmentsGetPayload<object>[]): Promise<TrainingEnrolmentItem[]> {
    const [programs, refs, certs] = await Promise.all([
      db.trainingPrograms.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.programId)) } }, select: { id: true, name: true, grantsCertification: true, certificationValidityMonths: true } }),
      employeeRefs(db, tenantId, rows.map((r) => r.employeeId)),
      db.certifications.findMany({ where: { tenantId, trainingEnrolmentId: { in: rows.map((r) => r.id) } }, select: { id: true, name: true, expiresOn: true, trainingEnrolmentId: true } }),
    ]);
    return rows.map((r) => {
      const c = certs.find((x) => x.trainingEnrolmentId === r.id);
      return {
        id: r.id, program: programs.find((p) => p.id === r.programId) ?? { id: r.programId, name: '?', grantsCertification: null, certificationValidityMonths: null },
        employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), enrolledOn: day(r.enrolledOn)!, progressPct: z0(r.progressPct), scorePct: n(r.scorePct),
        hoursCompleted: z0(r.hoursCompleted), cost: z0(r.cost), status: r.status, completedOn: day(r.completedOn),
        certification: c ? { id: c.id, name: c.name, expiresOn: day(c.expiresOn) } : null, rowVersion: r.rowVersion,
      };
    });
  }

  async board(tenantId: string, q: TrainingBoardQuery, today: string) {
    const db = this.db();
    const tenant = await db.tenants.findFirst({ where: { id: tenantId }, select: { fiscalYearStartMonth: true } });
    const fyMonth = tenant?.fiscalYearStartMonth ?? 7;
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    const fyStart = new Date(Date.UTC(m >= fyMonth ? y : y - 1, fyMonth - 1, 1));
    const s = q.search?.trim();
    const [matchEmps, matchProgs] = s ? await Promise.all([
      db.employees.findMany({ where: { tenantId, OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }, select: { id: true } }),
      db.trainingPrograms.findMany({ where: { tenantId, name: { contains: s, mode: 'insensitive' } }, select: { id: true } }),
    ]) : [null, null];
    const base: Prisma.TrainingEnrolmentsWhereInput = {
      tenantId, ...(q.programId && { programId: q.programId }),
      ...(s && { OR: [{ employeeId: { in: matchEmps!.map((e) => e.id) } }, { programId: { in: matchProgs!.map((p) => p.id) } }] }),
    };
    const statusWhere = q.status === 'NOT_STARTED' ? { status: 'ENROLLED' } : q.status === 'IN_PROGRESS' ? { status: { in: ['IN_PROGRESS', 'BEHIND'] } } : q.status ? { status: q.status } : {};
    const where = { ...base, ...statusWhere };
    const now = new Date();
    const [rows, total, byStatus, sessions, expiring, fyRows, programs, stats, headcount] = await Promise.all([
      db.trainingEnrolments.findMany({ where, orderBy: [{ enrolledOn: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.trainingEnrolments.count({ where }),
      db.trainingEnrolments.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.trainingSessions.findMany({ where: { tenantId, status: 'SCHEDULED', endsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 8 }),
      db.certifications.findMany({ where: { tenantId, status: 'ACTIVE', expiresOn: { not: null, lte: asDate(addDays(today, 60)) } }, orderBy: { expiresOn: 'asc' }, take: 20 }),
      db.trainingEnrolments.findMany({ where: { tenantId, enrolledOn: { gte: fyStart }, status: { not: 'WITHDRAWN' } }, select: { hoursCompleted: true, cost: true } }),
      db.trainingPrograms.findMany({ where: { tenantId, deletedAt: null, status: { not: 'CANCELLED' } }, select: { id: true, budget: true, status: true } }),
      db.trainingEnrolments.groupBy({ by: ['programId', 'status'], where: { tenantId, status: { not: 'WITHDRAWN' } }, _count: { _all: true } }),
      db.employees.count({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } } }),
    ]);
    const hours = fyRows.reduce((t, r) => t + z0(r.hoursCompleted), 0);
    const certRefs = await employeeRefs(db, tenantId, expiring.map((c) => c.employeeId));
    const programStats: Record<string, { enrolled: number; completed: number }> = {};
    for (const st of stats) {
      const p = (programStats[st.programId] ??= { enrolled: 0, completed: 0 });
      p.enrolled += st._count._all;
      if (st.status === 'COMPLETED') p.completed += st._count._all;
    }
    const expItems: TrainingCertificationItem[] = expiring.map((c) => ({
      id: c.id, employee: certRefs.get(c.employeeId) ?? unknownEmp(c.employeeId), name: c.name, issuer: c.issuer, certificateNo: c.certificateNo, issuedOn: day(c.issuedOn),
      expiresOn: day(c.expiresOn), status: c.status, daysLeft: c.expiresOn ? Math.round((c.expiresOn.getTime() - asDate(today).getTime()) / 86_400_000) : null, enrolmentId: c.trainingEnrolmentId,
    }));
    return {
      today,
      kpis: {
        hours: Math.round(hours * 10) / 10, perEmployee: headcount ? Math.round((hours / headcount) * 10) / 10 : null, budgetUsed: fyRows.reduce((t, r) => t + z0(r.cost), 0),
        budget: programs.reduce((t, p) => t + z0(p.budget), 0), activeEnrolments: stats.filter((x) => ACTIVE.includes(x.status)).reduce((t, x) => t + x._count._all, 0),
        runningPrograms: programs.filter((p) => p.status === 'IN_PROGRESS').length, expiring: expItems.filter((c) => (c.daysLeft ?? 0) >= 0).length,
      },
      programStats,
      sessions: await this.sessionItems(db, tenantId, sessions),
      expiring: expItems,
      enrolments: await this.enrolmentItems(db, tenantId, rows),
      total,
      counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
    };
  }

  async options(tenantId: string): Promise<TrainingOptions> {
    const db = this.db();
    const [programs, branches, emps, enrol] = await Promise.all([
      db.trainingPrograms.findMany({ where: { tenantId, deletedAt: null, status: { in: ['PLANNED', 'IN_PROGRESS'] } }, select: { id: true, name: true, status: true, seats: true, costPerHead: true }, orderBy: { name: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, select: { id: true }, orderBy: { code: 'asc' } }),
      db.trainingEnrolments.findMany({ where: { tenantId, status: { not: 'WITHDRAWN' } }, select: { programId: true, employeeId: true } }),
    ]);
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    return {
      programs: programs.map((p) => ({ id: p.id, name: p.name, status: p.status, seats: p.seats, costPerHead: n(p.costPerHead), enrolled: enrol.filter((x) => x.programId === p.id).length })),
      branches,
      employees: emps.map((e) => ({ ...refs.get(e.id)!, enrolledIn: enrol.filter((x) => x.employeeId === e.id).map((x) => x.programId) })),
    };
  }

  async program(tenantId: string, id: string) {
    const p = await this.db().trainingPrograms.findFirst({ where: { tenantId, id }, select: { id: true, name: true, status: true, seats: true, deletedAt: true } });
    return p ? { id: p.id, name: p.name, status: p.status, seats: p.seats, deleted: !!p.deletedAt } : null;
  }

  activeEnrolments(tenantId: string, programId: string) {
    return this.db().trainingEnrolments.count({ where: { tenantId, programId, status: { not: 'WITHDRAWN' } } });
  }

  async enrolledAlready(tenantId: string, programId: string, employeeIds: string[]) {
    const rows = await this.db().trainingEnrolments.findMany({ where: { tenantId, programId, employeeId: { in: employeeIds } }, select: { employeeId: true } });
    const refs = await employeeRefs(this.db(), tenantId, rows.map((r) => r.employeeId));
    return rows.map((r) => ({ id: r.employeeId, name: refs.get(r.employeeId)?.name ?? '?' }));
  }

  async session(tenantId: string, id: string) {
    const row = await this.db().trainingSessions.findFirst({ where: { tenantId, id } });
    return row ? (await this.sessionItems(this.db(), tenantId, [row]))[0]! : null;
  }

  async enrolment(tenantId: string, id: string) {
    const row = await this.db().trainingEnrolments.findFirst({ where: { tenantId, id } });
    return row ? (await this.enrolmentItems(this.db(), tenantId, [row]))[0]! : null;
  }

  saveSession(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'trainingSessionAddUpdate', data);
  }

  saveEnrolment(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'trainingEnrolmentAddUpdate', data);
  }

  async completeEnrolment(id: string, data: Record<string, unknown>) {
    const rows = await this.db().$queryRaw<{ id: string | null }[]>`select "HumanResources"."trainingEnrolmentComplete"(${id}::uuid, ${JSON.stringify(data)}::jsonb)::text as id`;
    return rows[0]?.id ?? null;
  }

  async withdrawEnrolment(id: string, rowVersion: number) {
    await this.db().$queryRaw`select "HumanResources"."trainingEnrolmentWithdraw"(${id}::uuid, ${rowVersion}::int)::text`;
  }
}
