import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { segmentMatches, type MatchSegment, type TenantFacts as SegmentTenantFacts } from '../../config/segments/domain/segment-matcher.js';
import { EvaluationSource, type EvaluableFlag } from '../application/evaluation-source.js';
import type { ModuleAccess, SegmentMembership, TenantFacts } from '../domain/tenant-facts.js';

type TenantRow = {
  id: string; code: string; name: string; planCode: string | null; planId: string | null; province: string | null; city: string | null;
  industry: string | null; ageDays: number | null; appVersion: string | null; platforms: string[] | null; isBeta: boolean; isInternal: boolean;
  salesTaxRegistered: boolean | null;
};

/** Tenant facts with the live subscription's plan (same rule as Platform.evaluateTenantSegment). */
const TENANT_SQL = `
  select t.id::text, t.code::text, t."displayName" as name, t.province, t.city, t.industry, t."appVersion", t.platforms,
         t."isBeta", t."isInternal", t."salesTaxRegistered",
         floor(extract(epoch from now() - t."createdAt") / 86400)::int as "ageDays",
         lp.code as "planCode", lp.id::text as "planId"
    from "Platform"."Tenants" t
    left join lateral (
      select p.code, p.id from "Platform"."Subscriptions" s join "Platform"."SubscriptionPlans" p on p.id = s."planId"
       where s."tenantId" = t.id and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED')
       order by s."startsOn" desc limit 1) lp on true`;

const toFacts = (r: TenantRow, roles: string[] = []): TenantFacts => ({
  id: r.id, code: r.code, name: r.name, planCode: r.planCode, planId: r.planId, region: r.province, city: r.city, industry: r.industry,
  ageDays: r.ageDays, appVersion: r.appVersion, platforms: r.platforms ?? [], roles, isBeta: r.isBeta, isInternal: r.isInternal,
  salesTaxRegistered: r.salesTaxRegistered,
});

/** Phase 38's segment matcher works on its own TenantFacts shape. */
const toSegmentFacts = (t: TenantFacts): SegmentTenantFacts => ({
  id: t.id, plan: t.planCode, province: t.region, city: t.city, industry: t.industry, ageDays: t.ageDays ?? 0,
  salesTaxRegistered: !!t.salesTaxRegistered, isBeta: t.isBeta, isInternal: t.isInternal, appVersion: t.appVersion, platforms: t.platforms,
});

@Injectable()
export class PrismaEvaluationSource extends EvaluationSource {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async flags(environment: string): Promise<EvaluableFlag[]> {
    const db = this.prisma.db();
    const [flags, envs, variations] = await Promise.all([
      db.featureFlags.findMany({ select: { id: true, key: true, name: true, stage: true } }),
      db.flagEnvironments.findMany({ where: { environment } }),
      db.flagVariations.findMany({ orderBy: { idx: 'asc' } }),
    ]);
    const envIds = envs.map((e) => e.id);
    const [rules, targets, prereqs, defaults, modules] = await Promise.all([
      db.flagRules.findMany({ where: { flagEnvironmentId: { in: envIds } }, orderBy: { position: 'asc' } }),
      db.flagTargets.findMany({ where: { flagEnvironmentId: { in: envIds } } }),
      db.flagPrerequisites.findMany({ where: { flagEnvironmentId: { in: envIds } }, orderBy: { createdAt: 'asc' } }),
      db.flagDefaultRules.findMany({ where: { flagEnvironmentId: { in: envIds } } }),
      db.platformModules.findMany({ select: { id: true, key: true } }),
    ]);
    const keyOf = new Map(flags.map((f) => [f.id, f.key]));
    const moduleKey = new Map(modules.map((m) => [m.id, m.key]));
    const envOf = new Map(envs.map((e) => [e.flagId, e]));
    return flags.map((f) => {
      const e = envOf.get(f.id);
      const eid = e?.id;
      const vars = variations.filter((v) => v.flagId === f.id).map((v) => ({ idx: v.idx, name: v.name, value: v.value }));
      const d = defaults.find((x) => x.flagEnvironmentId === eid);
      return {
        id: f.id, key: f.key, name: f.name, stage: f.stage, archived: f.stage === 'ARCHIVED', variations: vars, variationCount: vars.length,
        isOn: e?.isOn ?? false,
        prerequisites: prereqs.filter((p) => p.flagEnvironmentId === eid).map((p) => ({
          prerequisiteFlagId: p.prerequisiteFlagId, requiredVariationIdx: p.requiredVariationIdx, prerequisiteModuleId: p.prerequisiteModuleId,
          label: p.prerequisiteModuleId ? (moduleKey.get(p.prerequisiteModuleId) ?? 'module') : (keyOf.get(p.prerequisiteFlagId ?? '') ?? 'flag'),
        })),
        targets: targets.filter((t) => t.flagEnvironmentId === eid).map((t) => ({ tenantId: t.tenantId, variationIdx: t.variationIdx })),
        rules: rules.filter((r) => r.flagEnvironmentId === eid).map((r) => ({ attribute: r.attribute, operator: r.operator, ruleValues: r.ruleValues, serveVariationIdx: r.serveVariationIdx })),
        defaultRule: d ? {
          defaultRule: d.defaultRule, defaultVariationIdx: d.defaultVariationIdx, rolloutPct: d.rolloutPct, rolloutVariationIdx: d.rolloutVariationIdx,
          rolloutRestVariationIdx: d.rolloutRestVariationIdx, offVariationIdx: d.offVariationIdx, bucketBy: d.bucketBy,
        } : null,
      };
    });
  }

