/**
 * API key and webhook credential rules (Phase 38). Pure: random bytes and the clock come from the caller.
 */
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const encode = (bytes: Uint8Array) => Array.from(bytes, (b) => BASE62[b % 62]).join('');

/** fs_live_ / fs_test_ (DB check apiKeyEnvPrefixChk ties the prefix to the environment). */
export const apiKeyPrefix = (environment: string) => (environment === 'LIVE' ? 'fs_live_' : 'fs_test_');

/** A new API key: prefix + 32 random base62 characters. */
export const newApiKey = (environment: string, bytes: Uint8Array) => apiKeyPrefix(environment) + encode(bytes.slice(0, 32));

/** A new webhook signing secret: whsec_ + 32 random base62 characters. */
export const newWebhookSecret = (bytes: Uint8Array) => 'whsec_' + encode(bytes.slice(0, 32));

/** fs_live_••••••••••••ab12 */
export const maskKey = (prefix: string, last4: string) => `${prefix}••••••••••••${last4}`;

/** Expiry choice → expiresAt. */
export function expiresAtFor(expiry: string, now: Date): Date | null {
  if (expiry === 'DAYS_90') return new Date(now.getTime() + 90 * 86_400_000);
  if (expiry === 'YEAR_1') return new Date(now.getTime() + 365 * 86_400_000);
  return null;
}

/** Delivery status from the receiver's answer (DB checks: DELIVERED needs a 2xx, TIMEOUT has no response code). */
export function deliveryStatus(responseCode: number | null, timedOut: boolean): 'DELIVERED' | 'FAILED' | 'TIMEOUT' {
  if (timedOut) return 'TIMEOUT';
  return responseCode !== null && responseCode >= 200 && responseCode <= 299 ? 'DELIVERED' : 'FAILED';
}

/** The signed string: "<unix seconds>.<body>" (header: t=<unix>,v1=<hex hmac-sha256>). */
export const signedContent = (unixSeconds: number, body: string) => `${unixSeconds}.${body}`;
