/** Backup rules (Phase 38). Pure. */

const pad = (n: number) => String(n).padStart(2, '0');

/** bk-20261007-140512 (UTC), the template's backup naming. */
export const backupCode = (d: Date) =>
  `bk-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

/** Backups are kept 35 days (template: "retained 35 days"). */
export const retentionUntil = (d: Date) => new Date(d.getTime() + 35 * 86_400_000);

/** A RUNNING backup with no result after 6 hours was interrupted (e.g. a server restart). */
export const isStale = (startedAt: Date, now: Date) => now.getTime() - startedAt.getTime() > 6 * 3_600_000;
