import { z } from 'zod';

/** Optional free text: trimmed, empty → null. */
export const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
/** Optional amount ≥ 0 (blank → null). */
export const optionalAmount = z.coerce.number().min(0, 'Not negative').max(100_000_000_000).optional().nullable().transform((v) => v ?? null);
/** Master codes like CASH_SALES (BankCash categories, banks). */
export const masterCode = (max: number) =>
  z.string().trim().toUpperCase().regex(new RegExp(`^[A-Z][A-Z0-9_]{1,${max - 1}}$`), 'Capital letters, digits and _ (start with a letter)');

/** Linked GL account in a short form for lists. */
export const GlRefSchema = z.object({ id: z.string(), code: z.string(), name: z.string() });
export type GlRef = z.infer<typeof GlRefSchema>;

/**
 * How a bank or cash account gets its GL account: create a new postable account under a group
 * (default: the group of the company's default bank / cash mapping), or link an existing unused postable account.
 */
export const GlLinkSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('create'), parentId: z.uuid().optional().nullable().transform((v) => v ?? null) }),
  z.object({ mode: z.literal('link'), accountId: z.uuid('Choose the GL account') }),
]);
export type GlLink = z.infer<typeof GlLinkSchema>;

/** Status actions shared by the masters that switch between active and inactive. */
export const ACTIVE_ACTIONS = ['activate', 'deactivate'] as const;
