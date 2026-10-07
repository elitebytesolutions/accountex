import { z } from 'zod';

/** Pakistani tax identifiers, as the DB checks them. Blank → null. */
const formatted = (re: RegExp, example: string) =>
  z.string().trim().regex(re, `Like ${example}`).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
export const ntnField = formatted(/^\d{7}-\d$/, '1234567-8');
export const cnicField = formatted(/^\d{5}-\d{7}-\d$/, '35202-1234567-1');
export const strnField = formatted(/^\d{2}-\d{2}-\d{4}-\d{3}-\d{2}$/, '03-04-1234-567-89');
export const phoneField = formatted(/^[0-9+\-\s()]{7,20}$/, '0300-1234567');
export const emailField = z.email('Like accounts@company.pk').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
export const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
/** Optional date (YYYY-MM-DD). */
export const optionalDate = z.iso.date('Use a date').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));

/** A short reference for selects and lists. */
export const PartyRefSchema = z.object({ id: z.string(), name: z.string() });
export type PartyRef = z.infer<typeof PartyRefSchema>;

/** Days implied by a payment-terms code (NET_30 → 30; advance / on receipt / COD → 0); null when it doesn't say. */
export function termsDays(terms: string): number | null {
  const m = /^NET_(\d+)$/.exec(terms);
  if (m) return Number(m[1]);
  return ['ADVANCE', 'ADVANCE_50', 'ON_RECEIPT', 'DUE_ON_RECEIPT', 'COD'].includes(terms) ? 0 : null;
}

/** Initials for the avatar: "City Mart Superstores" → "CM". */
export function partyInitials(name: string): string {
  const words = name.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}
