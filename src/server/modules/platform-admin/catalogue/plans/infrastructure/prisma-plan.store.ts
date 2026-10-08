import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import type { SubscriptionPlan, UsageMeterOption } from '../../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../../infrastructure/prisma/references.js';
import { PlanStore } from '../application/plan-store.js';

const include = {
  SubscriptionPlanFeatures: { orderBy: { createdAt: 'asc' } },
  SubscriptionPlanLimits: { orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.SubscriptionPlansInclude;
type Row = Prisma.SubscriptionPlansGetPayload<{ include: typeof include }>;
const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
/** Subscription statuses that still bill or can come back (Platform.Subscriptions). */
const LIVE = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'];

@Injectable()
export class PrismaPlanStore extends PlanStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    const rows = await this.prisma.db().subscriptionPlans.findMany({ include, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return this.map(rows);
  }

  async get(id: string) {
    const row = await this.prisma.db().subscriptionPlans.findUnique({ where: { id }, include });
    return row ? (await this.map([row]))[0]! : null;
  }

  allCodes() {
    return this.prisma.db().subscriptionPlans.findMany({ select: { id: true, code: true } });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'subscriptionPlanAddUpdate', data);
  }

  activePublicCount(exceptId: string) {
    return this.prisma.db().subscriptionPlans.count({ where: { status: 'ACTIVE', isPublic: true, id: { not: exceptId } } });
  }

  async copyLinks(fromPlanId: string, toPlanId: string) {
    const db = this.prisma.db();
    const [modulePlans, addonPlans, couponPlans] = await Promise.all([
      db.platformModulePlans.findMany({ where: { planId: fromPlanId, PlatformModules: { deletedAt: null } }, select: { platformModuleId: true, isIncluded: true } }),
      db.addonPlans.findMany({ where: { planId: fromPlanId, Addons: { deletedAt: null } }, select: { addonId: true, availability: true } }),
      db.subscriptionCouponPlans.findMany({ where: { planId: fromPlanId, SubscriptionCoupons: { deletedAt: null } }, select: { couponId: true } }),
    ]);
    // Deleted modules / add-ons / coupons are not linked to the new version.
    // Row by row (not createMany) so each new row gets its own history entry from the audit trigger.
    for (const m of modulePlans) await db.platformModulePlans.create({ data: { ...m, planId: toPlanId } });
    for (const a of addonPlans) await db.addonPlans.create({ data: { ...a, planId: toPlanId } });
    for (const c of couponPlans) await db.subscriptionCouponPlans.create({ data: { ...c, planId: toPlanId } });
    const minimums = await db.platformModules.findMany({ where: { minPlanId: fromPlanId, deletedAt: null }, select: { id: true } });
    for (const m of minimums) await db.platformModules.update({ where: { id: m.id }, data: { minPlanId: toPlanId } });
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'subscriptionPlans', id, [
      'subscriptionPlanFeatures', 'subscriptionPlanLimits', 'platformModulePlans', 'addonPlans', 'subscriptionCouponPlans',
    ]);
  }

  async remove(id: string, rowVersion: number) {
    const db = this.prisma.db();
    await db.subscriptionPlanFeatures.deleteMany({ where: { planId: id } });
    await db.subscriptionPlanLimits.deleteMany({ where: { planId: id } });
    await db.platformModulePlans.deleteMany({ where: { planId: id } });
    await db.addonPlans.deleteMany({ where: { planId: id } });
    await db.subscriptionCouponPlans.deleteMany({ where: { planId: id } });
    const { count } = await db.subscriptionPlans.deleteMany({ where: { id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this plan. Reload and try again.');
  }

  async usageMeters(): Promise<UsageMeterOption[]> {
    // UsageMeters belongs to Phase 40 (usage metering); read here only to offer limits.
    return this.prisma.db().$queryRaw<UsageMeterOption[]>`
      select id::text as id, code, name, unit, icon from "Platform"."UsageMeters" where "isActive" order by "sortOrder", name`;
  }

  private async map(rows: Row[]): Promise<SubscriptionPlan[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const counts = await this.prisma.db().$queryRaw<{ planId: string; live: bigint; total: bigint }[]>`
      select "planId"::text as "planId", count(*) filter (where status = any(${LIVE}::text[])) as live, count(*) as total
        from "Platform"."Subscriptions" where "planId" = any(${ids}::uuid[]) group by "planId"`;
    return rows.map((r) => {
      const c = counts.find((x) => x.planId === r.id);
      return {
        id: r.id, code: r.code, name: r.name, tagline: r.tagline,
        priceMonthly: r.priceMonthly.toNumber(), priceAnnual: num(r.priceAnnual), extraSeatPrice: num(r.extraSeatPrice), isCustomPrice: r.isCustomPrice,
        userSeats: r.userSeats, storageGb: r.storageGb, trialDays: r.trialDays, sortOrder: r.sortOrder, isPublic: r.isPublic, status: r.status,
        supportChannel: r.supportChannel, supportResponseHours: r.supportResponseHours, slaUptimePct: num(r.slaUptimePct),
        features: r.SubscriptionPlanFeatures.map((f) => ({ id: f.id, moduleKey: f.moduleKey, inclusion: f.inclusion, addonPrice: num(f.addonPrice) })),
        limits: r.SubscriptionPlanLimits.map((l) => ({ id: l.id, usageMeterId: l.usageMeterId, limitValue: num(l.limitValue), overagePrice: num(l.overagePrice) })),
        subscribers: Number(c?.live ?? 0), hasSubscriptions: Number(c?.total ?? 0) > 0,
        createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
      };
    });
  }
}