  async tenant(ref: string, roles: string[] = []): Promise<TenantFacts | null> {
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
    const rows = await this.prisma.db().$queryRawUnsafe<TenantRow[]>(`${TENANT_SQL} where ${isId ? 't.id = $1::uuid' : 't.code = $1::citext'}`, ref);
    return rows[0] ? toFacts(rows[0], roles) : null;
  }

  async tenants(): Promise<TenantFacts[]> {
    const rows = await this.prisma.db().$queryRawUnsafe<TenantRow[]>(`${TENANT_SQL} order by t."displayName"`);
    return rows.map((r) => toFacts(r));
  }

  /** SEGMENT rules resolve through Phase 38's segment matcher (config/segments/domain/segment-matcher.ts). */
  async segments(): Promise<SegmentMembership> {
    const db = this.prisma.db();
    const segs = await db.$queryRawUnsafe<{ id: string; key: string }[]>(`select id::text, key from "Platform"."TenantSegments" where "deletedAt" is null`);
    const ids = segs.map((s) => s.id);
    const [rules, overrides] = ids.length
      ? await Promise.all([
          db.$queryRawUnsafe<{ segmentId: string; attribute: string; operator: string; ruleValues: string[] }[]>(
            `select "segmentId"::text, attribute, operator, "ruleValues" from "Platform"."TenantSegmentRules" where "segmentId" = any($1::uuid[]) order by position`, ids),
          db.$queryRawUnsafe<{ segmentId: string; tenantId: string; membership: string }[]>(
            `select "segmentId"::text, "tenantId"::text, membership from "Platform"."SegmentTenants" where "segmentId" = any($1::uuid[])`, ids),
        ])
      : [[], []];
    const byKey = new Map<string, MatchSegment>(segs.map((s) => [s.key.toLowerCase(), {
      rules: rules.filter((r) => r.segmentId === s.id).map((r) => ({ attribute: r.attribute, operator: r.operator, values: r.ruleValues })),
      include: new Set(overrides.filter((o) => o.segmentId === s.id && o.membership === 'INCLUDE').map((o) => o.tenantId)),
      exclude: new Set(overrides.filter((o) => o.segmentId === s.id && o.membership === 'EXCLUDE').map((o) => o.tenantId)),
    }]));
    return {
      isMember(segmentKey, tenant) {
        const s = byKey.get(segmentKey.toLowerCase());
        return !!s && segmentMatches(s, toSegmentFacts(tenant));
      },
    };
  }

  async modules(): Promise<ModuleAccess> {
    const db = this.prisma.db();
    const [mods, plans] = await Promise.all([
      db.platformModules.findMany({ where: { deletedAt: null }, select: { id: true, isCore: true, isEnabled: true } }),
      db.platformModulePlans.findMany({ where: { isIncluded: true }, select: { platformModuleId: true, planId: true } }),
    ]);
    const byId = new Map(mods.map((m) => [m.id, m]));
    const included = new Set(plans.map((p) => `${p.platformModuleId}|${p.planId}`));
    return {
      hasModule(moduleId, t) {
        const m = byId.get(moduleId);
        if (!m || !m.isEnabled) return false;
        return m.isCore || (!!t.planId && included.has(`${moduleId}|${t.planId}`));
      },
    };
  }
}
