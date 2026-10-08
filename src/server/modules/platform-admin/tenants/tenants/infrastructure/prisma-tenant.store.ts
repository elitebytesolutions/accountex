import { Injectable } from '@nestjs/common';
import type { SeedReport, TenantDetail, TenantListItem, TenantListQuery } from '../../../../../../shared/index.js';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { TenantStore, type TenantWrite } from '../application/tenant-store.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type ListRow = {
  tenantId: string; code: string; displayName: string; legalName: string; city: string | null; province: string | null; industry: string | null;
  status: string; isInternal: boolean; healthScore: number | null; healthBucket: string | null; isAtRisk: boolean | null; subscriptionId: string | null;
  planId: string | null; planCode: string | null; planName: string | null; billingCycle: string | null; subscriptionStatus: string | null;
  mrr: string; seats: number | null; seatsInUse: number | null; modulesEnabled: number; moduleKeys: string[] | null; renewalOn: Date | null;
  trialEndsOn: Date | null; pastDueAmount: string; ownerContactName: string | null; ownerContactEmail: string | null; lastActiveAt: Date | null; createdAt: Date;
};

const VIEW_FILTER: Record<TenantListQuery['view'], string> = {
  all: 'true',
  trial: `t.status = 'TRIAL'`,
  risk: `t."isAtRisk"`,
  pastdue: `(t.status = 'PAST_DUE' or t."pastDueAmount" > 0)`,
  suspended: `t.status in ('SUSPENDED', 'READ_ONLY')`,
};

