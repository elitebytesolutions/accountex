import { Injectable } from '@nestjs/common';
import type { InvoiceChip, InvoiceKpis, InvoiceListQuery, PlatformInvoice, PlatformInvoiceDetail, PlatformInvoiceLine } from '../../../../../../shared/index.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { InvoiceStore, type DueSubscription } from '../application/invoice-store.js';

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const OVERDUE = `(i.status in ('OPEN', 'PARTIALLY_PAID') and i."balanceAmount" > 0 and i."dueOn" < $1::date)`;

type Row = {
  id: string; docNo: string | null; tenantId: string; tenantCode: string; tenantName: string; subscriptionId: string | null; invoiceKind: string;
  description: string; periodStart: Date | null; periodEnd: Date | null; issuedOn: Date; dueOn: Date; currencyCode: string; grossAmount: number;
  discountAmount: number; netAmount: number; taxAuthorityId: string | null; taxAuthorityCode: string | null; taxAuthorityName: string | null; taxRate: number;
  taxAmount: number; totalAmount: number; paidAmount: number; balanceAmount: number; status: string; overdue: boolean; daysOverdue: number;
  couponId: string | null; couponCode: string | null; voidedAt: Date | null; voidReason: string | null; dunningStage: string | null; dunningCaseId: string | null;
  createdAt: Date; rowVersion: number;
};
/** $1 = today (overdue is computed against the platform's business day). */
const SELECT = `
  select i.id, i."docNo", i."tenantId", t.code::text as "tenantCode", t."displayName" as "tenantName", i."subscriptionId", i."invoiceKind", i.description,
         i."periodStart", i."periodEnd", i."issuedOn", i."dueOn", i."currencyCode"::text as "currencyCode",
         i."grossAmount"::float8 as "grossAmount", i."discountAmount"::float8 as "discountAmount", i."netAmount"::float8 as "netAmount",
         i."taxAuthorityId", a.code as "taxAuthorityCode", a.name as "taxAuthorityName", i."taxRate"::float8 as "taxRate", i."taxAmount"::float8 as "taxAmount",
         i."totalAmount"::float8 as "totalAmount", i."paidAmount"::float8 as "paidAmount", i."balanceAmount"::float8 as "balanceAmount", i.status,
         ${OVERDUE} as overdue, case when ${OVERDUE} then ($1::date - i."dueOn") else 0 end as "daysOverdue",
         i."couponId", c.code::text as "couponCode", i."voidedAt", i."voidReason", dc.stage as "dunningStage", dc.id as "dunningCaseId", i."createdAt", i."rowVersion"
    from "Platform"."PlatformInvoices" i
    join "Platform"."Tenants" t on t.id = i."tenantId"
    left join "Platform"."TaxMasterAuthorities" a on a.id = i."taxAuthorityId"
    left join "Platform"."SubscriptionCoupons" c on c.id = i."couponId"
    left join "Platform"."DunningCases" dc on dc."platformInvoiceId" = i.id`;

const toInvoice = (r: Row): PlatformInvoice => ({
  id: r.id, docNo: r.docNo, tenantId: r.tenantId, tenantCode: r.tenantCode, tenantName: r.tenantName, subscriptionId: r.subscriptionId,
  invoiceKind: r.invoiceKind, description: r.description, periodStart: isoDay(r.periodStart), periodEnd: isoDay(r.periodEnd),
  issuedOn: isoDay(r.issuedOn)!, dueOn: isoDay(r.dueOn)!, currencyCode: r.currencyCode, grossAmount: r.grossAmount, discountAmount: r.discountAmount,
  netAmount: r.netAmount, taxAuthorityId: r.taxAuthorityId, taxAuthorityCode: r.taxAuthorityCode, taxRate: r.taxRate, taxAmount: r.taxAmount,
  totalAmount: r.totalAmount, paidAmount: r.paidAmount, balanceAmount: r.balanceAmount, status: r.status, overdue: r.overdue, daysOverdue: Number(r.daysOverdue),
  couponId: r.couponId, couponCode: r.couponCode, voidedAt: r.voidedAt?.toISOString() ?? null, voidReason: r.voidReason, dunningStage: r.dunningStage,
  createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
});

const CHIP_SQL: Record<InvoiceChip, string> = {
  all: 'true',
  PAID: `i.status = 'PAID'`,
  OPEN: `i.status in ('OPEN', 'PARTIALLY_PAID') and not ${OVERDUE}`,
  OVERDUE,
  VOID: `i.status = 'VOID'`,
  DRAFT: `i.status = 'DRAFT'`,
};

