/** Reseller rules (Phase 38). Pure. */

/** "PK36MEZN0001234567894471" → "PK36 MEZN •••• 4471" (template card / statement mask). */
export const maskIban = (iban: string) => `${iban.slice(0, 4)} ${iban.slice(4, 8)} •••• ${iban.slice(-4)}`;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A partner invite code such as "P-7KQ2M9XA", from random bytes (unambiguous letters and digits). */
export function inviteCodeFrom(bytes: Uint8Array): string {
  return 'P-' + Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join('');
}
