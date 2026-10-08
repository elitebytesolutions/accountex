import { Injectable } from '@nestjs/common';
import type { Subscription, SubscriptionEvent } from '../../../../../../shared/index.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import {
  SubscriptionStore, type NewSubscription, type NewSubscriptionEvent, type PlanForBilling, type SubscriptionWrite,
} from '../application/subscription-store.js';

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const dayOrNull = (s: string | null | undefined) => (s ? day(s) : s === null ? null : undefined);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type Row = {
  id: string; tenantId: string; tenantCode: string; tenantName: string; planId: string; planCode: string; planName: string; billingCycle: string;
  amount: string; seats: number | null; startsOn: Date; trialEndsOn: Date | null; currentPeriodStart: Date; currentPeriodEnd: Date;
  nextRenewalOn: Date | null; paymentMethod: string | null; autoRenew: boolean; status: string; cancelledAt: Date | null; cancelReason: string | null;
  cancelAtPeriodEnd: boolean; mrrAmount: string | null; rowVersion: number;
};
const toSubscription = (r: Row): Subscription => ({
  id: r.id, tenantId: r.tenantId, tenantCode: r.tenantCode, tenantName: r.tenantName, planId: r.planId, planCode: r.planCode, planName: r.planName,
  billingCycle: r.billingCycle, amount: Number(r.amount), seats: r.seats, startsOn: iso(r.startsOn)!, trialEndsOn: iso(r.trialEndsOn),
  currentPeriodStart: iso(r.currentPeriodStart)!, currentPeriodEnd: iso(r.currentPeriodEnd)!, nextRenewalOn: iso(r.nextRenewalOn),
  paymentMethod: r.paymentMethod, autoRenew: r.autoRenew, status: r.status, cancelledAt: r.cancelledAt?.toISOString() ?? null,
  cancelReason: r.cancelReason, cancelAtPeriodEnd: r.cancelAtPeriodEnd, mrrAmount: Number(r.mrrAmount ?? 0), rowVersion: r.rowVersion,
});
const toData = (d: SubscriptionWrite) => ({
  ...(d.planId !== undefined && { planId: d.planId }),
  ...(d.billingCycle !== undefined && { billingCycle: d.billingCycle }),
  ...(d.amount !== undefined && { amount: d.amount }),
  ...(d.seats !== undefined && { seats: d.seats }),
  ...(d.trialEndsOn !== undefined && { trialEndsOn: dayOrNull(d.trialEndsOn) }),
  ...(d.currentPeriodStart !== undefined && { currentPeriodStart: day(d.currentPeriodStart) }),
  ...(d.currentPeriodEnd !== undefined && { currentPeriodEnd: day(d.currentPeriodEnd) }),
  ...(d.nextRenewalOn !== undefined && { nextRenewalOn: dayOrNull(d.nextRenewalOn) }),
  ...(d.paymentMethod !== undefined && { paymentMethod: d.paymentMethod }),
  ...(d.autoRenew !== undefined && { autoRenew: d.autoRenew }),
  ...(d.status !== undefined && { status: d.status }),
  ...(d.cancelledAt !== undefined && { cancelledAt: d.cancelledAt }),
  ...(d.cancelReason !== undefined && { cancelReason: d.cancelReason }),
  ...(d.cancelAtPeriodEnd !== undefined && { cancelAtPeriodEnd: d.cancelAtPeriodEnd }),
});

const SELECT = `
  select s.id, s."tenantId", t.code::text as "tenantCode", t."displayName" as "tenantName", s."planId", p.code as "planCode", p.name as "planName",
         s."billingCycle", s.amount::text, s.seats, s."startsOn", s."trialEndsOn", s."currentPeriodStart", s."currentPeriodEnd", s."nextRenewalOn",
         s."paymentMethod", s."autoRenew", s.status, s."cancelledAt", s."cancelReason", s."cancelAtPeriodEnd", s."mrrAmount"::text, s."rowVersion"
    from "Platform"."Subscriptions" s
    join "Platform"."Tenants" t on t.id = s."tenantId"
    join "Platform"."SubscriptionPlans" p on p.id = s."planId"`;

