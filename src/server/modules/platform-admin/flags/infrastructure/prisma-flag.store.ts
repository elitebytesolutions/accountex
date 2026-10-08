import { Injectable } from '@nestjs/common';
import type {
  FlagAuditEntry,
  FlagDefaultRuleInput,
  FlagDetail,
  FlagEnvironment,
  FlagEnvironmentState,
  FlagListItem,
  FlagListQuery,
  FlagOptions,
  FlagRuleInput,
  FlagSummary,
} from '../../../../../shared/index.js';
import type { FeatureFlags, Prisma } from '../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { FlagStore, type FlagAuditWrite, type PrerequisiteRow } from '../application/flag-store.js';
import type { EvalDefaultRule } from '../domain/flag-evaluator.js';

const ENVS: FlagEnvironment[] = ['DEV', 'STAGING', 'PRODUCTION'];
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type FlagRow = FeatureFlags;

@Injectable()
export class PrismaFlagStore extends FlagStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db() {
    return this.prisma.db();
  }

  private async staffNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db().$queryRawUnsafe<{ id: string; fullName: string }[]>(
      `select id::text, "fullName" from "Platform"."PlatformStaff" where id = any($1::uuid[])`, [...new Set(ids)]);
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  /** Flags with every environment's targeting. */
  private async build(flags: FlagRow[]): Promise<FlagDetail[]> {
    if (!flags.length) return [];
    const db = this.db();
    const ids = flags.map((f) => f.id);
    const [envs, variations, rules, targets, prereqs, defaults, owners] = await Promise.all([
      db.flagEnvironments.findMany({ where: { flagId: { in: ids } } }),
      db.flagVariations.findMany({ where: { flagId: { in: ids } }, orderBy: { idx: 'asc' } }),
      db.flagRules.findMany({ where: { flagId: { in: ids } }, orderBy: { position: 'asc' } }),
      db.flagTargets.findMany({ where: { flagId: { in: ids } }, orderBy: { createdAt: 'asc' } }),
      db.flagPrerequisites.findMany({ where: { flagId: { in: ids } }, orderBy: { createdAt: 'asc' } }),
      db.flagDefaultRules.findMany({ where: { flagId: { in: ids } } }),
      this.staffNames(flags.map((f) => f.ownerStaffId)),
    ]);
    const preFlagIds = prereqs.flatMap((p) => (p.prerequisiteFlagId ? [p.prerequisiteFlagId] : []));
    const preModIds = prereqs.flatMap((p) => (p.prerequisiteModuleId ? [p.prerequisiteModuleId] : []));
    const [tenants, preFlags, preMods] = await Promise.all([
      targets.length ? db.tenants.findMany({ where: { id: { in: [...new Set(targets.map((t) => t.tenantId))] } }, select: { id: true, code: true, displayName: true } }) : [],
      preFlagIds.length ? db.featureFlags.findMany({ where: { id: { in: preFlagIds } }, select: { id: true, key: true } }) : [],
      preModIds.length ? db.platformModules.findMany({ where: { id: { in: preModIds } }, select: { id: true, key: true } }) : [],
    ]);
    const tenant = new Map(tenants.map((t) => [t.id, t]));
    const flagKey = new Map(preFlags.map((f) => [f.id, f.key]));
    const modKey = new Map(preMods.map((m) => [m.id, m.key]));

    return flags.map((f) => {
      const environments: FlagEnvironmentState[] = ENVS.flatMap((environment) => {
        const e = envs.find((x) => x.flagId === f.id && x.environment === environment);
        if (!e) return [];
        const d = defaults.find((x) => x.flagEnvironmentId === e.id);
        return [{
          id: e.id, environment, isOn: e.isOn, rowVersion: e.rowVersion, lastEvaluatedAt: iso(e.lastEvaluatedAt),
          prerequisites: prereqs.filter((p) => p.flagEnvironmentId === e.id).map((p) => ({
            prerequisiteFlagId: p.prerequisiteFlagId, prerequisiteFlagKey: p.prerequisiteFlagId ? (flagKey.get(p.prerequisiteFlagId) ?? null) : null,
            requiredVariationIdx: p.requiredVariationIdx, prerequisiteModuleId: p.prerequisiteModuleId,
            prerequisiteModuleKey: p.prerequisiteModuleId ? (modKey.get(p.prerequisiteModuleId) ?? null) : null,
          })),
          targets: targets.filter((t) => t.flagEnvironmentId === e.id).map((t) => ({
            tenantId: t.tenantId, tenantCode: tenant.get(t.tenantId)?.code ?? '', tenantName: tenant.get(t.tenantId)?.displayName ?? '', variationIdx: t.variationIdx,
          })),
          rules: rules.filter((r) => r.flagEnvironmentId === e.id).map((r) => ({ attribute: r.attribute, operator: r.operator, ruleValues: r.ruleValues, serveVariationIdx: r.serveVariationIdx })),
          defaultRule: d ? {
            defaultRule: d.defaultRule === 'VARIATION' ? 'VARIATION' : 'ROLLOUT', defaultVariationIdx: d.defaultVariationIdx, rolloutPct: d.rolloutPct,
            rolloutVariationIdx: d.rolloutVariationIdx, rolloutRestVariationIdx: d.rolloutRestVariationIdx, offVariationIdx: d.offVariationIdx, bucketBy: d.bucketBy,
          } : null,
        }];
      });
      const envSummary = Object.fromEntries(ENVS.map((env) => {
        const e = environments.find((x) => x.environment === env);
        return [env, {
          isOn: e?.isOn ?? false,
          rolloutPct: e?.defaultRule?.defaultRule === 'ROLLOUT' ? (e.defaultRule.rolloutPct ?? 0) : null,
          defaultRule: e?.defaultRule?.defaultRule ?? null,
          rules: e?.rules.length ?? 0,
          targets: e?.targets.length ?? 0,
          prerequisites: (e?.prerequisites ?? []).map((p) => p.prerequisiteFlagKey ?? p.prerequisiteModuleKey ?? '?'),
        }];
      })) as FlagListItem['envs'];
      const evaluated = environments.map((e) => e.lastEvaluatedAt).filter((x): x is string => !!x).sort();
      return {
        id: f.id, key: f.key, name: f.name, description: f.description, flagType: f.flagType, secondaryType: f.secondaryType, category: f.category,
        stage: f.stage, ownerStaffId: f.ownerStaffId, ownerName: owners.get(f.ownerStaffId) ?? null, tags: f.tags, variationKind: f.variationKind,
        isTemporary: f.isTemporary, expiresOn: day(f.expiresOn), staleReason: f.staleReason, staleSince: day(f.staleSince), archivedAt: iso(f.archivedAt),
        createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(), rowVersion: f.rowVersion,
        variations: variations.filter((v) => v.flagId === f.id).map((v) => ({ idx: v.idx, name: v.name, value: v.value })),
        envs: envSummary, lastEvaluatedAt: evaluated.at(-1) ?? null, environments,
      };
    });
  }

  async list(q: FlagListQuery): Promise<FlagListItem[]> {
    const where: Prisma.FeatureFlagsWhereInput = {
      stage: q.stage ? q.stage : { not: 'ARCHIVED' },
      ...(q.category && { category: q.category }),
      ...(q.type && { OR: [{ flagType: q.type }, { secondaryType: q.type }] }),
      ...(q.owner && { ownerStaffId: q.owner }),
      ...(q.stale === 'true' && { NOT: { staleReason: null } }),
      ...(q.search && {
        AND: [{ OR: [
          { key: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } },
          { description: { contains: q.search, mode: 'insensitive' } }, { tags: { has: q.search.toLowerCase() } },
        ] }],
      }),
    };
    const rows = await this.db().featureFlags.findMany({ where, orderBy: [{ category: 'asc' }, { key: 'asc' }] });
    return (await this.build(rows)).map((d): FlagListItem => { const item: Partial<FlagDetail> = { ...d }; delete item.environments; return item as FlagListItem; });
  }

  async detail(id: string): Promise<FlagDetail | null> {
    const row = await this.db().featureFlags.findUnique({ where: { id } });
    return row ? (await this.build([row]))[0]! : null;
  }

  async keyExists(key: string) {
    return (await this.db().featureFlags.count({ where: { key } })) > 0;
  }

  async summary(): Promise<FlagSummary> {
    const [r] = await this.db().$queryRawUnsafe<Record<string, unknown>[]>(`select * from "Platform"."getFeatureFlagSummary"`);
    const n = (k: string) => Number(r?.[k] ?? 0);
    return {
      totalFlags: n('totalFlags'), temporaryFlags: n('temporaryFlags'), permanentFlags: n('permanentFlags'), activeInProduction: n('activeInProduction'),
      staleFlags: n('staleFlags'), pendingApprovals: n('pendingApprovals'), killSwitches: n('killSwitches'), expiredTemporaryFlags: n('expiredTemporaryFlags'),
      evaluations7d: n('evaluations7d'),
    };
  }

  async audit(flagId: string, limit: number): Promise<FlagAuditEntry[]> {
    const rows = await this.db().flagAuditLogs.findMany({ where: { flagId }, orderBy: { occurredAt: 'desc' }, take: limit });
    const names = await this.staffNames(rows.flatMap((r) => (r.staffUserId ? [r.staffUserId] : [])));
    return rows.map((r) => ({
      id: r.id, occurredAt: r.occurredAt.toISOString(), environment: r.environment, eventKind: r.eventKind, summary: r.summary,
      staffName: r.staffUserId ? (names.get(r.staffUserId) ?? null) : null, beforeState: r.beforeState, afterState: r.afterState, isEmergency: r.isEmergency,
    }));
  }

  async options(): Promise<FlagOptions> {
    const db = this.db();
    const [plans, segments, tenants, modules, flags, variations, staff] = await Promise.all([
      db.subscriptionPlans.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, code: true, name: true } }),
      db.$queryRawUnsafe<{ key: string; name: string }[]>(`select key, name::text from "Platform"."TenantSegments" where "deletedAt" is null order by name`),
      db.$queryRawUnsafe<{ id: string; code: string; name: string; planCode: string | null; city: string | null }[]>(`
        select t.id::text, t.code::text, t."displayName" as name, t.city,
               (select p.code from "Platform"."Subscriptions" s join "Platform"."SubscriptionPlans" p on p.id = s."planId"
                 where s."tenantId" = t.id and s.status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED') order by s."startsOn" desc limit 1) as "planCode"
          from "Platform"."Tenants" t order by t."displayName"`),
      db.platformModules.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, key: true, name: true } }),
      db.featureFlags.findMany({ where: { stage: { not: 'ARCHIVED' } }, orderBy: { key: 'asc' }, select: { id: true, key: true, name: true, flagType: true, stage: true } }),
      db.flagVariations.findMany({ orderBy: { idx: 'asc' }, select: { flagId: true, idx: true, name: true, value: true } }),
      db.$queryRawUnsafe<{ id: string; name: string }[]>(`select id::text, "fullName" as name from "Platform"."PlatformStaff" where "removedAt" is null order by "fullName"`),
    ]);
    return {
      plans, segments, tenants, modules, staff,
      flags: flags.map((f) => ({ ...f, variations: variations.filter((v) => v.flagId === f.id).map((v) => ({ idx: v.idx, name: v.name, value: v.value })) })),
    };
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'featureFlagAddUpdate', data);
  }

  async prerequisiteRows(flagId: string) {
    const rows = await this.db().flagPrerequisites.findMany({ where: { flagId }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => ({ id: r.id, flagEnvironmentId: r.flagEnvironmentId, prerequisiteFlagId: r.prerequisiteFlagId, requiredVariationIdx: r.requiredVariationIdx, prerequisiteModuleId: r.prerequisiteModuleId }));
  }

  async prerequisiteEdges(environment: string) {
    const envs = await this.db().flagEnvironments.findMany({ where: { environment }, select: { id: true } });
    const rows = await this.db().flagPrerequisites.findMany({ where: { flagEnvironmentId: { in: envs.map((e) => e.id) }, NOT: { prerequisiteFlagId: null } } });
    const edges = new Map<string, string[]>();
    for (const r of rows) edges.set(r.flagId, [...(edges.get(r.flagId) ?? []), r.prerequisiteFlagId!]);
    return edges;
  }

  async variationIds(flagId: string) {
    const rows = await this.db().flagVariations.findMany({ where: { flagId }, select: { id: true, idx: true } });
    return new Map(rows.map((r) => [r.idx, r.id]));
  }

  async variationCounts(flagIds: string[]) {
    if (!flagIds.length) return new Map<string, number>();
    const rows = await this.db().flagVariations.groupBy({ by: ['flagId'], where: { flagId: { in: flagIds } }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.flagId, r._count._all]));
  }

  async touchEnvironment(envId: string, rowVersion: number, isOn: boolean) {
    const r = await this.db().flagEnvironments.updateMany({ where: { id: envId, rowVersion }, data: { isOn } });
    return r.count === 1;
  }

  async writeTargeting(flagId: string, envId: string, t: { rules: FlagRuleInput[]; targets: { tenantId: string; variationIdx: number }[]; defaultRule: FlagDefaultRuleInput }) {
    const db = this.db();
    // rules: kept by position (deferrable unique), so history shows edits rather than delete + insert
    const rules = await db.flagRules.findMany({ where: { flagEnvironmentId: envId }, orderBy: { position: 'asc' } });
    for (let i = 0; i < t.rules.length; i++) {
      const r = t.rules[i]!;
      const cur = rules.find((x) => x.position === i);
      const data = { attribute: r.attribute, operator: r.operator, ruleValues: r.ruleValues, serveVariationIdx: r.serveVariationIdx };
      if (!cur) await db.flagRules.create({ data: { flagEnvironmentId: envId, flagId, position: i, ...data } });
      else if (cur.attribute !== data.attribute || cur.operator !== data.operator || cur.serveVariationIdx !== data.serveVariationIdx || cur.ruleValues.join('\u0001') !== data.ruleValues.join('\u0001'))
        await db.flagRules.update({ where: { id: cur.id }, data });
    }
    const extra = rules.filter((x) => x.position >= t.rules.length).map((x) => x.id);
    if (extra.length) await db.flagRules.deleteMany({ where: { id: { in: extra } } });

    // targets: kept by tenant
    const targets = await db.flagTargets.findMany({ where: { flagEnvironmentId: envId } });
    const wanted = new Map(t.targets.map((x) => [x.tenantId, x.variationIdx]));
    const gone = targets.filter((x) => !wanted.has(x.tenantId)).map((x) => x.id);
    if (gone.length) await db.flagTargets.deleteMany({ where: { id: { in: gone } } });
    for (const [tenantId, variationIdx] of wanted) {
      const cur = targets.find((x) => x.tenantId === tenantId);
      if (!cur) await db.flagTargets.create({ data: { flagEnvironmentId: envId, flagId, tenantId, variationIdx } });
      else if (cur.variationIdx !== variationIdx) await db.flagTargets.update({ where: { id: cur.id }, data: { variationIdx } });
    }

    // default rule + off variation (one row per environment)
    const d = t.defaultRule;
    const data = {
      defaultRule: d.defaultRule, defaultVariationIdx: d.defaultRule === 'VARIATION' ? d.defaultVariationIdx : null,
      rolloutPct: d.defaultRule === 'ROLLOUT' ? d.rolloutPct : null, rolloutVariationIdx: d.rolloutVariationIdx,
      rolloutRestVariationIdx: d.rolloutRestVariationIdx, offVariationIdx: d.offVariationIdx, bucketBy: d.bucketBy,
    };
    const cur = await db.flagDefaultRules.findUnique({ where: { flagEnvironmentId: envId } });
    if (!cur) await db.flagDefaultRules.create({ data: { flagEnvironmentId: envId, flagId, ...data } });
    else if ((Object.keys(data) as (keyof typeof data)[]).some((k) => cur[k] !== data[k])) await db.flagDefaultRules.update({ where: { id: cur.id }, data });
  }

  async createDefaultRules(flagId: string, rule: EvalDefaultRule) {
    const envs = await this.db().flagEnvironments.findMany({ where: { flagId } });
    for (const e of envs) await this.db().flagDefaultRules.create({ data: { flagEnvironmentId: e.id, flagId, ...rule } });
  }

  async copyTargeting(fromFlagId: string, toFlagId: string) {
    const db = this.db();
    const [fromEnvs, toEnvs] = await Promise.all([db.flagEnvironments.findMany({ where: { flagId: fromFlagId } }), db.flagEnvironments.findMany({ where: { flagId: toFlagId } })]);
    const prerequisites: PrerequisiteRow[] = [];
    for (const src of fromEnvs) {
      const dst = toEnvs.find((e) => e.environment === src.environment);
      if (!dst) continue;
      const [rules, targets, d, pre] = await Promise.all([
        db.flagRules.findMany({ where: { flagEnvironmentId: src.id }, orderBy: { position: 'asc' } }),
        db.flagTargets.findMany({ where: { flagEnvironmentId: src.id } }),
        db.flagDefaultRules.findUnique({ where: { flagEnvironmentId: src.id } }),
        db.flagPrerequisites.findMany({ where: { flagEnvironmentId: src.id } }),
      ]);
      await this.writeTargeting(toFlagId, dst.id, {
        rules: rules.map((r) => ({ attribute: r.attribute as FlagRuleInput['attribute'], operator: r.operator as FlagRuleInput['operator'], ruleValues: r.ruleValues, serveVariationIdx: r.serveVariationIdx })),
        targets: targets.map((x) => ({ tenantId: x.tenantId, variationIdx: x.variationIdx })),
        defaultRule: d
          ? { defaultRule: d.defaultRule === 'VARIATION' ? 'VARIATION' : 'ROLLOUT', defaultVariationIdx: d.defaultVariationIdx, rolloutPct: d.rolloutPct, rolloutVariationIdx: d.rolloutVariationIdx, rolloutRestVariationIdx: d.rolloutRestVariationIdx, offVariationIdx: d.offVariationIdx, bucketBy: d.bucketBy === 'TENANT_ID' ? 'TENANT_ID' : 'TENANT_CODE' }
          : { defaultRule: 'ROLLOUT', defaultVariationIdx: null, rolloutPct: 0, rolloutVariationIdx: 0, rolloutRestVariationIdx: 1, offVariationIdx: 1, bucketBy: 'TENANT_CODE' },
      });
      for (const p of pre) prerequisites.push({ flagEnvironmentId: dst.id, prerequisiteFlagId: p.prerequisiteFlagId, requiredVariationIdx: p.requiredVariationIdx, prerequisiteModuleId: p.prerequisiteModuleId });
    }
    if (prerequisites.length) await this.save({ id: toFlagId, prerequisites });
  }

  async writeAudit(e: FlagAuditWrite) {
    await this.db().$queryRawUnsafe(
      `select "Platform"."flagAuditWrite"($1::uuid, $2, $3, $4, $5::jsonb, $6::jsonb, $7)::text as id`,
      e.flagId, e.environment, e.eventKind, e.summary, JSON.stringify(e.before ?? {}), JSON.stringify(e.after ?? {}), e.isEmergency ?? false,
    );
  }
}
