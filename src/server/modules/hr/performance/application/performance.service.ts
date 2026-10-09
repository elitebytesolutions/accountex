import { Injectable } from '@nestjs/common';
import {
  PERF_DEFAULT_COMPETENCIES, perfGoalProgress, perfGoalStatus, perfKeyResultProgress,
  type MyGoals, type PerfBoard, type PerfCalibrate, type PerfCheckIn, type PerfFeedbackAnswer, type PerfFeedbackGive, type PerfFeedbackRequest, type PerfGoal,
  type PerfGoalCreate, type PerfGoalUpdate, type PerfManagerReview, type PerfMyGoalCreate, type PerfMyOneOnOne, type PerfOneOnOneCreate, type PerfOneOnOneUpdate,
  type PerfReviewDetail, type PerfReviewQuery, type PerfSelfReview, type PerformanceCycle, type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PerformanceCyclesService } from '../../performance-cycles/application/performance-cycles.service.js';
import { PerformanceStore, type PerfEmployee } from './performance-store.js';

type GoalInput = Partial<PerfGoalCreate> & { keyResults?: PerfGoalCreate['keyResults'] };
const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const stageError = (msg: string) => new ConflictError(msg, undefined, { code: 'TALENT_STAGE_ORDER' });

/**
 * Performance: reviews per cycle (generated for eligible staff), goals with key results (progress and status derived
 * from the key results and the share of the period elapsed), competency ratings, feedback and 1:1s. HR works under
 * emp:*; My Goals (mygoal:*) reaches only the signed-in employee's own goals, review, feedback and 1:1s, plus the
 * reviews where they are the manager.
 */