@Injectable()
export class PrismaSubscriptionStore extends SubscriptionStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} order by (s.status in ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')) desc, s."nextRenewalOn" nulls last, t."displayName"`);
    return rows.map(toSubscription);
  }

  async get(id: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where s.id = $1::uuid`, id);
    return rows[0] ? toSubscription(rows[0]) : null;
  }

  async liveForTenant(tenantId: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where s."tenantId" = $1::uuid and s.status in ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')`, tenantId);
    return rows[0] ? toSubscription(rows[0]) : null;
  }

  async events(id: string): Promise<SubscriptionEvent[]> {
    const rows = await this.prisma.db().$queryRaw<{
      id: string; eventType: string; occurredAt: Date; effectiveOn: Date; fromPlan: string | null; toPlan: string | null; fromSeats: number | null;
      toSeats: number | null; mrrBefore: string; mrrAfter: string; mrrDelta: string | null; movement: string; trialDaysAdded: number | null;
      note: string | null; staff: string | null;
    }[]>`
      select e.id, e."eventType", e."occurredAt", e."effectiveOn", fp.code as "fromPlan", tp.code as "toPlan", e."fromSeats", e."toSeats",
             e."mrrBefore"::text, e."mrrAfter"::text, e."mrrDelta"::text, e.movement, e."trialDaysAdded", e.note, st."fullName" as staff
        from "Platform"."SubscriptionEvents" e
        left join "Platform"."SubscriptionPlans" fp on fp.id = e."fromPlanId"
        left join "Platform"."SubscriptionPlans" tp on tp.id = e."toPlanId"
        left join "Platform"."PlatformStaff" st on st.id = e."staffUserId"
       where e."subscriptionId" = ${id}::uuid
       order by e."occurredAt" desc, e."createdAt" desc`;
    return rows.map((r) => ({
      id: r.id, eventType: r.eventType, occurredAt: r.occurredAt.toISOString(), effectiveOn: iso(r.effectiveOn)!, fromPlan: r.fromPlan, toPlan: r.toPlan,
      fromSeats: r.fromSeats, toSeats: r.toSeats, mrrBefore: Number(r.mrrBefore), mrrAfter: Number(r.mrrAfter), mrrDelta: num(r.mrrDelta),
      movement: r.movement, trialDaysAdded: r.trialDaysAdded, note: r.note, staff: r.staff,
    }));
  }

  async plan(id: string): Promise<PlanForBilling | null> {
    const p = await this.prisma.db().subscriptionPlans.findUnique({
      where: { id }, select: { id: true, code: true, name: true, status: true, priceMonthly: true, priceAnnual: true, trialDays: true, userSeats: true },
    });
    return p ? { ...p, priceMonthly: Number(p.priceMonthly), priceAnnual: num(p.priceAnnual), trialDays: Number(p.trialDays) } : null;
  }

  async tenantStatus(tenantId: string) {
    return (await this.prisma.db().tenants.findUnique({ where: { id: tenantId }, select: { status: true } }))?.status ?? null;
  }

  async insert(d: NewSubscription) {
    const row = await this.prisma.db().subscriptions.create({
      data: { ...toData(d), tenantId: d.tenantId, planId: d.planId, billingCycle: d.billingCycle, amount: d.amount, startsOn: day(d.startsOn),
        currentPeriodStart: day(d.currentPeriodStart), currentPeriodEnd: day(d.currentPeriodEnd), status: d.status },
      select: { id: true },
    });
    return row.id;
  }

  async update(id: string, rowVersion: number, d: SubscriptionWrite) {
    const { count } = await this.prisma.db().subscriptions.updateMany({ where: { id, rowVersion }, data: toData(d) });
    return count === 1;
  }

  async addEvent(e: NewSubscriptionEvent) {
    await this.prisma.db().subscriptionEvents.create({
      data: {
        subscriptionId: e.subscriptionId, tenantId: e.tenantId, eventType: e.eventType, ...(e.effectiveOn && { effectiveOn: day(e.effectiveOn) }),
        fromPlanId: e.fromPlanId ?? null, toPlanId: e.toPlanId ?? null, fromSeats: e.fromSeats ?? null, toSeats: e.toSeats ?? null,
        mrrBefore: e.mrrBefore, mrrAfter: e.mrrAfter, movement: e.movement, trialDaysAdded: e.trialDaysAdded ?? null,
        staffUserId: e.staffUserId, note: e.note ?? null,
      },
    });
  }

  async due(today: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(
      `${SELECT} where s.status in ('TRIAL','ACTIVE','PAST_DUE') and (coalesce(s."nextRenewalOn", s."currentPeriodEnd") <= $1::date or (s.status = 'TRIAL' and s."trialEndsOn" <= $1::date))
       order by s."nextRenewalOn"`, today);
    return rows.map(toSubscription);
  }

  async movement(since: string) {
    const rows = await this.prisma.db().$queryRaw<{ movement: string; amount: string; count: bigint }[]>`
      select movement, sum("mrrAfter" - "mrrBefore")::text as amount, count(*) as count
        from "Platform"."SubscriptionEvents" where "effectiveOn" >= ${since}::date and movement <> 'NONE' group by movement`;
    return rows.map((r) => ({ movement: r.movement, amount: Number(r.amount), count: Number(r.count) }));
  }
}
