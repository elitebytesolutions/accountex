import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import type { Coupon, CouponRedemption, PartnerOption } from '../../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../../infrastructure/prisma/references.js';
import { CouponStore } from '../application/coupon-store.js';

const include = {
  SubscriptionCouponPlans: { orderBy: { createdAt: 'asc' }, select: { id: true, planId: true } },
  _count: { select: { SubscriptionCouponRedemptions: true } },
} as const satisfies Prisma.SubscriptionCouponsInclude;
type Row = Prisma.SubscriptionCouponsGetPayload<{ include: typeof include }>;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaCouponStore extends CouponStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    return this.map(await this.prisma.db().subscriptionCoupons.findMany({ where: { deletedAt: null }, include, orderBy: [{ createdAt: 'desc' }] }));
  }

  async get(id: string) {
    const row = await this.prisma.db().subscriptionCoupons.findFirst({ where: { id, deletedAt: null }, include });
    return row ? (await this.map([row]))[0]! : null;
  }

  async allCodes() {
    const rows = await this.prisma.db().subscriptionCoupons.findMany({ select: { id: true, code: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, code: r.code.toUpperCase(), deleted: r.deletedAt !== null }));
  }

  async planExists(id: string) {
    return (await this.prisma.db().subscriptionPlans.count({ where: { id } })) > 0;
  }

  async partnerExists(id: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: bigint }[]>`select count(*) as n from "Platform"."Resellers" where id = ${id}::uuid and "deletedAt" is null`;
    return Number(rows[0]?.n ?? 0) > 0;
  }

  planLinks(id: string) {
    return this.prisma.db().subscriptionCouponPlans.findMany({ where: { couponId: id }, select: { id: true, planId: true } });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'subscriptionCouponAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'subscriptionCoupons', id, ['subscriptionCouponPlans']);
  }

  async softDelete(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().subscriptionCoupons.updateMany({ where: { id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this coupon. Reload and try again.');
  }

  async redemptions(id: string): Promise<CouponRedemption[]> {
    const rows = await this.prisma.db().subscriptionCouponRedemptions.findMany({ where: { couponId: id }, orderBy: { redeemedAt: 'desc' } });
    if (!rows.length) return [];
    const tenants = await this.prisma.db().tenants.findMany({ where: { id: { in: rows.map((r) => r.tenantId) } }, select: { id: true, displayName: true } });
    return rows.map((r) => ({
      id: r.id, tenant: { id: r.tenantId, name: tenants.find((t) => t.id === r.tenantId)?.displayName ?? '—' },
      redeemedAt: r.redeemedAt.toISOString(), discountPerInvoice: r.discountPerInvoice.toNumber(), monthsRemaining: r.monthsRemaining, status: r.status,
    }));
  }

  partners(): Promise<PartnerOption[]> {
    // Resellers belong to Phase 38; read here only for the coupon's partner select.
    return this.prisma.db().$queryRaw<PartnerOption[]>`
      select id::text as id, name from "Platform"."Resellers" where "deletedAt" is null and status = 'ACTIVE' order by name`;
  }

  private async map(rows: Row[]): Promise<Coupon[]> {
    const partnerIds = [...new Set(rows.map((r) => r.partnerId).filter((x): x is string => !!x))];
    const partners = partnerIds.length
      ? await this.prisma.db().$queryRaw<PartnerOption[]>`select id::text as id, name from "Platform"."Resellers" where id = any(${partnerIds}::uuid[])`
      : [];
    return rows.map((r) => ({
      id: r.id, code: r.code, discountType: r.discountType, discountValue: r.discountValue.toNumber(), duration: r.duration,
      redemptionCap: r.redemptionCap, startsOn: day(r.startsOn)!, expiresOn: day(r.expiresOn),
      newCustomersOnly: r.newCustomersOnly, stackableWithPartner: r.stackableWithPartner,
      partner: r.partnerId ? (partners.find((p) => p.id === r.partnerId) ?? { id: r.partnerId, name: '—' }) : null,
      status: r.status, planIds: r.SubscriptionCouponPlans.map((p) => p.planId),
      redemptions: r._count.SubscriptionCouponRedemptions, rowVersion: r.rowVersion,
    }));
  }
}
