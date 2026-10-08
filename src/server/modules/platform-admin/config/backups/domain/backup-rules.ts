/** Backup rules (Phase 38). Pure. */

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

/** bk-20261007-140512 (UTC), the template's backup naming. */
export const backupCode = (d: Date) => `bk-${stamp(d)}`;

/** Phase 43: ex-<company code>-20261007-140512 (UTC), a tenant export (TENANT_EXPORT). */
export const exportCode = (tenantCode: string, d: Date) => `ex-${tenantCode.toLowerCase().replace(/[^a-z0-9]/g, '')}-${stamp(d)}`;

/** Backups are kept 35 days (template: "retained 35 days"). */
export const retentionUntil = (d: Date) => new Date(d.getTime() + 35 * 86_400_000);

/** A RUNNING backup with no result after 6 hours was interrupted (e.g. a server restart). */
export const isStale = (startedAt: Date, now: Date) => now.getTime() - startedAt.getTime() > 6 * 3_600_000;

/**
 * Phase 43: columns never written to a tenant export (password and MFA secrets, token / key hashes, encrypted secrets).
 * Matched by column name in every table.
 */
export const EXPORT_SECRET_COLUMNS: readonly string[] = [
  'passwordHash', 'mfaSecretEnc', 'mfaRecoveryCodes', 'tokenHash', 'keyHash', 'secretHash', 'secretEnc', 'ciphertext', 'signingSecretEnc', 'tokenEnc',
];
