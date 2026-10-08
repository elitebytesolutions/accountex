/**
 * Privacy request rules (Phase 43). Pure.
 * The erasure itself (the reviewed personal-data column list) lives in the database: Platform.getErasureColumns() and
 * Platform.anonymiseTenant (prisma/sql/108-admin-platform-ops.sql), which also refuses the protected companies.
 */

/** Demo and Test Co are never erased by the application (the database guard refuses them too). */
export const PROTECTED_TENANT_CODES: readonly string[] = ['demo', 'test'];
export const isProtectedTenant = (code: string) => PROTECTED_TENANT_CODES.includes(code.trim().toLowerCase());

/** Days left until the statutory due date (negative = overdue); null once the request is closed. */
export function daysLeft(dueOn: string, step: string, today: string): number | null {
  if (step === 'DONE' || step === 'REJECTED') return null;
  return Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** The typed company code matches (case-insensitive). */
export const codeMatches = (typed: string | null | undefined, code: string) => (typed ?? '').trim().toLowerCase() === code.trim().toLowerCase();

/** Export links are valid 7 days. */
export const exportAvailable = (step: string, expiresAt: Date | null, runStatus: string | null, now = new Date()) =>
  step === 'DONE' && !!expiresAt && expiresAt.getTime() > now.getTime() && runStatus === 'COMPLETED';