@Injectable()
export class PrismaTenantStore extends TenantStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(q: TenantListQuery) {
    const db = this.prisma.db();
    const where: string[] = [VIEW_FILTER[q.view]];
    const args: unknown[] = [];
    const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };
    if (q.search) where.push(`(t."displayName" ilike ${arg(`%${q.search}%`)} or t.code::text ilike ${arg(`%${q.search}%`)} or t."ownerContactEmail"::text ilike ${arg(`%${q.search}%`)})`);
    if (q.status) where.push(`t.status = ${arg(q.status)}`);
    if (q.plan) where.push(`t."planCode" = ${arg(q.plan)}`);
    if (q.province) where.push(`t.province = ${arg(q.province)}`);
    if (q.city) where.push(`t.city ilike ${arg(q.city)}`);
    const sql = `from "Platform"."getAllTenants" t where ${where.join(' and ')}`;
    const [rows, total] = await Promise.all([
      db.$queryRawUnsafe<ListRow[]>(`select t.*, t.mrr::text as mrr, t."pastDueAmount"::text as "pastDueAmount" ${sql} order by t."displayName" limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`, ...args),
      db.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n ${sql}`, ...args),
    ]);
    const all = await db.$queryRaw<{ status: string; isAtRisk: boolean | null; pastDue: boolean; seats: number | null; seatsInUse: number | null; mrr: string; province: string | null; subscriptionStatus: string | null }[]>`
      select status, "isAtRisk", (status = 'PAST_DUE' or "pastDueAmount" > 0) as "pastDue", seats, "seatsInUse", mrr::text, province, "subscriptionStatus"
        from "Platform"."getAllTenants"`;
    const regions = new Map<string | null, number>();
    for (const t of all) if (t.status !== 'CHURNED') regions.set(t.province, (regions.get(t.province) ?? 0) + 1);
    return {
      items: rows.map((r): TenantListItem => ({
        id: r.tenantId, code: r.code, displayName: r.displayName, legalName: r.legalName, city: r.city, province: r.province, industry: r.industry,
        status: r.status, isInternal: r.isInternal, healthScore: r.healthScore, healthBucket: r.healthBucket, isAtRisk: !!r.isAtRisk,
        subscriptionId: r.subscriptionId, planId: r.planId, planCode: r.planCode, planName: r.planName, billingCycle: r.billingCycle,
        subscriptionStatus: r.subscriptionStatus, mrr: Number(r.mrr), seats: r.seats, seatsInUse: r.seatsInUse, modulesEnabled: r.modulesEnabled,
        moduleKeys: r.moduleKeys ?? [], renewalOn: isoDay(r.renewalOn), trialEndsOn: isoDay(r.trialEndsOn), pastDueAmount: Number(r.pastDueAmount),
        ownerContactName: r.ownerContactName, ownerContactEmail: r.ownerContactEmail, lastActiveAt: iso(r.lastActiveAt), createdAt: r.createdAt.toISOString(),
      })),
      total: Number(total[0]?.n ?? 0),
      kpis: {
        live: all.filter((t) => ['ACTIVE', 'PAST_DUE', 'READ_ONLY'].includes(t.status)).length,
        trial: all.filter((t) => t.status === 'TRIAL').length,
        atRisk: all.filter((t) => t.isAtRisk).length,
        pastDue: all.filter((t) => t.pastDue).length,
        seats: all.reduce((a, t) => a + (t.seats ?? 0), 0),
        seatsInUse: all.reduce((a, t) => a + (t.seatsInUse ?? 0), 0),
        mrr: Math.round(all.filter((t) => t.subscriptionStatus && t.subscriptionStatus !== 'TRIAL').reduce((a, t) => a + Number(t.mrr), 0) * 100) / 100,
      },
      regions: [...regions].map(([province, count]) => ({ province, count })).sort((a, b) => b.count - a.count),
    };
  }

  async detail(id: string): Promise<TenantDetail | null> {
    const db = this.prisma.db();
    const t = await db.tenants.findUnique({ where: { id } });
    if (!t) return null;
    const [tpl, contacts, modules, notes, users] = await Promise.all([
      t.coaTemplateId ? db.chartOfAccountsTemplates.findUnique({ where: { id: t.coaTemplateId }, select: { name: true } }) : null,
      db.tenantContacts.findMany({ where: { tenantId: id }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }),
      db.tenantModules.findMany({ where: { tenantId: id }, orderBy: { moduleKey: 'asc' } }),
      db.$queryRaw<{ id: string; body: string; author: string | null; createdAt: Date }[]>`
        select n.id, n.body, s."fullName" as author, n."createdAt" from "Platform"."TenantNotes" n
          left join "Platform"."PlatformStaff" s on s.id = n."authorStaffId"
         where n."tenantId" = ${id}::uuid and n."deletedAt" is null order by n."createdAt" desc limit 50`,
      db.$queryRaw<{ id: string; fullName: string; email: string; status: string; lastLoginAt: Date | null; roles: string[] | null }[]>`
        select u.id, u."fullName", u.email::text, u.status, u."lastLoginAt",
               array_remove(array_agg(r.name::text order by r.name), null) as roles
          from "Company"."Users" u
          left join "Company"."UserRoles" ur on ur."userId" = u.id and ur."tenantId" = u."tenantId"
          left join "Company"."Roles" r on r.id = ur."roleId" and r."deletedAt" is null
         where u."tenantId" = ${id}::uuid and u."deletedAt" is null and u.status <> 'REMOVED'
         group by u.id order by u."fullName"`,
    ]);
    return {
      id: t.id, code: t.code, subdomain: t.subdomain, displayName: t.displayName, legalName: t.legalName, ntn: t.ntn, strn: t.strn, secpRegNo: t.secpRegNo,
      industry: t.industry, country: t.country, city: t.city, province: t.province, address: t.address, phone: t.phone, email: t.email,
      fiscalYearStartMonth: t.fiscalYearStartMonth, baseCurrency: t.baseCurrency, timezone: t.timezone, numberFormat: t.numberFormat, dateFormat: t.dateFormat,
      dataResidency: t.dataResidency, coaTemplateId: t.coaTemplateId, coaTemplateName: tpl?.name ?? null, requireMfa: t.requireMfa, allowSso: t.allowSso,
      defaultLanguage: t.defaultLanguage, status: t.status, healthScore: t.healthScore, trialEndsOn: isoDay(t.trialEndsOn), activatedAt: iso(t.activatedAt),
      lastActiveAt: iso(t.lastActiveAt), suspendedAt: iso(t.suspendedAt), suspensionReason: t.suspensionReason, churnedAt: iso(t.churnedAt),
      churnReason: t.churnReason, isBeta: t.isBeta, isInternal: t.isInternal, salesTaxRegistered: t.salesTaxRegistered ?? false, createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(), rowVersion: t.rowVersion, defaultUserId: t.defaultUserId,
      contacts: contacts.map((c) => ({ id: c.id, contactRole: c.contactRole, fullName: c.fullName, designation: c.designation, email: c.email, mobile: c.mobile, cnic: c.cnic, language: c.language, isPrimary: c.isPrimary, rowVersion: c.rowVersion })),
      modules: modules.map((m) => ({ id: m.id, moduleKey: m.moduleKey, enabled: m.enabled, source: m.source, enabledAt: m.enabledAt.toISOString() })),
      notes: notes.map((n) => ({ id: n.id, body: n.body, author: n.author, createdAt: n.createdAt.toISOString() })),
      users: users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, status: u.status, roles: u.roles ?? [], lastLoginAt: iso(u.lastLoginAt), isDefault: u.id === t.defaultUserId })),
    };
  }

  async codeTaken(code: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: bigint }[]>`
      select count(*) as n from "Platform"."Tenants" where code = ${code}::citext or subdomain = ${code}::citext`;
    return Number(rows[0]?.n ?? 0) > 0;
  }

  async coaTemplateUsable(id: string) {
    return !!(await this.prisma.db().chartOfAccountsTemplates.findFirst({ where: { id, status: { in: ['DEFAULT', 'PUBLISHED'] } }, select: { id: true } }));
  }

  async defaultCoaTemplate() {
    return this.prisma.db().chartOfAccountsTemplates.findFirst({ where: { status: 'DEFAULT' }, select: { id: true, name: true } });
  }

  async applyChartTemplate(tenantId: string, templateId: string) {
    const db = this.prisma.db();
    // applyChartTemplate reads the company from app.tenantId: set it for this call, then restore the admin context's value.
    const [prev] = await db.$queryRaw<{ v: string | null }[]>`select current_setting('app.tenantId', true) as v`;
    await db.$executeRaw`select set_config('app.tenantId', ${tenantId}, true)`;
    try {
      const rows = await db.$queryRaw<{ n: number }[]>`select "Accounting"."applyChartTemplate"(${templateId}::uuid) as n`;
      return Number(rows[0]?.n ?? 0);
    } finally {
      await db.$executeRaw`select set_config('app.tenantId', ${prev?.v ?? ''}, true)`;
    }
  }

  async planModules(planId: string) {
    return this.prisma.db().subscriptionPlanFeatures.findMany({ where: { planId }, select: { moduleKey: true, inclusion: true } });
  }

  async provision(p: { code: string; name: string; legalName: string; email: string; adminName: string; passwordHash: string }) {
    const rows = await this.prisma.db().$queryRaw<{ id: string }[]>`
      select "Platform"."provisionTenant"(${p.code}, ${p.name}, ${p.legalName}, ${p.email}, ${p.adminName}, ${p.passwordHash})::text as id`;
    return rows[0]!.id;
  }

  async resetFiscalYear(tenantId: string, startMonth: number) {
    const db = this.prisma.db();
    await db.$executeRaw`delete from "Accounting"."FiscalPeriods" where "tenantId" = ${tenantId}::uuid`;
    await db.$executeRaw`delete from "Accounting"."FiscalYears" where "tenantId" = ${tenantId}::uuid`;
    await db.$queryRaw`select "Accounting"."createFiscalYearFor"(${tenantId}::uuid, "Accounting"."currentFiscalYearStart"(${startMonth}::int), false)::text as id`;
  }

  async update(id: string, rowVersion: number | null, d: TenantWrite) {
    const data: Prisma.TenantsUpdateManyMutationInput = {
      ...Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== undefined && k !== 'trialEndsOn')),
      ...(d.trialEndsOn !== undefined && { trialEndsOn: d.trialEndsOn ? new Date(`${d.trialEndsOn}T00:00:00Z`) : null }),
    };
    const { count } = await this.prisma.db().tenants.updateMany({ where: { id, ...(rowVersion !== null && { rowVersion }) }, data });
    return count === 1;
  }

  async addContact(tenantId: string, c: { contactRole: string; fullName: string; designation: string | null; email: string; mobile: string | null; cnic?: string | null; language: string; isPrimary: boolean }) {
    await this.prisma.db().tenantContacts.create({ data: { tenantId, ...c, cnic: c.cnic ?? null } });
  }

  async setModules(tenantId: string, modules: { moduleKey: string; enabled: boolean; source: string }[]) {
    const db = this.prisma.db();
    const existing = await db.tenantModules.findMany({ where: { tenantId } });
    for (const m of modules) {
      const row = existing.find((e) => e.moduleKey === m.moduleKey);
      if (!row) await db.tenantModules.create({ data: { tenantId, moduleKey: m.moduleKey, enabled: m.enabled, source: m.source } });
      else if (row.enabled !== m.enabled) await db.tenantModules.update({ where: { id: row.id }, data: { enabled: m.enabled, ...(m.enabled && { enabledAt: new Date(), source: m.source }) } });
    }
  }

  async addNote(tenantId: string, staffId: string, body: string) {
    await this.prisma.db().tenantNotes.create({ data: { tenantId, authorStaffId: staffId, body } });
  }

  async applySeeds(tenantId: string, leave: boolean, salary: boolean, tax: boolean): Promise<SeedReport> {
    const rows = await this.prisma.db().$queryRaw<{ r: SeedReport }[]>`
      select "Platform"."tenantApplySeedTemplates"(${tenantId}::uuid, null, ${leave}, ${salary}, ${tax}) as r`;
    const r = rows[0]!.r;
    return { seedVersion: r.seedVersion, leaveTypes: num(r.leaveTypes) ?? 0, salaryComponents: num(r.salaryComponents) ?? 0, taxCodes: num(r.taxCodes) ?? 0, skipped: r.skipped ?? [] };
  }

  async revokeSessions(tenantId: string, reason: string) {
    const { count } = await this.prisma.db().userSessions.updateMany({
      where: { tenantId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return count;
  }
}
