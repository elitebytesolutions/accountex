/**
 * Segment matcher (Phase 38). PURE: no I/O, no framework. Reused by Phase 39 for feature-flag rules (the PLAN / REGION /
 * CITY / INDUSTRY / AGE_DAYS / APP_VERSION / PLATFORM attributes behave exactly like a segment rule, and a SEGMENT flag
 * rule asks `segmentMatches` for each segment key it names).
 *
 * Membership = not excluded AND (included OR at least one rule AND every rule matches): the template's `segMatch`
 * (template/src/9J-flags.js). The database twin is Platform.evaluateTenantSegment / Platform.tenantSegmentRuleMatches
 * (prisma/sql/103-admin-platform-config.sql); keep the two in step.
 */

/** What a rule can look at for one tenant. Load it with the platform data (see SegmentStore.tenantFacts). */
export type TenantFacts = {
  id: string;
  /** Plan code of the tenant's live subscription (TRIAL / ACTIVE / PAST_DUE / SUSPENDED), null without one. */
  plan: string | null;
  /** Province code (REGION). */
  province: string | null;
  city: string | null;
  /** TenantIndustry code. */
  industry: string | null;
  /** Whole days since the tenant was created. */
  ageDays: number;
  salesTaxRegistered: boolean;
  isBeta: boolean;
  isInternal: boolean;
  /** x.y.z or null. */
  appVersion: string | null;
  /** WEB / ANDROID / IOS / DESKTOP. */
  platforms: string[];
};

/** One rule as stored in TenantSegmentRules / FlagRules (attribute, operator, ruleValues). */
export type MatchRule = { attribute: string; operator: string; values: string[] };

/** A segment as the matcher needs it: its rules and its manual overrides. */
export type MatchSegment = { rules: MatchRule[]; include: ReadonlySet<string> | string[]; exclude: ReadonlySet<string> | string[] };

const has = (s: ReadonlySet<string> | string[], v: string) => (Array.isArray(s) ? s.includes(v) : s.has(v));

/** 4.11.0 vs 4.9.2 → positive / 0 / negative, numerically per part (PostgreSQL int[] comparison). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** The tenant's values for an attribute (lower-cased for CITY), or null for an attribute this matcher doesn't know. */
function actualValues(attribute: string, t: TenantFacts): (string | null)[] | null {
  switch (attribute) {
    case 'PLAN': return [t.plan];
    case 'REGION': return [t.province];
    case 'CITY': return [t.city ? t.city.trim().toLowerCase() : null];
    case 'INDUSTRY': return [t.industry];
    case 'SALES_TAX_REGISTERED': return [String(t.salesTaxRegistered)];
    case 'BETA': return [String(t.isBeta)];
    case 'INTERNAL': return [String(t.isInternal)];
    case 'PLATFORM': return t.platforms;
    default: return null;
  }
}

/** Does one rule match the tenant? Unknown attributes / operators and empty value lists never match. */
export function ruleMatches(rule: MatchRule, t: TenantFacts): boolean {
  const { attribute, operator, values } = rule;
  if (!values.length) return false;

  if (attribute === 'AGE_DAYS') {
    const n = values.map(Number);
    switch (operator) {
      case 'GT': return t.ageDays > n[0]!;
      case 'LT': return t.ageDays < n[0]!;
      case 'IN': return n.includes(t.ageDays);
      case 'NOT_IN': return !n.includes(t.ageDays);
      default: return false;
    }
  }

  if (attribute === 'APP_VERSION') {
    if (!t.appVersion) return operator === 'NOT_IN';
    const v = t.appVersion;
    switch (operator) {
      case 'GT': return compareVersions(v, values[0]!) > 0;
      case 'LT': return compareVersions(v, values[0]!) < 0;
      case 'IN': return values.some((x) => compareVersions(v, x) === 0);
      case 'NOT_IN': return !values.some((x) => compareVersions(v, x) === 0);
      default: return false;
    }
  }

  const actual = actualValues(attribute, t);
  if (!actual) return false;
  const wanted = attribute === 'CITY' ? values.map((v) => v.trim().toLowerCase()) : values;
  const hit = actual.some((a) => a !== null && wanted.includes(a));
  if (operator === 'IN') return hit;
  if (operator === 'NOT_IN') return !hit;
  return false;
}

/** Is the tenant in the segment? Exclude wins over include; without overrides every rule must match (and ≥ 1 rule). */
export function segmentMatches(segment: MatchSegment, t: TenantFacts): boolean {
  return membershipOf(segment, t) !== null;
}

/** Why the tenant is in the segment ('INCLUDE' override or 'RULES'), or null when it is not. */
export function membershipOf(segment: MatchSegment, t: TenantFacts): 'INCLUDE' | 'RULES' | null {
  if (has(segment.exclude, t.id)) return null;
  if (has(segment.include, t.id)) return 'INCLUDE';
  return segment.rules.length > 0 && segment.rules.every((r) => ruleMatches(r, t)) ? 'RULES' : null;
}
