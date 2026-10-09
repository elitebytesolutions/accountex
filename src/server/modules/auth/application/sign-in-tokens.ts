import { createHash, randomBytes } from 'node:crypto';

/** One-time sign-in links (invite, password reset): 32 random bytes; only the sha256 is stored (PasswordResets.tokenHash). */
export const INVITE_DAYS = 7;
export const ADMIN_RESET_HOURS = 24;
export const SELF_RESET_MINUTES = 30;

export function newSignInToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashSignInToken(token) };
}

export function hashSignInToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/** The app path that opens a link (the client adds its own origin). */
export const signInPath = (token: string) => `/login/reset?token=${token}`;
