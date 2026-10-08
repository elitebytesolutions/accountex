/**
 * Plan versioning (Phase 36). Tenants are grandfathered on the price they signed up for, so a price change on a plan
 * that has subscriptions creates a new plan row <CODE>_V<n> (ACTIVE) and retires the old one. A plan nobody has
 * subscribed to is edited in place.
 */

const VERSION = /_V(\d+)$/;
const MAX_CODE = 20;

/** The code without its version suffix: GROWTH_V3 → GROWTH. */
export const baseCode = (code: string) => code.replace(VERSION, '');

/** The version number of a code: GROWTH → 1, GROWTH_V3 → 3. */
export const versionOf = (code: string) => Number(VERSION.exec(code)?.[1] ?? 1);

/** Is `code` a version of the same plan family as `of` (same base, possibly truncated to fit the suffix)? */
export function sameFamily(code: string, of: string): boolean {
  const a = baseCode(code), b = baseCode(of);
  return a === b || (VERSION.test(code) && b.startsWith(a)) || (VERSION.test(of) && a.startsWith(b));
}

/** The next free version code: GROWTH with GROWTH, GROWTH_V2 taken → GROWTH_V3 (the base is cut to stay ≤ 20 chars). */
export function nextVersionCode(code: string, existingCodes: string[]): string {
  const family = existingCodes.filter((c) => sameFamily(c, code));
  let n = Math.max(versionOf(code), ...family.map(versionOf)) + 1;
  const taken = new Set(existingCodes);
  for (;;) {
    const suffix = `_V${n}`;
    const candidate = `${baseCode(code).slice(0, MAX_CODE - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
    n += 1;
  }
}

type Priced = Record<string, unknown>;
const norm = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'boolean' ? v : Number(v));
/** Does the patch change any of the priced fields? */
export function priceChanged(current: Priced, patch: Priced, fields: readonly string[]): boolean {
  return fields.some((f) => patch[f] !== undefined && norm(patch[f]) !== norm(current[f]));
}
