/**
 * Coupon rules (Phase 36). The percent cap and date order are shared with the UI (couponErrors in
 * src/shared/platform/coupon.ts) and checked by the DB; these decide the stored status.
 */

/** Today's date (YYYY-MM-DD) in Pakistan time, the platform's business day. */
export function todayPk(now = new Date()): string {
  return new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * The status to store after a save: a paused coupon stays paused; any other follows its dates
 * (SCHEDULED before the start, EXPIRED after the expiry, else ACTIVE).
 */
export function statusFor(c: { paused: boolean; startsOn: string; expiresOn: string | null }, today: string): string {
  if (c.paused) return 'PAUSED';
  if (c.expiresOn && c.expiresOn < today) return 'EXPIRED';
  return c.startsOn > today ? 'SCHEDULED' : 'ACTIVE';
}
