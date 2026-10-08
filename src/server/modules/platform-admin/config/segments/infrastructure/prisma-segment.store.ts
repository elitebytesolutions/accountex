import { Injectable } from '@nestjs/common';
import { TENANT_PLATFORMS, type SegmentOptions, type SegmentRule } from '../../../../../../shared/index.js';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { SegmentStore, type StoredSegment, type TenantRow } from '../application/segment-store.js';

const include = {
  TenantSegmentRules: { orderBy: { position: 'asc' } },
  SegmentTenants: { orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.TenantSegmentsInclude;
type Row = Prisma.TenantSegmentsGetPayload<{ include: typeof include }>;

type FactRow = {
  id: string; code: string; name: string; plan: string | null; province: string | null; city: string | null; industry: string | null;
  ageDays: number; salesTaxRegistered: boolean | null; isBeta: boolean; isInternal: boolean; appVersion: string | null; platforms: string[];
};

@Injectable()
export class PrismaSegmentStore extends SegmentStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    return this.map(await this.prisma.db().tenantSegments.findMany({ where: { deletedAt: null }, include, orderBy: [{ createdAt: 'asc' }] }));
  }

  async get(id: string) {
    const row = await this.prisma.db().tenantSegments.findFirst({ where: { id, deletedAt: null }, include });
    return row ? (await this.map([row]))[0]! : null;
  }

  async allNamesAndKeys() {
    const rows = await this.prisma.db().tenantSegments.findMany({ select: { id: true, name: true, key: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, name: r.name, key: r.key, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'tenantSegmentAddUpdate', data);
  }

  async overrideRowIds(segmentId: string) {
    const rows = await this.prisma.db().segmentTenants.findMany({ where: { segmentId }, select: { id: true, tenantId: true } });
    return new Map(rows.map((r) => [r.tenantId, r.id]));
  }

  async softDelete(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().tenantSegments.updateMany({ where: { id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this segment. Reload and try again.');
  }

  /** The same facts as Platform.evaluateTenantSegment reads (prisma/sql/103-admin-platform-config.sql). */
  async tenants(): Promise<TenantRow[]> {
    const rows = await this.prisma.db().$queryRaw<FactRow[]>`
      select tn.id::text as id, tn.code::text as code, tn."displayName" as name, tn.province, tn.city, tn.industry,
             floor(extract(epoch from now() - tn."createdAt") / 86400)::int as "ageDays",
             tn."salesTaxRegistered", tn."isBeta", tn."isInternal", tn."appVersion", tn.platforms,
             (select p.code from "Platform"."Subscriptions" s join "Platform"."SubscriptionPlans" p on p.id = s."planId"
               where s."tenantId" = tn.id and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')
               order by s."startsOn" desc limit 1) as plan
        from "Platform"."Tenants" tn
       order by tn."displayName"`;
    return rows.map((r) => ({ ...r, salesTaxRegistered: r.salesTaxRegistered ?? false }));
  }

  async planNames() {
    const rows = await this.prisma.db().subscriptionPlans.findMany({ select: { code: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
    return new Map(rows.map((r) => [r.code, r.name]));
  }

  async flagsUsing(keys: string[]) {
    const out = new Map<string, { key: string; name: string }[]>();
    if (!keys.length) return out;
    // Platform.FeatureFlags / FlagRules belong to Phase 39: read with SQL. A flag links a segment by its key.
    const rows = await this.prisma.db().$queryRaw<{ segmentKey: string; key: string; name: string }[]>`
      select distinct v as "segmentKey", f.key, f.name
        from "Platform"."FlagRules" r
        join "Platform"."FeatureFlags" f on f.id = r."flagId"
        cross join unnest(r."ruleValues") v
       where r.attribute = 'SEGMENT' and f."archivedAt" is null and v = any(${keys}::text[])
       order by f.key`;
    for (const r of rows) out.set(r.segmentKey, [...(out.get(r.segmentKey) ?? []), { key: r.key, name: r.name }]);
    return out;
  }

  async broadcastsUsing(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.prisma.db().$queryRaw<{ id: string; n: bigint }[]>`
      select "segmentId"::text as id, count(*) as n from "Platform"."TenantBroadcasts" where "segmentId" = any(${ids}::uuid[]) group by "segmentId"`;
    return new Map(rows.map((r) => [r.id, Number(r.n)]));
  }

  async options(): Promise<SegmentOptions> {
    const lookups = await this.prisma.db().$queryRaw<{ lookupType: string; code: string; label: string }[]>`
      select "lookupType", code, label from "Lookups"."Lookups"
       where "tenantId" is null and "isActive" and "lookupType" in ('Province', 'TenantIndustry', 'Platform') order by "sortOrder", label`;
    const of = (t: string) => lookups.filter((l) => l.lookupType === t).map((l) => ({ code: l.code, label: l.label }));
    const platformLabels = new Map(of('Platform').map((p) => [p.code, p.label]));
    const [plans, cities, tenants] = await Promise.all([
      this.prisma.db().subscriptionPlans.findMany({ select: { code: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      this.prisma.db().tenants.findMany({ where: { city: { not: null } }, select: { city: true }, distinct: ['city'], orderBy: { city: 'asc' } }),
      this.prisma.db().tenants.findMany({ select: { id: true, code: true, displayName: true }, orderBy: { displayName: 'asc' } }),
    ]);
    return {
      plans,
      regions: of('Province'),
      industries: of('TenantIndustry'),
      cities: cities.map((c) => c.city!).filter(Boolean),
      platforms: TENANT_PLATFORMS.map((code) => ({ code, label: platformLabels.get(code) ?? code.charAt(0) + code.slice(1).toLowerCase() })),
      tenants: tenants.map((t) => ({ id: t.id, code: t.code, name: t.displayName })),
    };
  }

  private async map(rows: Row[]): Promise<StoredSegment[]> {
    const tenantIds = [...new Set(rows.flatMap((r) => r.SegmentTenants.map((o) => o.tenantId)))];
    const names = new Map((tenantIds.length ? await this.prisma.db().tenants.findMany({ where: { id: { in: tenantIds } }, select: { id: true, code: true, displayName: true } }) : [])
      .map((t) => [t.id, t]));
    return rows.map((r) => ({
      id: r.id, key: r.key, name: r.name, description: r.description, icon: r.icon, tone: r.tone,
      rules: r.TenantSegmentRules.map((x) => ({ attribute: x.attribute, operator: x.operator, values: x.ruleValues }) as SegmentRule),
      overrides: r.SegmentTenants.map((o) => ({
        tenantId: o.tenantId, membership: o.membership as 'INCLUDE' | 'EXCLUDE',
        tenantName: names.get(o.tenantId)?.displayName ?? '—', tenantCode: names.get(o.tenantId)?.code ?? '',
      })),
      updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }
}