@Injectable()
export class PrismaInvoiceStore extends InvoiceStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(q: InvoiceListQuery, today: string) {
    const params: unknown[] = [today];
    const where: string[] = [];
    if (q.month) { params.push(q.month); where.push(`to_char(i."issuedOn", 'YYYY-MM') = $${params.length}`); }
    if (q.tenantId) { params.push(q.tenantId); where.push(`i."tenantId" = $${params.length}::uuid`); }
    if (q.search) {
      params.push(`%${q.search}%`);
      where.push(`(i."docNo" ilike $${params.length} or t."displayName" ilike $${params.length} or t.code::text ilike $${params.length} or i.description ilike $${params.length})`);
    }
    const base = where.length ? where.join(' and ') : 'true';
    const chips = Object.keys(CHIP_SQL) as InvoiceChip[];
    const countRows = await this.prisma.db().$queryRawUnsafe<Record<string, bigint>[]>(
      `select ${chips.map((c) => `count(*) filter (where ${CHIP_SQL[c]}) as "${c}"`).join(', ')}
         from "Platform"."PlatformInvoices" i join "Platform"."Tenants" t on t.id = i."tenantId" where ${base}`, ...params);
    const counts = Object.fromEntries(chips.map((c) => [c, Number(countRows[0]?.[c] ?? 0)])) as Record<InvoiceChip, number>;
    params.push(q.pageSize, (q.page - 1) * q.pageSize);
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(
      `${SELECT} where ${base} and ${CHIP_SQL[q.status]}
        order by i."issuedOn" desc, i."docNo" desc nulls first, i."createdAt" desc
        limit $${params.length - 1} offset $${params.length}`, ...params);
    return { items: rows.map(toInvoice), total: counts[q.status], counts };
  }

  async kpis(month: string): Promise<InvoiceKpis> {
    const rows = await this.prisma.db().$queryRaw<{
      billed: number | null; billedTax: number | null; collected: number | null; collectionRatePct: number | null; openCount: number | null;
      openAmount: number | null; overdueCount: number | null; overdueAmount: number | null;
    }[]>`
      select billed::float8 as billed, "billedTax"::float8 as "billedTax", collected::float8 as collected, "collectionRatePct"::float8 as "collectionRatePct",
             "openCount", "openAmount"::float8 as "openAmount", "overdueCount", "overdueAmount"::float8 as "overdueAmount"
        from "Platform"."getPlatformBillingByMonth" where to_char(month, 'YYYY-MM') = ${month}`;
    const r = rows[0];
    return {
      month, billed: r?.billed ?? 0, billedTax: r?.billedTax ?? 0, collected: r?.collected ?? 0, collectionRatePct: r?.collectionRatePct ?? null,
      openCount: r?.openCount ?? 0, openAmount: r?.openAmount ?? 0, overdueCount: r?.overdueCount ?? 0, overdueAmount: r?.overdueAmount ?? 0,
    };
  }

  async months() {
    const rows = await this.prisma.db().$queryRaw<{ m: string }[]>`
      select distinct to_char("issuedOn", 'YYYY-MM') as m from "Platform"."PlatformInvoices" order by 1 desc limit 24`;
    return rows.map((r) => r.m);
  }

  async get(id: string, today: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where i.id = $2::uuid`, today, id);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async detail(id: string, today: string): Promise<Omit<PlatformInvoiceDetail, 'payments'> | null> {
    const rows = await this.prisma.db().$queryRawUnsafe<Row[]>(`${SELECT} where i.id = $2::uuid`, today, id);
    const r = rows[0];
    if (!r) return null;
    const [lines, tenant] = await Promise.all([
      this.prisma.db().platformInvoiceLines.findMany({ where: { platformInvoiceId: id }, orderBy: { lineNo: 'asc' } }),
      this.prisma.db().tenants.findUnique({ where: { id: r.tenantId }, select: { legalName: true, ntn: true, strn: true, address: true, city: true, province: true, email: true } }),
    ]);
    return {
      ...toInvoice(r),
      lines: lines.map((l): PlatformInvoiceLine => ({
        id: l.id, lineNo: l.lineNo, lineKind: l.lineKind, description: l.description, planId: l.planId, addonId: l.addonId,
        quantity: l.quantity.toNumber(), unitPrice: l.unitPrice.toNumber(), amount: l.amount.toNumber(), periodStart: isoDay(l.periodStart), periodEnd: isoDay(l.periodEnd),
      })),
      dunningCaseId: r.dunningCaseId,
      taxAuthorityName: r.taxAuthorityName,
      tenant: {
        legalName: tenant?.legalName ?? r.tenantName, ntn: tenant?.ntn ?? null, strn: tenant?.strn ?? null, address: tenant?.address ?? null,
        city: tenant?.city ?? null, province: tenant?.province ?? null, email: tenant?.email ?? null,
      },
    };
  }

  async tenantExists(tenantId: string) {
    return !!(await this.prisma.db().tenants.findUnique({ where: { id: tenantId }, select: { id: true } }));
  }

  async tenantTax(tenantId: string, onDate: string) {
    const rows = await this.prisma.db().$queryRaw<{ authorityId: string | null; rate: number | null }[]>`
      select a.id as "authorityId",
             (select r.rate::float8 from "Platform"."TaxMasterSalesTaxRates" r
               where r."taxAuthorityId" = a.id and r.status = 'ACTIVE' and r."effectiveFrom" <= ${onDate}::date and (r."effectiveTo" is null or r."effectiveTo" >= ${onDate}::date)
               order by (r."appliesTo" ~* '(software|computer|\\mIT\\M|services)') desc, r."effectiveFrom" desc limit 1) as rate
        from "Platform"."Tenants" t
        left join "Platform"."TaxMasterAuthorities" a
          on a.jurisdiction = case t.province when 'PUNJAB' then 'PUNJAB' when 'SINDH' then 'SINDH' when 'KPK' then 'KPK'
                                              when 'BALOCHISTAN' then 'BALOCHISTAN' when 'ICT' then 'FEDERAL' end
       where t.id = ${tenantId}::uuid`;
    return { authorityId: rows[0]?.authorityId ?? null, rate: rows[0]?.rate ?? 0 };
  }

  async subscriptionPeriod(tenantId: string) {
    const s = await this.prisma.db().subscriptions.findFirst({
      where: { tenantId, status: { in: ['ACTIVE', 'PAST_DUE', 'SUSPENDED'] } }, orderBy: { startsOn: 'desc' }, select: { currentPeriodStart: true },
    });
    return isoDay(s?.currentPeriodStart ?? null);
  }

  async couponByCode(code: string) {
    const c = await this.prisma.db().subscriptionCoupons.findFirst({ where: { code: { equals: code, mode: 'insensitive' }, deletedAt: null }, select: { id: true } });
    return c?.id ?? null;
  }

  async dueSubscriptions(today: string): Promise<DueSubscription[]> {
    const rows = await this.prisma.db().$queryRaw<{ subscriptionId: string; tenantId: string; tenantName: string; periodStart: Date }[]>`
      select s.id as "subscriptionId", s."tenantId", t."displayName" as "tenantName", s."currentPeriodStart" as "periodStart"
        from "Platform"."Subscriptions" s
        join "Platform"."Tenants" t on t.id = s."tenantId"
       where s.status in ('ACTIVE', 'PAST_DUE', 'SUSPENDED') and s."currentPeriodStart" <= ${today}::date
         and t.status not in ('CHURNED', 'PROVISIONING')
         and not exists (select 1 from "Platform"."PlatformInvoices" i
                          where i."subscriptionId" = s.id and i."invoiceKind" = 'SUBSCRIPTION' and i."periodStart" = s."currentPeriodStart" and i.status <> 'VOID')
       order by t."displayName"`;
    return rows.map((r) => ({ ...r, periodStart: isoDay(r.periodStart)! }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'platformInvoiceAddUpdate', data);
  }

  async issue(id: string) {
    const rows = await this.prisma.db().$queryRaw<{ doc: string }[]>`select "Platform"."platformInvoiceIssue"(${id}::uuid) as doc`;
    return rows[0]!.doc;
  }

  async voidInvoice(id: string, reason: string) {
    await this.prisma.db().$queryRaw`select "Platform"."platformInvoiceVoid"(${id}::uuid, ${reason})::text`;
  }

  async generate(tenantId: string, periodStart: string, couponId: string | null) {
    const rows = await this.prisma.db().$queryRaw<{ id: string }[]>`
      select "Platform"."platformInvoiceGenerate"(${tenantId}::uuid, ${periodStart}::date, ${couponId}::uuid)::text as id`;
    return rows[0]!.id;
  }
}
