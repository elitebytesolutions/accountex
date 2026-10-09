/** Sign-in rules that need no database: login hours, password strength, lockout, device labels. */

/** Lockout is switched off for now (failures are still counted); set true to lock after LOCK_AFTER_FAILURES. */
export const LOCKOUT_ENABLED = false;
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;
/** lastActiveAt is refreshed at most this often (ms). */
export const TOUCH_EVERY_MS = 60_000;

export type LoginHoursRule = { hours: string; from: string | null; to: string | null };

/** BUSINESS = Mon–Sat 09:00–19:00; CUSTOM = Mon–Sat between from and to; ANY = always. Times are in the company's time zone. */
export function withinLoginHours(rule: LoginHoursRule, now: Date, timeZone: string): boolean {
  if (rule.hours === 'ANY') return true;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  if (parts.weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const [from, to] = rule.hours === 'BUSINESS' ? ['09:00', '19:00'] : [rule.from ?? '00:00', rule.to ?? '23:59'];
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return minutes >= toMin(from) && minutes <= toMin(to);
}

/** Null when acceptable, otherwise why not. Same rule as PASSWORD_TOO_WEAK in the error catalogue. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters';
  if (password.length > 72) return 'Use at most 72 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use letters and numbers';
  return null;
}

/** "Chrome · Windows" from a user agent. */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /node|undici|curl/i.test(ua) ? 'API client'
    : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} · ${os}` : browser;
}
