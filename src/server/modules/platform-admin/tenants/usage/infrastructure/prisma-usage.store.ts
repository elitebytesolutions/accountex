import { Injectable } from '@nestjs/common';
import type { UsageOverride, UsageRow } from '../../../../../../shared/index.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { UsageStore } from '../application/usage-store.js';

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type OverrideRow = {
  id: string; tenantId: string; tenantName: string; meterId: string; meterName: string; previousLimit: string | null; limitValue: string; expiryMode: string;
  expiresOn: Date | null; billOverage: string; customPrice: string | null; reason: string; appliedBy: string | null; revokedAt: Date | null; createdAt: Date; rowVersion: number;
};
const OVERRIDES = `
  select o.id, o."tenantId", t."displayName" as "tenantName", o."usageMeterId" as "meterId", m.name as "meterName", o."previousLimit"::text,
         o."limitValue"::text, o."expiryMode", o."expiresOn", o."billOverage", o."customPrice"::text, o.reason, s."fullName" as "appliedBy",
         o."revokedAt", o."createdAt", o."rowVersion"
    from "Platform"."UsageLimitOverrides" o
    join "Platform"."Tenants" t on t.id = o."tenantId"
    join "Platform"."UsageMeters" m on m.id = o."usageMeterId"
    left join "Platform"."PlatformStaff" s on s.id = o."appliedByStaffId"`;
const toOverride = (r: OverrideRow): UsageOverride => ({
  id: r.id, tenantId: r.tenantId, tenantName: r.tenantName, meterId: r.meterId, meterName: r.meterName, previousLimit: num(r.previousLimit),
  limitValue: Number(r.limitValue), expiryMode: r.expiryMode, expiresOn: isoDay(r.expiresOn), billOverage: r.billOverage, customPrice: num(r.customPrice),
  reason: r.reason, appliedBy: r.appliedBy, revokedAt: r.revokedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
});

@Injectable()
export class PrismaUsageStore extends UsageStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async meters() {
    const rows = await this.prisma.db().usageMeters.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
    return rows.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit, icon: m.icon, resetPeriod: m.resetPeriod, sortOrder: m.sortOrder }));
  }

  async current(tenantId?: string): Promise<UsageRow[]> {
    const rows = await this.prisma.db().$queryRawUnsafe<{
      tenantId: string; tenantCode: string; tenantName: string; planCode: string | null; usageMeterId: string; meterCode: string; meterName: string;
      unit: string | null; snapshotDate: Date; usedValue: string; limitValue: string | null; planLimitValue: string | null; overrideLimitValue: string | null;
      overrideExpiresOn: Date | null; pct: string | null; band: string;
    }[]>(`select u."tenantId", u."tenantCode"::text, u."tenantName", u."planCode", u."usageMeterId", u."meterCode", u."meterName", u.unit, u."snapshotDate",
                 u."usedValue"::text, u."limitValue"::text, u."planLimitValue"::text, u."overrideLimitValue"::text, u."overrideExpiresOn", u.pct::text, u.band
            from "Platform"."getCurrentUsage" u join "Platform"."UsageMeters" m on m.id = u."usageMeterId"
           where m."isActive" ${tenantId ? 'and u."tenantId" = $1::uuid' : ''}
           order by u."tenantName", m."sortOrder"`, ...(tenantId ? [tenantId] : []));
    return rows.map((r) => ({
      tenantId: r.tenantId, tenantCode: r.tenantCode, tenantName: r.tenantName, planCode: r.planCode, meterId: r.usageMeterId, meterCode: r.meterCode,
      meterName: r.meterName, unit: r.unit, snapshotDate: isoDay(r.snapshotDate)!, usedValue: Number(r.usedValue), limitValue: num(r.limitValue),
      planLimitValue: num(r.planLimitValue), overrideLimitValue: num(r.overrideLimitValue), overrideExpiresOn: isoDay(r.overrideExpiresOn), pct: num(r.pct), band: r.band,
    }));
  }

  async overrides(liveOnly: boolean) {
    const rows = await this.prisma.db().$queryRawUnsafe<OverrideRow[]>(
      `${OVERRIDES} ${liveOnly ? `where o."revokedAt" is null and (o."expiresOn" is null or o."expiresOn" >= current_date)` : ''} order by o."createdAt" desc limit 200`);
    return rows.map(toOverride);
  }

  async override(id: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<OverrideRow[]>(`${OVERRIDES} where o.id = $1::uuid`, id);
    return rows[0] ? toOverride(rows[0]) : null;
  }

  async liveOverride(tenantId: string, meterId: string) {
    const rows = await this.prisma.db().$queryRawUnsafe<OverrideRow[]>(
      `${OVERRIDES} where o."tenantId" = $1::uuid and o."usageMeterId" = $2::uuid and o."revokedAt" is null`, tenantId, meterId);
    return rows[0] ? toOverride(rows[0]) : null;
  }

  async tenantExists(tenantId: string) {
    return !!(await this.prisma.db().tenants.findUnique({ where: { id: tenantId }, select: { id: true } }));
  }

  async periodEnd(tenantId: string) {
    const s = await this.prisma.db().subscriptions.findFirst({ where: { tenantId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] } }, select: { currentPeriodEnd: true } });
    return isoDay(s?.currentPeriodEnd ?? null);
  }

  async currentLimit(tenantId: string, meterId: string) {
    const rows = await this.prisma.db().$queryRaw<{ v: string | null }[]>`
      select "limitValue"::text as v from "Platform"."UsageSnapshots" where "tenantId" = ${tenantId}::uuid and "usageMeterId" = ${meterId}::uuid
       order by "snapshotDate" desc limit 1`;
    return num(rows[0]?.v);
  }

  async capture(tenantId?: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`select "Platform"."captureUsageSnapshots"(current_date, ${tenantId ?? null}::uuid) as n`;
    return Number(rows[0]?.n ?? 0);
  }

  async addOverride(o: {
    tenantId: string; usageMeterId: string; previousLimit: number | null; limitValue: number; expiryMode: string; expiresOn: string | null;
    billOverage: string; customPrice: number | null; reason: string; appliedByStaffId: string;
  }) {
    const row = await this.prisma.db().usageLimitOverrides.create({
      data: { ...o, expiresOn: o.expiresOn ? new Date(`${o.expiresOn}T00:00:00Z`) : null, approvedByStaffId: o.appliedByStaffId },
      select: { id: true },
    });
    return row.id;
  }

  async revokeOverride(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().usageLimitOverrides.updateMany({ where: { id, rowVersion, revokedAt: null }, data: { revokedAt: new Date() } });
    return count === 1;
  }
}
