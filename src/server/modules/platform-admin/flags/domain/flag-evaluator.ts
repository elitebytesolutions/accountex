import { matchAttributeRule, type AttributeRule } from './rule-matcher.js';
import type { ModuleAccess, SegmentMembership, TenantFacts } from './tenant-facts.js';

/**
 * The flag evaluator: a port of the template's evaluate() (9J-flags.js ~278–290), in this order:
 *   1. prerequisites — any failing → the off variation;
 *   2. targeting off in the environment → the off variation;
 *   3. individual targets;
 *   4. rules, top to bottom, first match wins (SEGMENT rules through the segment matcher);
 *   5. the default rule: a percentage rollout (bucket = hash(bucket key + '.' + flag key) % 100 < pct) or a fixed variation.
 * An archived flag is no longer evaluated and serves its off variation.
 */
export type EvalPrerequisite = { prerequisiteFlagId: string | null; requiredVariationIdx: number | null; prerequisiteModuleId: string | null; label: string };
export type EvalRule = AttributeRule & { serveVariationIdx: number };
export type EvalDefaultRule = {
  defaultRule: string; defaultVariationIdx: number | null; rolloutPct: number | null;
  rolloutVariationIdx: number; rolloutRestVariationIdx: number; offVariationIdx: number; bucketBy: string;
};
/** One flag in one environment. */
export type EvalFlag = {
  id: string;
  key: string;
  archived: boolean;
  variationCount: number;
  isOn: boolean;
  prerequisites: EvalPrerequisite[];
  targets: { tenantId: string; variationIdx: number }[];
  /** In position order. */
  rules: EvalRule[];
  defaultRule: EvalDefaultRule | null;
};

export type ReasonKind = 'ARCHIVED' | 'PREREQUISITE_FAILED' | 'OFF' | 'TARGET' | 'RULE' | 'ROLLOUT' | 'DEFAULT';
export type EvalReason = { kind: ReasonKind; label: string; ruleNumber?: number; bucket?: number; prerequisite?: string };
export type EvalResult = { variationIdx: number; reason: EvalReason };

export type EvalContext = {
  /** Every flag of the same environment, by id (prerequisites are evaluated in that environment). */
  flags: ReadonlyMap<string, EvalFlag>;
  segments: SegmentMembership;
  modules: ModuleAccess;
};

/** Prerequisite chains deeper than this are treated as failing (cycles are refused on save; this is a backstop). */
export const MAX_PREREQUISITE_DEPTH = 8;

/** FNV-1a 32-bit over the string's characters, as in the template's hash(). */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The tenant's sticky rollout bucket 0–99 for a flag. */
export function rolloutBucket(t: Pick<TenantFacts, 'id' | 'code'>, flagKey: string, bucketBy: string): number {
  const by = bucketBy === 'TENANT_ID' ? t.id : t.code;
  return fnv1a(`${by}.${flagKey}`) % 100;
}

export const offVariationOf = (f: EvalFlag) => f.defaultRule?.offVariationIdx ?? (f.variationCount > 1 ? 1 : 0);

export function evaluateFlag(f: EvalFlag, t: TenantFacts, ctx: EvalContext, path: readonly string[] = []): EvalResult {
  const off = offVariationOf(f);
  if (f.archived) return { variationIdx: off, reason: { kind: 'ARCHIVED', label: 'Archived' } };

  // 1. prerequisites
  for (const p of f.prerequisites) {
    const failed = (): EvalResult => ({ variationIdx: off, reason: { kind: 'PREREQUISITE_FAILED', label: `Prerequisite ${p.label}`, prerequisite: p.label } });
    if (p.prerequisiteModuleId) {
      if (!ctx.modules.hasModule(p.prerequisiteModuleId, t)) return failed();
      continue;
    }
    const pf = p.prerequisiteFlagId ? ctx.flags.get(p.prerequisiteFlagId) : undefined;
    if (!pf || path.includes(pf.id) || path.length >= MAX_PREREQUISITE_DEPTH) return failed();
    if (evaluateFlag(pf, t, ctx, [...path, f.id]).variationIdx !== p.requiredVariationIdx) return failed();
  }

  // 2. environment off
  if (!f.isOn) return { variationIdx: off, reason: { kind: 'OFF', label: 'Targeting off' } };

  // 3. individual targets
  const target = f.targets.find((x) => x.tenantId === t.id);
  if (target) return { variationIdx: target.variationIdx, reason: { kind: 'TARGET', label: 'Individual target' } };

  // 4. rules, first match wins
  for (let i = 0; i < f.rules.length; i++) {
    const r = f.rules[i]!;
    if (matchAttributeRule(r, t, ctx.segments)) return { variationIdx: r.serveVariationIdx, reason: { kind: 'RULE', label: `Rule ${i + 1}`, ruleNumber: i + 1 } };
  }

  // 5. default rule
  const d = f.defaultRule;
  if (!d) return { variationIdx: off, reason: { kind: 'OFF', label: 'No default rule' } };
  if (d.defaultRule === 'ROLLOUT') {
    const b = rolloutBucket(t, f.key, d.bucketBy);
    const v = b < (d.rolloutPct ?? 0) ? d.rolloutVariationIdx : d.rolloutRestVariationIdx;
    return { variationIdx: v, reason: { kind: 'ROLLOUT', label: `Rollout · bucket ${b}`, bucket: b } };
  }
  return { variationIdx: d.defaultVariationIdx ?? off, reason: { kind: 'DEFAULT', label: 'Default rule' } };
}
