import type { EvalDefaultRule } from './flag-evaluator.js';

/** Business rules of feature flags (pure). */

export const FLAG_ENVS = ['DEV', 'STAGING', 'PRODUCTION'] as const;
/** Lifecycle, in order. */
export const STAGE_ORDER = ['DEFINE', 'DEVELOP', 'PRODUCTION', 'CLEANUP', 'ARCHIVED'] as const;

/**
 * Lifecycle moves: forward any number of stages (ARCHIVED included), back one stage at a time; an archived flag is
 * restored first (to CLEANUP). Returns the reason a move is refused, or null.
 */
export function stageMoveError(from: string, to: string): string | null {
  const a = STAGE_ORDER.indexOf(from as never), b = STAGE_ORDER.indexOf(to as never);
  if (a < 0 || b < 0) return 'Unknown lifecycle stage';
  if (a === b) return 'The flag is already in this stage';
  if (from === 'ARCHIVED') return 'Restore the flag before moving it';
  if (b < a - 1) return 'Move back one stage at a time';
  return null;
}

/** A kill switch (primary or secondary type KILL): flipping it needs the key typed. */
export const isKillSwitch = (f: { flagType: string; secondaryType: string | null }) => f.flagType === 'KILL' || f.secondaryType === 'KILL';

/** Types that are temporary by default (template TYPES[*].temp). */
export const isTemporaryType = (t: string) => t === 'RELEASE' || t === 'EXPERIMENT';

/**
 * The default rule a new flag gets in every environment (template getD()): releases and experiments start as a 0 %
 * rollout (experiments roll out variation 1, the treatment), kill switches and ops flags serve On, entitlements Off.
 */
export function initialDefaultRule(flagType: string): EvalDefaultRule {
  if (flagType === 'KILL' || flagType === 'OPS')
    return { defaultRule: 'VARIATION', defaultVariationIdx: 0, rolloutPct: null, rolloutVariationIdx: 0, rolloutRestVariationIdx: 1, offVariationIdx: 1, bucketBy: 'TENANT_CODE' };
  if (flagType === 'ENTITLEMENT')
    return { defaultRule: 'VARIATION', defaultVariationIdx: 1, rolloutPct: null, rolloutVariationIdx: 0, rolloutRestVariationIdx: 1, offVariationIdx: 1, bucketBy: 'TENANT_CODE' };
  if (flagType === 'EXPERIMENT')
    return { defaultRule: 'ROLLOUT', defaultVariationIdx: null, rolloutPct: 0, rolloutVariationIdx: 1, rolloutRestVariationIdx: 0, offVariationIdx: 0, bucketBy: 'TENANT_CODE' };
  return { defaultRule: 'ROLLOUT', defaultVariationIdx: null, rolloutPct: 0, rolloutVariationIdx: 0, rolloutRestVariationIdx: 1, offVariationIdx: 1, bucketBy: 'TENANT_CODE' };
}

/**
 * Prerequisite cycle check (DFS over one environment's flag → prerequisite-flag edges, with `flagId`'s edges replaced
 * by `next`). Returns the cycle as flag ids (first = last = flagId), or null.
 */
export function findPrerequisiteCycle(flagId: string, next: string[], edges: ReadonlyMap<string, readonly string[]>): string[] | null {
  const out = (id: string) => (id === flagId ? next : (edges.get(id) ?? []));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];
  const dfs = (id: string): string[] | null => {
    if (id === flagId && stack.length) return [...stack, id];
    if (visiting.has(id) || done.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for (const n of out(id)) {
      const c = dfs(n);
      if (c) return c;
    }
    stack.pop();
    visiting.delete(id);
    done.add(id);
    return null;
  };
  return dfs(flagId);
}

/** Targeting that names variation indexes the flag doesn't have. Keys are field paths for the error details. */
export function targetingIndexErrors(
  t: {
    targets: { variationIdx: number }[];
    rules: { serveVariationIdx: number }[];
    defaultRule: { defaultRule: string; defaultVariationIdx: number | null; rolloutVariationIdx: number; rolloutRestVariationIdx: number; offVariationIdx: number };
  },
  variationCount: number,
): Record<string, string> {
  const e: Record<string, string> = {};
  const bad = (i: number | null) => i !== null && (i < 0 || i >= variationCount);
  t.targets.forEach((x, i) => bad(x.variationIdx) && (e[`targets.${i}.variationIdx`] = 'No such variation'));
  t.rules.forEach((x, i) => bad(x.serveVariationIdx) && (e[`rules.${i}.serveVariationIdx`] = 'No such variation'));
  const d = t.defaultRule;
  if (d.defaultRule === 'VARIATION' && bad(d.defaultVariationIdx)) e['defaultRule.defaultVariationIdx'] = 'No such variation';
  if (d.defaultRule === 'ROLLOUT' && (bad(d.rolloutVariationIdx) || bad(d.rolloutRestVariationIdx))) e['defaultRule.rolloutVariationIdx'] = 'No such variation';
  if (bad(d.offVariationIdx)) e['defaultRule.offVariationIdx'] = 'No such variation';
  return e;
}

/** Variations after an edit: existing indexes keep their place (they may be renamed); new ones are appended. */
export function variationEditError(existingCount: number, nextCount: number): string | null {
  return nextCount < existingCount ? 'Variations in use can’t be removed; rename them instead' : null;
}
