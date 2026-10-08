import { Injectable } from '@nestjs/common';
import {
  mrrMovement, SUBSCRIPTION_LIVE,
  type AdminSession, type RenewalRunResult, type Subscription, type SubscriptionCancel, type SubscriptionChangePlan, type SubscriptionCreate,
  type SubscriptionDetail, type SubscriptionExtendTrial, type SubscriptionList,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { addDays, cycleAmount, mrrOf, periodEnd, todayPk } from '../domain/billing.js';
import { SubscriptionStore, type PlanForBilling } from './subscription-store.js';

const notLive = () => new ConflictError('This subscription is no longer live.', undefined, { code: 'SUBSCRIPTION_NOT_LIVE' });
const stale = () => new ConcurrencyError('Someone else changed this subscription. Reload and try again.');

/**
 * Subscriptions (Super Admin › Billing › Subscriptions). Every change writes a SubscriptionEvents row with the MRR
 * before / after and its movement, in the same transaction as the change.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly store: SubscriptionStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(): Promise<SubscriptionList> {
    const items = await this.store.list();
    const today = todayPk();
    const live = items.filter((s) => SUBSCRIPTION_LIVE.includes(s.status));
    const paying = live.filter((s) => s.status !== 'TRIAL');
    return {
      items,
      kpis: {
        mrr: Math.round(paying.reduce((a, s) => a + mrrOf(s.amount, s.billingCycle, s.status), 0) * 100) / 100,
        annualContracts: paying.filter((s) => s.billingCycle === 'ANNUAL').length,
        renewals30d: live.filter((s) => s.nextRenewalOn && s.nextRenewalOn >= today && s.nextRenewalOn <= addDays(today, 30)).length,
        pastDue: live.filter((s) => s.status === 'PAST_DUE').length,
        trials: live.filter((s) => s.status === 'TRIAL').length,
      },
      trialsExpiring: live.filter((s) => s.status === 'TRIAL' && s.trialEndsOn && s.trialEndsOn <= addDays(today, 14)).sort((a, b) => (a.trialEndsOn! < b.trialEndsOn! ? -1 : 1)),
      movement: await this.store.movement(addDays(today, -30)),
    };
  }

  async get(id: string): Promise<SubscriptionDetail> {
    const s = await this.store.get(id);
    if (!s) throw new NotFoundError('Subscription not found');
    return { ...s, events: await this.store.events(id) };
  }

  async create(admin: AdminSession, meta: RequestMeta, input: SubscriptionCreate): Promise<SubscriptionDetail> {
    const status = await this.store.tenantStatus(input.tenantId);
    if (!status) throw new ValidationError('Choose an existing company', { tenantId: ['Unknown company'] });
    if (status === 'CHURNED') throw new ConflictError('This company has churned. Reactivate it first.', undefined, { code: 'TENANT_STATUS_ORDER' });
    if (await this.store.liveForTenant(input.tenantId)) {
      throw new ConflictError('This company already has a live subscription. Change its plan instead.', undefined, { code: 'SUBSCRIPTION_EXISTS' });
    }
    const plan = await this.activePlan(input.planId);
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.start(admin, { tenantId: input.tenantId, plan, cycle: input.billingCycle, trial: input.startTrial, seats: input.seats, paymentMethod: input.paymentMethod ?? null }));
    return this.get(id);
  }

  /**
   * Starts a subscription inside the caller's transaction (onboarding uses it too): a trial of the plan's trial days,
   * or a paid period from today. Writes TRIAL_STARTED (no MRR) or CREATED (NEW MRR).
   */
  async start(admin: AdminSession, o: { tenantId: string; plan: PlanForBilling; cycle: string; trial: boolean; seats?: number; paymentMethod: string | null }): Promise<string> {
    const today = todayPk();
    const trial = o.trial && o.plan.trialDays > 0;
    const amount = cycleAmount(o.plan, o.cycle);
    const end = trial ? addDays(today, o.plan.trialDays - 1) : periodEnd(today, o.cycle);
    const status = trial ? 'TRIAL' : 'ACTIVE';
    const id = await this.store.insert({
      tenantId: o.tenantId, planId: o.plan.id, billingCycle: o.cycle, amount, seats: o.seats ?? o.plan.userSeats, startsOn: today,
      trialEndsOn: trial ? end : null, currentPeriodStart: today, currentPeriodEnd: end, nextRenewalOn: addDays(end, 1), status,
      paymentMethod: o.paymentMethod,
    });
    const mrr = mrrOf(amount, o.cycle, status);
    await this.store.addEvent({
      subscriptionId: id, tenantId: o.tenantId, eventType: trial ? 'TRIAL_STARTED' : 'CREATED', toPlanId: o.plan.id, toSeats: o.seats ?? o.plan.userSeats,
      mrrBefore: 0, mrrAfter: mrr, movement: mrrMovement(0, mrr), staffUserId: admin.staffId,
      note: trial ? `${o.plan.trialDays}-day trial` : null,
    });
    return id;
  }

  /** New plan / cycle / seats from today; the change is an EXPANSION or CONTRACTION of MRR (none while in trial). */
  async changePlan(admin: AdminSession, meta: RequestMeta, id: string, input: SubscriptionChangePlan): Promise<SubscriptionDetail> {
    const s = await this.live(id, input.rowVersion);
    const plan = await this.activePlan(input.planId);
    const cycle = input.billingCycle ?? s.billingCycle;
    const seats = input.seats ?? s.seats;
    if (plan.id === s.planId && cycle === s.billingCycle && seats === s.seats) throw new ValidationError('Nothing to change', { planId: ['Same plan, cycle and seats'] });
    const amount = cycleAmount(plan, cycle);
    const before = mrrOf(s.amount, s.billingCycle, s.status);
    const after = mrrOf(amount, cycle, s.status);
    const today = todayPk();
    const cycleChanged = cycle !== s.billingCycle && s.status !== 'TRIAL';
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const ok = await this.store.update(id, input.rowVersion, {
        planId: plan.id, billingCycle: cycle, amount, seats,
        ...(cycleChanged && { currentPeriodStart: today, currentPeriodEnd: periodEnd(today, cycle), nextRenewalOn: addDays(periodEnd(today, cycle), 1) }),
      });
      if (!ok) throw stale();
      await this.store.addEvent({
        subscriptionId: id, tenantId: s.tenantId, eventType: plan.id !== s.planId ? 'PLAN_CHANGED' : 'SEATS_CHANGED', fromPlanId: s.planId, toPlanId: plan.id,
        fromSeats: s.seats, toSeats: seats, mrrBefore: before, mrrAfter: after, movement: mrrMovement(before, after), staffUserId: admin.staffId, note: input.note ?? null,
      });
    });
    return this.get(id);
  }

  /** At period end: CANCEL_SCHEDULED (stays live); now: CANCELLED with a CHURN of its MRR. */
  async cancel(admin: AdminSession, meta: RequestMeta, id: string, input: SubscriptionCancel): Promise<SubscriptionDetail> {
    const s = await this.live(id, input.rowVersion);
    const before = mrrOf(s.amount, s.billingCycle, s.status);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const ok = await this.store.update(id, input.rowVersion, input.atPeriodEnd
        ? { cancelAtPeriodEnd: true, autoRenew: false, cancelReason: input.reason }
        : { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason, autoRenew: false, nextRenewalOn: null });
      if (!ok) throw stale();
      await this.store.addEvent({
        subscriptionId: id, tenantId: s.tenantId, eventType: input.atPeriodEnd ? 'CANCEL_SCHEDULED' : 'CANCELLED', fromPlanId: s.planId,
        mrrBefore: before, mrrAfter: input.atPeriodEnd ? before : 0, movement: input.atPeriodEnd ? 'NONE' : mrrMovement(before, 0),
        staffUserId: admin.staffId, note: input.reason,
      });
    });
    return this.get(id);
  }

  /** Ends the current period and starts the next (a trial converts to ACTIVE: NEW MRR). */
  async renew(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number, note?: string): Promise<SubscriptionDetail> {
    const s = await this.live(id, rowVersion);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.renewInTx(admin, s, note));
    return this.get(id);
  }

  async extendTrial(admin: AdminSession, meta: RequestMeta, id: string, input: SubscriptionExtendTrial): Promise<SubscriptionDetail> {
    const s = await this.live(id, input.rowVersion);
    if (s.status !== 'TRIAL') throw new ConflictError('Only a trial can be extended.', undefined, { code: 'SUBSCRIPTION_NOT_LIVE' });
    const end = addDays(s.trialEndsOn ?? s.currentPeriodEnd, input.days);
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const ok = await this.store.update(id, input.rowVersion, { trialEndsOn: end, currentPeriodEnd: end, nextRenewalOn: addDays(end, 1) });
      if (!ok) throw stale();
      await this.store.addEvent({
        subscriptionId: id, tenantId: s.tenantId, eventType: 'TRIAL_EXTENDED', toPlanId: s.planId, mrrBefore: 0, mrrAfter: 0, movement: 'NONE',
        trialDaysAdded: input.days, staffUserId: admin.staffId, note: `Trial now ends ${end}`,
      });
    });
    return this.get(id);
  }

  /**
   * "Run renewals": every live subscription whose period (or trial) has ended. Scheduled cancellations expire, trials
   * with auto-renew convert, others renew for a new period. Logged as the Super Admin who ran it.
   */
  async runRenewals(admin: AdminSession, meta: RequestMeta): Promise<RenewalRunResult> {
    const due = await this.store.due(todayPk());
    const result: RenewalRunResult = { renewed: 0, converted: 0, expired: 0, ids: [] };
    for (const s of due) {
      await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
        if (s.cancelAtPeriodEnd || !s.autoRenew) {
          const before = mrrOf(s.amount, s.billingCycle, s.status);
          if (!(await this.store.update(s.id, s.rowVersion, { status: 'EXPIRED', nextRenewalOn: null }))) throw stale();
          await this.store.addEvent({ subscriptionId: s.id, tenantId: s.tenantId, eventType: 'EXPIRED', fromPlanId: s.planId, mrrBefore: before, mrrAfter: 0, movement: mrrMovement(before, 0), staffUserId: admin.staffId });
          result.expired += 1;
        } else {
          const converted = await this.renewInTx(admin, s);
          if (converted) result.converted += 1; else result.renewed += 1;
        }
      });
      result.ids.push(s.id);
    }
    return result;
  }

  private async renewInTx(admin: AdminSession, s: Subscription, note?: string): Promise<boolean> {
    const today = todayPk();
    const trial = s.status === 'TRIAL';
    const start = trial ? today : addDays(s.currentPeriodEnd, 1) > today ? addDays(s.currentPeriodEnd, 1) : today;
    const end = periodEnd(start, s.billingCycle);
    const status = trial || s.status === 'PAST_DUE' ? 'ACTIVE' : s.status;
    if (!(await this.store.update(s.id, s.rowVersion, { status, currentPeriodStart: start, currentPeriodEnd: end, nextRenewalOn: addDays(end, 1), ...(trial && { trialEndsOn: s.trialEndsOn }) }))) throw stale();
    const before = mrrOf(s.amount, s.billingCycle, s.status);
    const after = mrrOf(s.amount, s.billingCycle, status);
    await this.store.addEvent({
      subscriptionId: s.id, tenantId: s.tenantId, eventType: trial ? 'TRIAL_CONVERTED' : 'RENEWED', toPlanId: s.planId, mrrBefore: before, mrrAfter: after,
      movement: mrrMovement(before, after), staffUserId: admin.staffId, note: note ?? `Period ${start} – ${end}`,
    });
    return trial;
  }

  private async activePlan(id: string) {
    const plan = await this.store.plan(id);
    if (!plan) throw new ValidationError('Choose an existing plan', { planId: ['Unknown plan'] });
    if (plan.status !== 'ACTIVE') throw new ValidationError('This plan is retired: choose an active plan', { planId: ['Retired plan'] });
    return plan;
  }

  private async live(id: string, rowVersion: number) {
    const s = await this.store.get(id);
    if (!s) throw new NotFoundError('Subscription not found');
    if (!SUBSCRIPTION_LIVE.includes(s.status)) throw notLive();
    if (s.rowVersion !== rowVersion) throw stale();
    return s;
  }
}
