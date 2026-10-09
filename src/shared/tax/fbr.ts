import { z } from 'zod';

export const FBR_AUTHORITIES = ['FBR', 'PRA'] as const;
export type FbrAuthority = (typeof FBR_AUTHORITIES)[number];

export const FbrBranchMappingSchema = z.object({ id: z.string(), branchId: z.string().nullable(), branchName: z.string().nullable(), posId: z.string(), isActive: z.boolean() });
export type FbrBranchMapping = z.infer<typeof FbrBranchMappingSchema>;

/** Settings for one authority. The API token is never returned: only whether one is saved and its last 4 characters. */
export const FbrSettingSchema = z.object({
  authority: z.enum(FBR_AUTHORITIES),
  /** null until the authority is set up. */
  id: z.string().nullable(),
  environment: z.string(),
  posId: z.string(),
  ntn: z.string(),
  strn: z.string().nullable(),
  hasToken: z.boolean(),
  tokenHint: z.string().nullable(),
  tokenExpiresOn: z.string().nullable(),
  reportOnPosting: z.boolean(),
  printQr: z.boolean(),
  blockIfUnreachable: z.boolean(),
  /** Phase 28: documents are sent to FBR only while this is on (off by default; switched on at go-live). */
  sendingEnabled: z.boolean(),
  syncIntervalMinutes: z.number().int(),
  connectionStatus: z.string(),
  lastHealthCheckAt: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
  isActive: z.boolean(),
  mappings: z.array(FbrBranchMappingSchema),
  rowVersion: z.number().int().nullable(),
});
export type FbrSetting = z.infer<typeof FbrSettingSchema>;

const posId = z.string().trim().regex(/^[0-9]{4,10}$/, '4–10 digits');

/**
 * PUT /tax/fbr/:authority. NTN / STRN come from the company profile. `apiToken`: a new token to store (encrypted);
 * omit to keep the saved one; `clearToken` removes it. Mappings are replaced as a list (null branch = all branches).
 */
export const FbrSettingSaveSchema = z.object({
  environment: z.enum(['SANDBOX', 'PRODUCTION']).default('SANDBOX'),
  posId,
  apiToken: z.string().trim().min(8, 'Paste the full token').max(4000).optional(),
  clearToken: z.boolean().default(false),
  tokenExpiresOn: z.iso.date().optional().nullable().transform((v) => v ?? null),
  reportOnPosting: z.boolean().default(true),
  printQr: z.boolean().default(true),
  blockIfUnreachable: z.boolean().default(false),
  sendingEnabled: z.boolean().default(false),
  syncIntervalMinutes: z.coerce.number().int().min(1, '1–1440').max(1440, '1–1440').default(5),
  isActive: z.boolean().default(true),
  mappings: z
    .array(z.object({ id: z.uuid().optional(), branchId: z.uuid().nullable(), posId, isActive: z.boolean().default(true) }))
    .default([])
    .refine((m) => new Set(m.map((x) => x.branchId ?? 'ALL')).size === m.length, 'Each branch once'),
  rowVersion: z.coerce.number().int().min(0).optional(),
});
export type FbrSettingSave = z.infer<typeof FbrSettingSaveSchema>;
export type FbrSettingSaveFields = z.input<typeof FbrSettingSaveSchema>;
