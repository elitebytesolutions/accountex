/**
 * Console IP allow-list rules (Phase 38). Pure. IPv4 only (the DB checks family(cidr) = 4).
 *
 * Break-glass: an allow-list blocks only when it is enforced AND has at least one active range. An enforced list with no
 * active range blocks nobody, and every change that would leave the requesting admin's own IP outside an enforced list
 * is refused (SECURITY_SELF_LOCKOUT) - so the Super Admin can never lock themselves out from the console.
 */

/** "203.99.180.44" → 32-bit unsigned number, or null when not a dotted IPv4 address. */
export function parseIpv4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

const toDotted = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const maskOf = (bits: number) => (bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0);

export type Cidr = { network: number; bits: number; text: string };

/**
 * Parses an IPv4 CIDR ("182.180.0.0/16"; a bare address is /32). Host bits are cleared, as PostgreSQL's cidr type
 * requires: "203.99.180.44/24" → 203.99.180.0/24. Null when invalid.
 */
export function parseCidr(input: string): Cidr | null {
  const [addr, len, extra] = input.trim().split('/');
  if (extra !== undefined || !addr) return null;
  const ip = parseIpv4(addr);
  const bits = len === undefined ? 32 : /^\d{1,2}$/.test(len) ? Number(len) : NaN;
  if (ip === null || !(bits >= 0 && bits <= 32)) return null;
  const network = (ip & maskOf(bits)) >>> 0;
  return { network, bits, text: `${toDotted(network)}/${bits}` };
}

/** The request IP as the allow-list sees it: "::ffff:1.2.3.4" → "1.2.3.4", IPv6 loopback "::1" → "127.0.0.1". */
export function normalizeClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.trim().replace(/^::ffff:/i, '');
  return v === '::1' ? '127.0.0.1' : v;
}

/** Is the IP inside the range? */
export function ipInCidr(ip: string, cidr: string): boolean {
  const n = parseIpv4(ip), c = parseCidr(cidr);
  if (n === null || !c) return false;
  return ((n & maskOf(c.bits)) >>> 0) === c.network;
}

export type AllowRange = { cidr: string; label: string; isActive: boolean };

/** The first active range containing the IP, or null. */
export function matchingRange(ip: string | null, ranges: AllowRange[]): AllowRange | null {
  if (!ip) return null;
  return ranges.find((r) => r.isActive && ipInCidr(ip, r.cidr)) ?? null;
}

/**
 * Does the allow-list refuse this IP? Only when enforced with at least one active range (break-glass: an empty list
 * never blocks) and no active range contains the IP. An unknown IP is refused only by a list that would block it anyway.
 */
export function allowlistBlocks(enforced: boolean, ranges: AllowRange[], ip: string | null): boolean {
  if (!enforced) return false;
  if (!ranges.some((r) => r.isActive)) return false;
  return matchingRange(ip, ranges) === null;
}

/**
 * Would a change leave the admin making it outside the list? `after` is the list (and enforcement) as it would be.
 * Used by every settings save and allow-list change: true → refuse with SECURITY_SELF_LOCKOUT.
 */
export function wouldLockOut(enforcedAfter: boolean, rangesAfter: AllowRange[], callerIp: string | null): boolean {
  return allowlistBlocks(enforcedAfter, rangesAfter, callerIp);
}
