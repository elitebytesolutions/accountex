import { z } from 'zod';

/** One posting role and the account it posts to (Company.DefaultAccountMappings). */
export const AccountMappingSchema = z.object({
  role: z.string(),
  name: z.string(),
  roleGroup: z.string(),
  normalBalance: z.string(),
  accountId: z.string().nullable(),
  accountCode: z.string().nullable(),
  accountName: z.string().nullable(),
});
export type AccountMapping = z.infer<typeof AccountMappingSchema>;

/** PUT /settings/account-mappings: the roles sent are set (accountId) or cleared (null). */
export const AccountMappingSaveSchema = z.object({
  mappings: z.array(z.object({ role: z.string().regex(/^[A-Z][A-Z0-9_]{2,40}$/), accountId: z.uuid().nullable() })).min(1),
});
export type AccountMappingSave = z.infer<typeof AccountMappingSaveSchema>;