@Injectable()
export class PerformanceService {
  constructor(
    private readonly store: PerformanceStore,
    private readonly cycles: PerformanceCyclesService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // ---------------------------------------------------------------- HR board & reviews
  async board(user: SessionUser, q: PerfReviewQuery): Promise<PerfBoard> {
    const all = (await this.cycles.list(user, { page: 1, pageSize: 100 })).items;
    const cycle = all.find((c) => c.id === q.cycle) ?? all.find((c) => c.status === 'ACTIVE') ?? all[0] ?? null;
    const departments = await this.store.departments(user.tenantId);
    if (!cycle) return { cycles: all, cycle: null, kpis: { eligible: 0, selfSubmitted: 0, managerSubmitted: 0, avgRating: null, goalsOnTrack: 0, goalsTotal: 0, previousAvg: null }, stageProgress: {}, reviews: [], total: 0, counts: {}, nineBox: [], departments };
    const [list, stats] = await Promise.all([this.store.reviews(user.tenantId, cycle.id, q), this.store.reviewStats(user.tenantId, cycle.id)]);
    const prev = all.filter((c) => c.id !== cycle.id && c.periodEnd < cycle.periodStart).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
    const pct = (k: number) => (stats.eligible ? Math.round((k / stats.eligible) * 100) : 0);
    const signed = list.counts.SIGNED_OFF ?? 0;
    return {
      cycles: all, cycle, departments, reviews: list.items, total: list.total, counts: list.counts, nineBox: stats.nineBox,
      kpis: { eligible: stats.eligible, selfSubmitted: stats.selfSubmitted, managerSubmitted: stats.managerSubmitted, avgRating: stats.avgRating, goalsOnTrack: stats.goalsOnTrack, goalsTotal: stats.goalsTotal, previousAvg: prev ? await this.store.avgFinalRating(user.tenantId, prev.id) : null },
      stageProgress: {
        GOAL_SETTING: stats.eligible ? 100 : 0, SELF_REVIEW: pct(stats.selfSubmitted), MANAGER_REVIEW: pct(stats.managerSubmitted),
        CALIBRATION: pct((list.counts.CALIBRATED ?? 0) + signed), SIGN_OFF: pct(signed),
      },
    };
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async generate(user: SessionUser, meta: RequestMeta, cycleId: string) {
    const added = await this.unitOfWork.run(actorContext(user, meta), () => this.store.generate(cycleId));
    return { added };
  }

  async review(user: SessionUser, id: string): Promise<PerfReviewDetail> {
    const r = await this.store.review(user.tenantId, id);
    if (!r) throw new NotFoundError('Review not found');
    return r;
  }

  async managerReview(user: SessionUser, meta: RequestMeta, id: string, input: PerfManagerReview, asManager = false) {
    const r = await this.current(user, id, input.rowVersion);
    if (asManager) {
      const me = await this.me(user);
      if (r.manager?.id !== me.id) throw new ForbiddenError('Only the employee’s reviewing manager can submit this review.');
    }
    if (r.stage !== 'AWAITING_MANAGER') throw stageError(r.stage === 'SELF_PENDING' ? 'The employee hasn’t submitted their self-review yet.' : 'The manager review is already submitted.');
    const goalAchievementPct = input.goalAchievementPct ?? this.weighted(r.goalsList);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.reviewStep('performanceReviewSubmitManager', id, { ...input, goalAchievementPct }));
    return this.review(user, id);
  }

  async calibrate(user: SessionUser, meta: RequestMeta, id: string, input: PerfCalibrate) {
    const r = await this.current(user, id, input.rowVersion);
    if (!['REVIEWED', 'CALIBRATED'].includes(r.stage)) throw stageError(r.stage === 'SIGNED_OFF' ? 'This review is signed off.' : 'Calibrate after the manager review.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.reviewStep('performanceReviewCalibrate', id, input));
    return this.review(user, id);
  }

  async signOff(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.current(user, id, rowVersion);
    if (r.stage !== 'CALIBRATED') throw stageError(r.stage === 'SIGNED_OFF' ? 'This review is already signed off.' : 'Calibrate the review before sign-off.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.reviewStep('performanceReviewSignOff', id, { rowVersion }));
    return this.review(user, id);
  }

  // ---------------------------------------------------------------- goals
  async goals(user: SessionUser, q: { employeeId?: string; cycleId?: string }) {
    return this.store.goals(user.tenantId, q);
  }

  async createGoal(user: SessionUser, meta: RequestMeta, input: PerfGoalCreate) {
    const emp = await this.store.employee(user.tenantId, input.employeeId);
    if (!emp) throw new ValidationError('Choose an employee', { employeeId: ['Not found'] });
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => this.store.saveGoal(await this.goalRow(user, input.employeeId, input, null)));
    return this.goal(user, id);
  }

  async updateGoal(user: SessionUser, meta: RequestMeta, id: string, input: PerfGoalUpdate, ownerId?: string) {
    const g = await this.goal(user, id);
    if (ownerId && g.employee.id !== ownerId) throw new NotFoundError('Goal not found');
    if (g.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this goal. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), async () => this.store.saveGoal({ ...(await this.goalRow(user, g.employee.id, input, g)), id, rowVersion: input.rowVersion }));
    return this.goal(user, id);
  }

  async deleteGoal(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.goal(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteGoal(user.tenantId, id, rowVersion));
  }

  private async goal(user: SessionUser, id: string): Promise<PerfGoal> {
    const g = await this.store.goal(user.tenantId, id);
    if (!g) throw new NotFoundError('Goal not found');
    return g;
  }

  /** The row saved for a goal: key-result progress from their values, goal progress and status derived, linked to the cycle's review. */
  private async goalRow(user: SessionUser, employeeId: string, input: GoalInput, existing: PerfGoal | null) {
    const cycleId = input.cycleId !== undefined ? input.cycleId : existing?.cycleId ?? (await this.activeCycle(user))?.id ?? null;
    const krs = (input.keyResults ?? existing?.keyResults ?? []).map((k, i) => ({ ...k, progressPct: perfKeyResultProgress({ startValue: k.startValue ?? null, targetValue: k.targetValue ?? null, currentValue: k.currentValue ?? null, progressPct: k.progressPct ?? 0 }), sortOrder: i }));
    const progress = Math.min(100, perfGoalProgress(krs, input.progressPct ?? existing?.progressPct ?? 0));
    const cycle = cycleId ? await this.cycles.get(user, cycleId).catch(() => null) : null;
    const dropped = input.dropped ?? existing?.status === 'DROPPED';
    const row: Record<string, unknown> = strip({
      employeeId, cycleId, goalKind: input.goalKind, title: input.title, description: input.description, weightPct: input.weightPct, unit: input.unit,
      targetValue: input.targetValue, actualValue: input.actualValue, progressPct: progress,
      status: dropped ? 'DROPPED' : perfGoalStatus(progress, cycle ? await this.expected(user, cycle) : 50),
      ...(input.keyResults !== undefined && { keyResults: krs.map((k) => strip({ ...k, id: k.id })) }),
    });
    if (cycleId && !existing?.performanceReviewId) row.performanceReviewId = await this.store.reviewOf(user.tenantId, cycleId, employeeId);
    return row;
  }

  // ---------------------------------------------------------------- feedback
  async feedback(user: SessionUser, q: { employeeId?: string }) {
    return this.store.feedback(user.tenantId, { toEmployeeId: q.employeeId });
  }

  async requestFeedback(user: SessionUser, meta: RequestMeta, input: PerfFeedbackRequest, forEmployee?: PerfEmployee) {
    const to = forEmployee ?? (input.toEmployeeId ? await this.store.employee(user.tenantId, input.toEmployeeId) : null);
    if (!to) throw new ValidationError('Choose who the feedback is about', { toEmployeeId: ['Required'] });
    if (input.fromEmployeeIds.includes(to.id)) throw new ValidationError('Pick colleagues other than the employee', { fromEmployeeIds: ['Not themselves'] });
    const requester = forEmployee ?? (await this.store.employeeOfUser(user.tenantId, user.id));
    const cycleId = input.cycleId ?? (await this.activeCycle(user))?.id ?? null;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const from of input.fromEmployeeIds) {
        await this.store.saveFeedback(strip({ toEmployeeId: to.id, fromEmployeeId: from, requestedByEmployeeId: requester?.id ?? null, relationship: input.relationship ?? undefined, cycleId }));
      }
    });
    return this.store.feedback(user.tenantId, { toEmployeeId: to.id });
  }

  async giveFeedback(user: SessionUser, meta: RequestMeta, input: PerfFeedbackGive, from?: PerfEmployee) {
    const giver = from ?? (input.fromEmployeeId ? await this.store.employee(user.tenantId, input.fromEmployeeId) : await this.store.employeeOfUser(user.tenantId, user.id));
    if (!giver) throw new ValidationError('Choose who the feedback is from', { fromEmployeeId: ['Required'] });
    if (giver.id === input.toEmployeeId) throw new ValidationError('Feedback is for someone else', { toEmployeeId: ['Not yourself'] });
    const cycleId = input.cycleId ?? (await this.activeCycle(user))?.id ?? null;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveFeedback(strip({ toEmployeeId: input.toEmployeeId, fromEmployeeId: giver.id, relationship: input.relationship ?? undefined, tag: input.tag, body: input.body, cycleId })));
    return (await this.store.feedbackOne(user.tenantId, id))!;
  }

  async answerFeedback(user: SessionUser, meta: RequestMeta, id: string, input: PerfFeedbackAnswer, asGiver?: PerfEmployee) {
    const f = await this.store.feedbackOne(user.tenantId, id);
    if (!f || (asGiver && f.from.id !== asGiver.id)) throw new NotFoundError('Feedback request not found');
    if (f.status !== 'REQUESTED') throw new ConflictError('This feedback request was already answered.', undefined, { code: 'REQUEST_NOT_PENDING' });
    if (f.rowVersion !== input.rowVersion) throw new ConcurrencyError('This request was changed. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.answerFeedback(id, input));
    return (await this.store.feedbackOne(user.tenantId, id))!;
  }

  // ---------------------------------------------------------------- 1:1s
  oneOnOnes(user: SessionUser, employeeId?: string) {
    return this.store.oneOnOnes(user.tenantId, employeeId);
  }

  async createOneOnOne(user: SessionUser, meta: RequestMeta, input: PerfOneOnOneCreate) {
    const cycleId = input.cycleId ?? (await this.activeCycle(user))?.id ?? null;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveOneOnOne(strip({ ...input, cycleId })));
    return (await this.store.oneOnOne(user.tenantId, id))!;
  }

  async updateOneOnOne(user: SessionUser, meta: RequestMeta, id: string, input: PerfOneOnOneUpdate, participant?: string) {
    const m = await this.store.oneOnOne(user.tenantId, id);
    if (!m || (participant && m.employee.id !== participant && m.manager.id !== participant)) throw new NotFoundError('1:1 not found');
    if (m.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this 1:1. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveOneOnOne(strip({ ...input, id })));
    return (await this.store.oneOnOne(user.tenantId, id))!;
  }

  async deleteOneOnOne(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.store.oneOnOne(user.tenantId, id))) throw new NotFoundError('1:1 not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteOneOnOne(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- My Goals (own data only)
  async myGoals(user: SessionUser): Promise<MyGoals> {
    const me = await this.me(user);
    const cycle = await this.activeCycle(user);
    const [manager, reviewId, goals, oneOnOnes, received, toGive, team, colleagues] = await Promise.all([
      me.managerId ? this.store.employee(user.tenantId, me.managerId) : null,
      cycle ? this.store.reviewOf(user.tenantId, cycle.id, me.id) : null,
      this.store.goals(user.tenantId, { employeeId: me.id, ...(cycle && { cycleId: cycle.id }) }),
      this.store.oneOnOnes(user.tenantId, me.id),
      this.store.feedback(user.tenantId, { toEmployeeId: me.id, status: 'GIVEN' }),
      this.store.feedback(user.tenantId, { fromEmployeeId: me.id, status: 'REQUESTED' }),
      this.store.managerQueue(user.tenantId, me.id),
      this.store.colleagues(user.tenantId, me.id),
    ]);
    return {
      employee: { id: me.id, name: me.name, designation: me.designation }, manager: manager ? { id: manager.id, name: manager.name, designation: manager.designation } : null,
      cycle, expectedPct: cycle ? await this.expected(user, cycle) : 0, review: reviewId ? await this.store.review(user.tenantId, reviewId) : null,
      goals, oneOnOnes, feedbackReceived: received, feedbackToGive: toGive, teamReviews: team, colleagues,
      competencies: PERF_DEFAULT_COMPETENCIES.map(([competency, description]) => ({ competency, description })),
    };
  }

  async createMyGoal(user: SessionUser, meta: RequestMeta, input: PerfMyGoalCreate) {
    const me = await this.me(user);
    return this.createGoal(user, meta, { ...input, employeeId: me.id });
  }

  async updateMyGoal(user: SessionUser, meta: RequestMeta, id: string, input: PerfGoalUpdate) {
    const me = await this.me(user);
    return this.updateGoal(user, meta, id, input, me.id);
  }

  /** Check-in: new progress for key results (or goals without key results) of my own goals. */
  async checkIn(user: SessionUser, meta: RequestMeta, input: PerfCheckIn) {
    const me = await this.me(user);
    const byGoal = new Map<string, PerfCheckIn['items']>();
    for (const i of input.items) byGoal.set(i.goalId, [...(byGoal.get(i.goalId) ?? []), i]);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const [goalId, items] of byGoal) {
        const g = await this.store.goal(user.tenantId, goalId);
        if (!g || g.employee.id !== me.id) throw new NotFoundError('Goal not found');
        if (g.status === 'DROPPED') continue;
        const krs = g.keyResults.map((k) => {
          const hit = items.find((i) => i.keyResultId === k.id);
          if (!hit) return k;
          // progress set by hand: the current value follows it when the key result has a target
          const cur = k.targetValue != null ? (k.startValue ?? 0) + ((k.targetValue - (k.startValue ?? 0)) * hit.progressPct) / 100 : k.currentValue;
          return { ...k, progressPct: hit.progressPct, currentValue: cur };
        });
        const own = items.find((i) => !i.keyResultId)?.progressPct;
        await this.store.saveGoal({ ...(await this.goalRow(user, me.id, { keyResults: krs.map((k) => ({ ...k, weightPct: k.weightPct, unit: k.unit })), ...(own !== undefined && { progressPct: own }) }, g)), id: g.id });
      }
    });
    return this.myGoals(user);
  }

  async selfReview(user: SessionUser, meta: RequestMeta, id: string, input: PerfSelfReview) {
    const me = await this.me(user);
    const r = await this.current(user, id, input.rowVersion);
    if (r.employee.id !== me.id) throw new NotFoundError('Review not found');
    if (r.stage !== 'SELF_PENDING') throw stageError('Your self-review is already submitted.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.reviewStep('performanceReviewSubmitSelf', id, input));
    return this.myGoals(user);
  }

  async myReview(user: SessionUser, id: string) {
    const me = await this.me(user);
    const r = await this.review(user, id);
    if (r.employee.id !== me.id && r.manager?.id !== me.id) throw new NotFoundError('Review not found');
    return r;
  }

  async myManagerReview(user: SessionUser, meta: RequestMeta, id: string, input: PerfManagerReview) {
    await this.managerReview(user, meta, id, input, true);
    return this.myGoals(user);
  }

  async myFeedbackRequest(user: SessionUser, meta: RequestMeta, input: PerfFeedbackRequest) {
    const me = await this.me(user);
    await this.requestFeedback(user, meta, { ...input, toEmployeeId: me.id }, me);
    return this.myGoals(user);
  }

  async myFeedbackGive(user: SessionUser, meta: RequestMeta, input: PerfFeedbackGive) {
    const me = await this.me(user);
    await this.giveFeedback(user, meta, { ...input, fromEmployeeId: me.id }, me);
    return this.myGoals(user);
  }

  async myFeedbackAnswer(user: SessionUser, meta: RequestMeta, id: string, input: PerfFeedbackAnswer) {
    await this.answerFeedback(user, meta, id, input, await this.me(user));
    return this.myGoals(user);
  }

  async myOneOnOne(user: SessionUser, meta: RequestMeta, input: PerfMyOneOnOne) {
    const me = await this.me(user);
    if (input.withEmployeeId === me.id) throw new ValidationError('Choose someone else', { withEmployeeId: ['Not yourself'] });
    // the one I report to is the manager side; otherwise I lead the 1:1
    const iReport = me.managerId === input.withEmployeeId;
    await this.createOneOnOne(user, meta, {
      employeeId: iReport ? me.id : input.withEmployeeId, managerEmployeeId: iReport ? input.withEmployeeId : me.id,
      meetingDate: input.meetingDate, topic: input.topic, notes: input.notes, actionItems: input.actionItems, cycleId: null,
    });
    return this.myGoals(user);
  }

  async myActionItems(user: SessionUser, meta: RequestMeta, id: string, input: { actionItems: { text: string; done: boolean }[]; rowVersion: number }) {
    const me = await this.me(user);
    await this.updateOneOnOne(user, meta, id, { actionItems: input.actionItems, rowVersion: input.rowVersion }, me.id);
    return this.myGoals(user);
  }

  // ---------------------------------------------------------------- helpers
  private async activeCycle(user: SessionUser): Promise<PerformanceCycle | null> {
    const all = (await this.cycles.list(user, { page: 1, pageSize: 100 })).items;
    return all.find((c) => c.status === 'ACTIVE') ?? null;
  }

  private async expected(user: SessionUser, c: PerformanceCycle) {
    const today = await this.store.today(user.tenantId);
    const span = Date.parse(c.periodEnd) - Date.parse(c.periodStart);
    if (span <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((Date.parse(today) - Date.parse(c.periodStart)) / span) * 100)));
  }

  private weighted(goals: PerfGoal[]) {
    const live = goals.filter((g) => g.status !== 'DROPPED');
    const w = live.reduce((s, g) => s + g.weightPct, 0);
    return w ? Math.round(live.reduce((s, g) => s + g.progressPct * g.weightPct, 0) / w) : null;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.review(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this review. Reload and try again.');
    return r;
  }

  private async me(user: SessionUser) {
    const me = await this.store.employeeOfUser(user.tenantId, user.id);
    if (!me) throw new ForbiddenError('Your user isn’t linked to an employee record. Ask HR to link it.');
    return me;
  }
}

