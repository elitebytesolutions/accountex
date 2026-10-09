import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PerfActionItem, PerfFeedback, PerfGoal, PerfOneOnOne, PerfReviewItem, PerfReviewQuery } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, employeeOfUser, employeeRefs, ids, tenantTimezone, todayIn, unknownEmp } from '../../attendance/infrastructure/hr-refs.js';
import { PerformanceStore, type PerfEmployee } from '../application/performance-store.js';

type Db = Prisma.TransactionClient;
type ReviewRow = Prisma.PerformanceReviewsGetPayload<object>;
type GoalRow = Prisma.GoalsGetPayload<object>;
const n = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : null);
const z0 = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0);
const SUBMITTED_SELF = ['AWAITING_MANAGER', 'REVIEWED', 'CALIBRATED', 'SIGNED_OFF'];
const SUBMITTED_MGR = ['REVIEWED', 'CALIBRATED', 'SIGNED_OFF'];
const NINE = ['ENIGMA', 'GROWTH_EMPLOYEE', 'FUTURE_LEADER', 'INCONSISTENT_PLAYER', 'CORE_PLAYER', 'HIGH_PERFORMER', 'RISK', 'EFFECTIVE_EMPLOYEE', 'TRUSTED_PROFESSIONAL'];

@Injectable()
export class PrismaPerformanceStore extends PerformanceStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  async today(tenantId: string) {
    return todayIn(await tenantTimezone(this.db(), tenantId));
  }

  private async emp(tenantId: string, id: string | null | undefined): Promise<PerfEmployee | null> {
    if (!id) return null;
    const e = await this.db().employees.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true, reportingManagerId: true, status: true } });
    if (!e) return null;
    const r = (await employeeRefs(this.db(), tenantId, [id])).get(id)!;
    return { id, name: r.name, designation: r.designation, department: r.department, managerId: e.reportingManagerId, status: e.status };
  }

  employee(tenantId: string, id: string) {
    return this.emp(tenantId, id);
  }

  async employeeOfUser(tenantId: string, userId: string) {
    return this.emp(tenantId, (await employeeOfUser(this.db(), tenantId, userId))?.id);
  }

  async options(tenantId: string) {
    const db = this.db();
    const emps = await db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' } }, select: { id: true, reportingManagerId: true }, orderBy: { code: 'asc' } });
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    return { employees: emps.map((e) => ({ ...refs.get(e.id)!, managerId: e.reportingManagerId })) };
  }

  departments(tenantId: string) {
    return this.db().departments.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async colleagues(tenantId: string, exceptId: string) {
    const db = this.db();
    const emps = await db.employees.findMany({ where: { tenantId, deletedAt: null, status: { not: 'EXITED' }, id: { not: exceptId } }, select: { id: true }, orderBy: { code: 'asc' } });
    const refs = await employeeRefs(db, tenantId, emps.map((e) => e.id));
    return emps.map((e) => { const r = refs.get(e.id)!; return { id: r.id, name: r.name, designation: r.designation, department: r.department }; });
  }

  // ---------------------------------------------------------------- reviews
  private async reviewItems(db: Db, tenantId: string, rows: ReviewRow[]): Promise<PerfReviewItem[]> {
    const [refs, goals] = await Promise.all([
      employeeRefs(db, tenantId, rows.flatMap((r) => [r.employeeId, r.managerEmployeeId])),
      db.goals.groupBy({ by: ['employeeId', 'cycleId'], where: { tenantId, employeeId: { in: rows.map((r) => r.employeeId) }, cycleId: { in: ids(rows.map((r) => r.cycleId)) }, status: { not: 'DROPPED' } }, _count: { _all: true } }),
    ]);
    return rows.map((r) => {
      const m = r.managerEmployeeId ? refs.get(r.managerEmployeeId) : null;
      return {
        id: r.id, cycleId: r.cycleId, employee: refs.get(r.employeeId) ?? unknownEmp(r.employeeId), manager: m ? { id: m.id, name: m.name } : null,
        goalAchievementPct: n(r.goalAchievementPct), goals: goals.find((g) => g.employeeId === r.employeeId && g.cycleId === r.cycleId)?._count._all ?? 0,
        selfRating: n(r.selfRating), managerRating: n(r.managerRating), finalRating: n(r.finalRating), ratingLabel: r.ratingLabel,
        performanceBand: r.performanceBand, potentialBand: r.potentialBand, nineBox: r.nineBox, pipSuggested: r.pipSuggested, stage: r.stage,
        selfComment: r.selfComment, managerComment: r.managerComment, selfSubmittedAt: r.selfSubmittedAt?.toISOString() ?? null,
        managerSubmittedAt: r.managerSubmittedAt?.toISOString() ?? null, calibratedAt: r.calibratedAt?.toISOString() ?? null, signedOffAt: r.signedOffAt?.toISOString() ?? null,
        incrementPctRecommended: n(r.incrementPctRecommended), rowVersion: r.rowVersion,
      };
    });
  }

  async reviews(tenantId: string, cycleId: string, q: PerfReviewQuery) {
    const db = this.db();
    const s = q.search?.trim();
    const empFilter = s || q.departmentId ? (await db.employees.findMany({
      where: {
        tenantId, ...(q.departmentId && { departmentId: q.departmentId }),
        ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { firstName: { contains: s, mode: 'insensitive' } }, { lastName: { contains: s, mode: 'insensitive' } }, { displayName: { contains: s, mode: 'insensitive' } }] }),
      },
      select: { id: true },
    })).map((e) => e.id) : null;
    const base: Prisma.PerformanceReviewsWhereInput = { tenantId, cycleId, ...(empFilter && { employeeId: { in: empFilter } }) };
    const where = { ...base, ...(q.stage && { stage: q.stage }) };
    const [rows, total, byStage] = await Promise.all([
      db.performanceReviews.findMany({ where, orderBy: [{ updatedAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.performanceReviews.count({ where }),
      db.performanceReviews.groupBy({ by: ['stage'], where: base, _count: { _all: true } }),
    ]);
    return { items: await this.reviewItems(db, tenantId, rows), total, counts: Object.fromEntries(byStage.map((b) => [b.stage, b._count._all])) };
  }

  async reviewStats(tenantId: string, cycleId: string) {
    const db = this.db();
    const [rows, goals] = await Promise.all([
      db.performanceReviews.findMany({ where: { tenantId, cycleId }, select: { employeeId: true, stage: true, managerRating: true, finalRating: true, nineBox: true } }),
      db.goals.findMany({ where: { tenantId, cycleId, status: { not: 'DROPPED' } }, select: { status: true } }),
    ]);
    const rated = rows.map((r) => n(r.finalRating) ?? n(r.managerRating)).filter((x): x is number => x != null);
    const boxed = rows.filter((r) => r.nineBox);
    const refs = await employeeRefs(db, tenantId, boxed.map((r) => r.employeeId));
    return {
      eligible: rows.length, selfSubmitted: rows.filter((r) => SUBMITTED_SELF.includes(r.stage)).length, managerSubmitted: rows.filter((r) => SUBMITTED_MGR.includes(r.stage)).length,
      avgRating: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null,
      goalsOnTrack: goals.filter((g) => ['ON_TRACK', 'ACHIEVED'].includes(g.status)).length, goalsTotal: goals.length,
      nineBox: NINE.map((box) => { const inBox = boxed.filter((r) => r.nineBox === box); return { box, count: inBox.length, names: inBox.slice(0, 3).map((r) => refs.get(r.employeeId)?.name ?? '?') }; }),
    };
  }

  async avgFinalRating(tenantId: string, cycleId: string) {
    const a = await this.db().performanceReviews.aggregate({ where: { tenantId, cycleId, finalRating: { not: null } }, _avg: { finalRating: true } });
    return a._avg.finalRating ? Math.round(a._avg.finalRating.toNumber() * 10) / 10 : null;
  }

  async review(tenantId: string, id: string) {
    const db = this.db();
    const r = await db.performanceReviews.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [item] = await this.reviewItems(db, tenantId, [r]);
    const [goalsList, comps] = await Promise.all([
      this.goals(tenantId, { employeeId: r.employeeId, cycleId: r.cycleId }),
      db.competencyRatings.findMany({ where: { tenantId, performanceReviewId: id }, orderBy: [{ raterRole: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return {
      ...item!, goalsList,
      competencies: comps.map((c) => ({ id: c.id, competency: c.competency, competencyDescription: c.competencyDescription, raterRole: c.raterRole, rating: c.rating, evidence: c.evidence })),
    };
  }

  async reviewOf(tenantId: string, cycleId: string, employeeId: string) {
    return (await this.db().performanceReviews.findFirst({ where: { tenantId, cycleId, employeeId }, select: { id: true } }))?.id ?? null;
  }

  async managerQueue(tenantId: string, managerId: string) {
    const rows = await this.db().performanceReviews.findMany({ where: { tenantId, managerEmployeeId: managerId, stage: 'AWAITING_MANAGER' }, orderBy: { selfSubmittedAt: 'asc' } });
    return this.reviewItems(this.db(), tenantId, rows);
  }

  async generate(cycleId: string) {
    const rows = await this.db().$queryRaw<{ n: number }[]>`select "HumanResources"."performanceReviewsGenerate"(${cycleId}::uuid) as n`;
    return Number(rows[0]?.n ?? 0);
  }

  async reviewStep(fn: string, id: string, data: Record<string, unknown>) {
    await this.db().$queryRawUnsafe(`select "HumanResources"."${fn}"($1::uuid, $2::jsonb)::text`, id, JSON.stringify(data));
  }

  // ---------------------------------------------------------------- goals
  private async goalItems(db: Db, tenantId: string, rows: GoalRow[]): Promise<PerfGoal[]> {
    const [refs, krs] = await Promise.all([
      employeeRefs(db, tenantId, rows.map((g) => g.employeeId)),
      db.keyResults.findMany({ where: { tenantId, goalId: { in: rows.map((g) => g.id) } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return rows.map((g) => ({
      id: g.id, employee: { id: g.employeeId, name: refs.get(g.employeeId)?.name ?? '?' }, cycleId: g.cycleId, performanceReviewId: g.performanceReviewId,
      goalKind: g.goalKind, title: g.title, description: g.description, weightPct: z0(g.weightPct), unit: g.unit, targetValue: n(g.targetValue), actualValue: n(g.actualValue),
      progressPct: z0(g.progressPct), status: g.status, sortOrder: g.sortOrder, rowVersion: g.rowVersion,
      keyResults: krs.filter((k) => k.goalId === g.id).map((k) => ({
        id: k.id, title: k.title, weightPct: n(k.weightPct), unit: k.unit, startValue: n(k.startValue), targetValue: n(k.targetValue), currentValue: n(k.currentValue),
        progressPct: z0(k.progressPct), sortOrder: k.sortOrder,
      })),
    }));
  }

  async goals(tenantId: string, q: { employeeId?: string; cycleId?: string | null }) {
    const rows = await this.db().goals.findMany({
      where: { tenantId, ...(q.employeeId && { employeeId: q.employeeId }), ...(q.cycleId !== undefined && { cycleId: q.cycleId }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    return this.goalItems(this.db(), tenantId, rows);
  }

  async goal(tenantId: string, id: string) {
    const row = await this.db().goals.findFirst({ where: { tenantId, id } });
    return row ? (await this.goalItems(this.db(), tenantId, [row]))[0]! : null;
  }

  saveGoal(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'goalAddUpdate', data);
  }

  async deleteGoal(tenantId: string, id: string, rowVersion: number) {
    const db = this.db();
    await db.keyResults.deleteMany({ where: { tenantId, goalId: id } });
    const { count } = await db.goals.deleteMany({ where: { tenantId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this goal. Reload and try again.');
  }

  // ---------------------------------------------------------------- feedback
  private async feedbackItems(db: Db, tenantId: string, rows: Prisma.PerformanceFeedbackGetPayload<object>[]): Promise<PerfFeedback[]> {
    const refs = await employeeRefs(db, tenantId, rows.flatMap((f) => [f.toEmployeeId, f.fromEmployeeId, f.requestedByEmployeeId]));
    const who = (id: string) => ({ id, name: refs.get(id)?.name ?? '?' });
    return rows.map((f) => ({
      id: f.id, to: who(f.toEmployeeId), from: who(f.fromEmployeeId), requestedBy: f.requestedByEmployeeId ? who(f.requestedByEmployeeId) : null,
      relationship: f.relationship, tag: f.tag, body: f.body, cycleId: f.cycleId, status: f.status, requestedAt: f.requestedAt?.toISOString() ?? null,
      givenAt: f.givenAt?.toISOString() ?? null, rowVersion: f.rowVersion,
    }));
  }

  async feedback(tenantId: string, q: { toEmployeeId?: string; fromEmployeeId?: string; status?: string }) {
    const rows = await this.db().performanceFeedback.findMany({
      where: { tenantId, ...(q.toEmployeeId && { toEmployeeId: q.toEmployeeId }), ...(q.fromEmployeeId && { fromEmployeeId: q.fromEmployeeId }), ...(q.status && { status: q.status }) },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return this.feedbackItems(this.db(), tenantId, rows);
  }

  async feedbackOne(tenantId: string, id: string) {
    const row = await this.db().performanceFeedback.findFirst({ where: { tenantId, id } });
    return row ? (await this.feedbackItems(this.db(), tenantId, [row]))[0]! : null;
  }

  saveFeedback(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'performanceFeedbackAddUpdate', data);
  }

  async answerFeedback(id: string, data: Record<string, unknown>) {
    await this.db().$queryRaw`select "HumanResources"."performanceFeedbackGive"(${id}::uuid, ${JSON.stringify(data)}::jsonb)::text`;
  }

  // ---------------------------------------------------------------- 1:1s
  private async meetingItems(db: Db, tenantId: string, rows: Prisma.OneOnOneMeetingsGetPayload<object>[]): Promise<PerfOneOnOne[]> {
    const refs = await employeeRefs(db, tenantId, rows.flatMap((m) => [m.employeeId, m.managerEmployeeId]));
    const who = (id: string) => ({ id, name: refs.get(id)?.name ?? '?' });
    return rows.map((m) => ({
      id: m.id, employee: who(m.employeeId), manager: who(m.managerEmployeeId), meetingDate: day(m.meetingDate)!, topic: m.topic, notes: m.notes,
      actionItems: Array.isArray(m.actionItems) ? (m.actionItems as PerfActionItem[]) : [], cycleId: m.cycleId, rowVersion: m.rowVersion,
    }));
  }

  async oneOnOnes(tenantId: string, employeeId?: string) {
    const rows = await this.db().oneOnOneMeetings.findMany({
      where: { tenantId, ...(employeeId && { OR: [{ employeeId }, { managerEmployeeId: employeeId }] }) },
      orderBy: [{ meetingDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return this.meetingItems(this.db(), tenantId, rows);
  }

  async oneOnOne(tenantId: string, id: string) {
    const row = await this.db().oneOnOneMeetings.findFirst({ where: { tenantId, id } });
    return row ? (await this.meetingItems(this.db(), tenantId, [row]))[0]! : null;
  }

  saveOneOnOne(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'oneOnOneMeetingAddUpdate', data);
  }

  async deleteOneOnOne(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.db().oneOnOneMeetings.deleteMany({ where: { tenantId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this 1:1. Reload and try again.');
  }
}
