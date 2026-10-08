/**
 * Password policy and sign-in lockout rules (Phase 38). Pure.
 */
export type PasswordPolicy = {
  pwMinLength: number;
  pwRequireMixedCase: boolean;
  pwRequireNumber: boolean;
  pwRequireSymbol: boolean;
  pwBlockBreached: boolean;
};

/**
 * Commonly breached passwords. A local stand-in for the template's HIBP check: the server makes no outbound call to a
 * breach service, so "block breached" refuses these and any password that is one of them plus digits / symbols.
 */
const COMMON = [
  'password', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'qwerty', 'qwertyuiop', 'letmein', 'welcome', 'admin', 'administrator',
  'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess', 'trustno1', 'abc123', 'superadmin',
  'changeme', 'change-me-please', 'pakistan', 'accountex', 'finsoft', '123456', '1234567890', 'qwerty123', 'asdfghjkl', 'zxcvbnm',
];
const COMMON_ROOT = new Set(COMMON.map((w) => w.replace(/[^a-z]/g, '')).filter((w) => w.length >= 4));

/** Is it a well-known breached password (or one of them with digits / symbols added)? */
export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  if (COMMON.includes(lower)) return true;
  const letters = lower.replace(/[^a-z]/g, '');
  return /^\d+$/.test(lower) || (COMMON_ROOT.has(letters) && letters.length >= lower.length - 6);
}

/** Problems with a new password under the policy (empty when it passes). */
export function passwordPolicyErrors(password: string, p: PasswordPolicy): string[] {
  const e: string[] = [];
  if (password.length < p.pwMinLength) e.push(`At least ${p.pwMinLength} characters`);
  if (p.pwRequireMixedCase && !(/[a-z]/.test(password) && /[A-Z]/.test(password))) e.push('Upper and lower case letters');
  if (p.pwRequireNumber && !/\d/.test(password)) e.push('At least one number');
  if (p.pwRequireSymbol && !/[^A-Za-z0-9]/.test(password)) e.push('At least one symbol');
  if (p.pwBlockBreached && isCommonPassword(password)) e.push('Not a common or breached password');
  return e;
}

/** Is the account locked right now? */
export const isLocked = (lockedUntil: Date | null, now = new Date()) => lockedUntil !== null && lockedUntil.getTime() > now.getTime();

/** Whole minutes until the lock lifts (at least 1). */
export const minutesLeft = (lockedUntil: Date, now = new Date()) => Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
