import type { FlagDetail, FlagEnvironmentState } from '../../../../../shared/index.js';

/**
 * The readable before / after state written to FlagAuditLogs (template snap(): the "targeting.json" of the audit
 * diff) and the one-line summary of a targeting change (template crSummary()).
 */
const OPS: Record<string, string> = { IN: 'is one of', NOT_IN: 'is not one of', GT: 'greater than', LT: 'less than' };
const ATTR: Record<string, string> = {
  SEGMENT: 'Segment', PLAN: 'Plan', REGION: 'Region', CITY: 'City', INDUSTRY: 'Industry', AGE_DAYS: 'Tenant age (days)',
  USER_ROLE: 'User role', APP_VERSION: 'App version', PLATFORM: 'Platform',
};

export type TargetingSnapshot = {
  flag: string;
  environment: string;
  on: boolean;
  prerequisites?: string[];
  targets?: Record<string, string[]>;
  rules?: string[];
  defaultRule: { rollout: string; bucketBy: string } | { serve: string } | null;
  offVariation: string | null;
};

export function targetingSnapshot(flag: FlagDetail, env: FlagEnvironmentState): TargetingSnapshot {
  const v = (i: number | null | undefined) => (i === null || i === undefined ? '—' : (flag.variations.find((x) => x.idx === i)?.name ?? `#${i}`));
  const o: TargetingSnapshot = { flag: flag.key, environment: env.environment, on: env.isOn, defaultRule: null, offVariation: null };
  if (env.prerequisites.length)
    o.prerequisites = env.prerequisites.map((p) => (p.prerequisiteModuleId ? `module ${p.prerequisiteModuleKey ?? p.prerequisiteModuleId} enabled` : `${p.prerequisiteFlagKey ?? p.prerequisiteFlagId} = ${p.requiredVariationIdx ?? '—'}`));
  if (env.targets.length) {
    const tg: Record<string, string[]> = {};
    for (const t of env.targets) (tg[v(t.variationIdx)] ??= []).push(t.tenantCode);
    o.targets = tg;
  }
  if (env.rules.length) o.rules = env.rules.map((r) => `${ATTR[r.attribute] ?? r.attribute} ${OPS[r.operator] ?? r.operator} ${r.ruleValues.join(', ')} → ${v(r.serveVariationIdx)}`);
  const d = env.defaultRule;
  if (d) {
    o.defaultRule = d.defaultRule === 'ROLLOUT'
      ? { rollout: `${d.rolloutPct ?? 0}% ${v(d.rolloutVariationIdx)} / ${100 - (d.rolloutPct ?? 0)}% ${v(d.rolloutRestVariationIdx)}`, bucketBy: d.bucketBy.toLowerCase() }
      : { serve: v(d.defaultVariationIdx) };
    o.offVariation = v(d.offVariationIdx);
  }
  return o;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function targetingSummary(before: TargetingSnapshot, after: TargetingSnapshot): string {
  const parts: string[] = [];
  if (before.on !== after.on) parts.push(after.on ? 'Turn targeting ON' : 'Turn targeting OFF');
  if (!same(before.defaultRule, after.defaultRule) && after.defaultRule) {
    if ('rollout' in after.defaultRule) {
      const bp = before.defaultRule && 'rollout' in before.defaultRule ? before.defaultRule.rollout.split(' ')[0] + ' → ' : '';
      parts.push(`Rollout ${bp}${after.defaultRule.rollout.split(' ')[0]}`);
    } else parts.push(`Default → ${after.defaultRule.serve}`);
  }
  const rb = before.rules?.length ?? 0, ra = after.rules?.length ?? 0;
  if (rb !== ra) parts.push(`${ra > rb ? '+' : '−'}${Math.abs(ra - rb)} rule${Math.abs(ra - rb) > 1 ? 's' : ''}`);
  else if (!same(before.rules, after.rules)) parts.push('Rules edited');
  if (!same(before.targets, after.targets)) parts.push('Targets changed');
  if (!same(before.prerequisites, after.prerequisites)) parts.push('Prerequisites changed');
  if (before.offVariation !== after.offVariation) parts.push('Off variation changed');
  return parts.join(' · ') || 'No targeting change';
}

export const envLabel = (e: string) => (e === 'PRODUCTION' ? 'Production' : e === 'STAGING' ? 'Staging' : e === 'DEV' ? 'Dev' : 'All environments');
