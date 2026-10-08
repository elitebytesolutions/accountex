import type { SegmentMembership, TenantFacts } from './tenant-facts.js';

/**
 * Attribute rules shared by flag rules (FlagRules) and segment rules (TenantSegmentRules): a port of the template's
 * matchRule() (9J-flags.js). Enum attributes match case-insensitively; AGE_DAYS compares numbers and APP_VERSION
 * compares dotted versions (4.11 = 4.11.0).
 */
export type AttributeRule = { attribute: string; operator: string; ruleValues: string[] };

const NUMERIC = new Set(['AGE_DAYS']);
const VERSION = new Set(['APP_VERSION']);

/** "4.11.3" → a comparable number (major * 1e6 + minor * 1e3 + patch). */
export const versionNumber = (v: string): number => {
  const parts = String(v).split('.').map((x) => Number.parseInt(x, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3).reduce((a, x) => a * 1000 + x, 0);
};

const yesNo = (b: boolean | null) => (b === null ? [] : [b ? 'YES' : 'NO']);
const norm = (s: string) => s.trim().toUpperCase();
const isYes = (s: string) => ['YES', 'TRUE', '1', 'Y'].includes(norm(s));

/** The tenant's values for an enum attribute (several for roles / platforms), upper-cased. */
function enumValues(attribute: string, t: TenantFacts): string[] {
  switch (attribute) {
    case 'PLAN': return t.planCode ? [t.planCode] : [];
    case 'REGION': return t.region ? [t.region] : [];
    case 'CITY': return t.city ? [t.city] : [];
    case 'INDUSTRY': return t.industry ? [t.industry] : [];
    case 'USER_ROLE': return t.roles;
    case 'PLATFORM': return t.platforms;
    case 'SALES_TAX_REGISTERED': return yesNo(t.salesTaxRegistered);
    case 'BETA': return yesNo(t.isBeta);
    case 'INTERNAL': return yesNo(t.isInternal);
    default: return [];
  }
}

/**
 * Does the tenant match the rule? SEGMENT rules ask `segments` (the segment matcher); a segment rule (no SEGMENT
 * attribute) passes no `segments`.
 */
export function matchAttributeRule(rule: AttributeRule, t: TenantFacts, segments?: SegmentMembership): boolean {
  const vals = rule.ruleValues.filter((v) => v.trim() !== '');
  if (!vals.length) return false;
  const op = rule.operator;

  if (rule.attribute === 'SEGMENT') {
    const any = !!segments && vals.some((k) => segments.isMember(k.trim(), t));
    return op === 'NOT_IN' ? !any : op === 'IN' ? any : false;
  }

  if (NUMERIC.has(rule.attribute) || VERSION.has(rule.attribute)) {
    const raw = NUMERIC.has(rule.attribute) ? t.ageDays : t.appVersion;
    if (raw === null || raw === undefined || raw === '') return op === 'NOT_IN';
    const num = (x: string | number) => (VERSION.has(rule.attribute) ? versionNumber(String(x)) : Number(x));
    const v = num(raw);
    if (op === 'IN') return vals.some((x) => num(x) === v);
    if (op === 'NOT_IN') return !vals.some((x) => num(x) === v);
    const lim = num(vals[0]!);
    return op === 'GT' ? v > lim : op === 'LT' ? v < lim : false;
  }

  const have = enumValues(rule.attribute, t).map(norm);
  const boolAttr = ['SALES_TAX_REGISTERED', 'BETA', 'INTERNAL'].includes(rule.attribute);
  const want = vals.map((x) => (boolAttr ? (isYes(x) ? 'YES' : 'NO') : norm(x)));
  const any = have.some((x) => want.includes(x));
  return op === 'IN' ? any : op === 'NOT_IN' ? !any : false;
}
