import { Injectable } from '@nestjs/common';
import type { PayoutLine, ResellerAttribution, ResellerCommission, ResellerPayout } from '../../../../../../shared/index.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { PayoutStore } from '../application/payout-store.js';

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type Row = Omit<ResellerPayout, 'periodMonth' | 'paidOn' | 'createdAt' | 'statementLines'> & { periodMonth: Date; paidOn: Date | null; createdAt: Date; statementLines: unknown };
const SELECT = `
  select po.id, po."partnerId", r.name as "partnerName", r.tier as "partnerTier", r.city as "partnerCity", r."payoutMethod", r."bankName", r."ibanMasked",
         r.ntn, r."isActiveTaxpayer", po."periodMonth", po."tenantsCount", po."sourcedMrr"::float8 as "sourcedMrr", po."commissionPct"::float8 as "commissionPct",
         po."grossAmount"::float8 as "grossAmount", po."whtSection", po."whtRate"::float8 as "whtRate", po."whtAmount"::float8 as "whtAmount",
         po."netAmount"::float8 as "netAmount", po."statementLines", po.status, po."paidOn", po."paymentRef", po."whtCertificateNo", po."createdAt", po."rowVersion"
    from "Platform"."ResellerPayouts" po
    join "Platform"."Resellers" r on r.id = po."partnerId"`;
const toPayout = (r: Row): ResellerPayout => ({
  ...r, periodMonth: isoDay(r.periodMonth)!, paidOn: isoDay(r.paidOn), createdAt: r.createdAt.toISOString(),
  statementLines: (Array.isArray(r.statementLines) ? r.statementLines : []).map((l: PayoutLine) => ({
    ...l, mrr: Number(l.mrr), commissionPct: Number(l.commissionPct), commission: Number(l.commission),
  })),
});

@Injectable()
export class PrismaPayoutStore extends PayoutStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(q: { partnerId?: string; month?: string }) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (q.partnerId) { params.push(q.partnerId); where.push(`po."partnerId" = $${params.length}::uuid`); }
    if (q.month) { params.push(q.month); where.push(`to_char(po."periodMonth", 'YYYY-MM') = $${params.length}`); }
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(
      `${SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by po."periodMonth" desc, r.name limit 500`, ...params);
    return rows.map(toPayout);
  }

  async get(id: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where po.id = $1::uuid`, id);
    return rows[0] ? toPayout(rows[0]) : null;
  }

  async commissions(): Promise<ResellerCommission[]> {
    const rows = await this.prisma.db().$queryRaw<(Omit<ResellerCommission, 'oldestDueMonth' | 'lastPaidOn'> & { oldestDueMonth: Date | null; lastPaidOn: Date | null })[]>`
      select "partnerId", name, tenants, "sourcedMrr"::float8 as "sourcedMrr", "expectedCommission"::float8 as "expectedCommission",
             "dueGross"::float8 as "dueGross", "dueWht"::float8 as "dueWht", "dueNet"::float8 as "dueNet", "oldestDueMonth", "lastPaidOn"
        from "Platform"."getResellerCommissions" order by name`;
    return rows.map((r) => ({ ...r, oldestDueMonth: isoDay(r.oldestDueMonth), lastPaidOn: isoDay(r.lastPaidOn) }));
  }

  async calculate(monthStart: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`select "Platform"."resellerPayoutCalculate"(${monthStart}::date) as n`;
    return Number(rows[0]?.n ?? 0);
  }

  async settle(id: string, rowVersion: number, data: { status: 'PAID' | 'CANCELLED'; paidOn?: string; paymentRef?: string; whtCertificateNo?: string | null }) {
    const { count } = await this.prisma.db().resellerPayouts.updateMany({
      where: { id, rowVersion, status: 'DUE' },
      data: {
        status: data.status, ...(data.paidOn && { paidOn: new Date(`${data.paidOn}T00:00:00Z`) }), ...(data.paymentRef && { paymentRef: data.paymentRef }),
        ...(data.whtCertificateNo !== undefined && { whtCertificateNo: data.whtCertificateNo }),
      },
    });
    return count === 1;
  }

  async partner(id: string) {
    const r = await this.prisma.db().resellers.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, status: true } });
    return r ?? null;
  }

  async tenant(id: string) {
    const t = await this.prisma.db().tenants.findUnique({ where: { id }, select: { id: true, displayName: true } });
    return t ? { id: t.id, name: t.displayName } : null;
  }

  async attributions(partnerId: string): Promise<ResellerAttribution[]> {
    const rows = await this.prisma.db().$queryRaw<(Omit<ResellerAttribution, 'attributedOn' | 'endedOn'> & { attributedOn: Date; endedOn: Date | null })[]>`
      select pt.id, pt."partnerId", pt."tenantId", t.code::text as "tenantCode", t."displayName" as "tenantName", t.status as "tenantStatus",
             pt."attributedOn", pt."endedOn", pt."commissionPctOverride"::float8 as "commissionPctOverride",
             coalesce((select s."mrrAmount"::float8 from "Platform"."Subscriptions" s where s."tenantId" = pt."tenantId" and s.status in ('ACTIVE', 'PAST_DUE') limit 1), 0) as mrr,
             pt."rowVersion"
        from "Platform"."ResellerTenants" pt join "Platform"."Tenants" t on t.id = pt."tenantId"
       where pt."partnerId" = ${partnerId}::uuid
       order by (pt."endedOn" is null) desc, t."displayName"`;
    return rows.map((r) => ({ ...r, attributedOn: isoDay(r.attributedOn)!, endedOn: isoDay(r.endedOn) }));
  }

  async attributionOfTenant(tenantId: string) {
    const rows = await this.prisma.db().$queryRaw<{ id: string; partnerId: string; partnerName: string; endedOn: Date | null }[]>`
      select pt.id, pt."partnerId", r.name as "partnerName", pt."endedOn"
        from "Platform"."ResellerTenants" pt join "Platform"."Resellers" r on r.id = pt."partnerId" where pt."tenantId" = ${tenantId}::uuid`;
    return rows[0] ? { ...rows[0], endedOn: isoDay(rows[0].endedOn) } : null;
  }

  async saveAttributions(partnerId: string, tenants: Record<string, unknown>[]) {
    await addUpdate(this.prisma, 'resellerAddUpdate', { id: partnerId, tenants });
  }

  async reassign(id: string, partnerId: string, attributedOn: string, commissionPctOverride: number | null) {
    await this.prisma.db().resellerTenants.update({
      where: { id }, data: { partnerId, attributedOn: new Date(`${attributedOn}T00:00:00Z`), endedOn: null, commissionPctOverride },
    });
  }
}
