import { z } from 'zod';

/** The signed-in tenant user as returned by the API. */
export const SessionUserSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  /** The workspace (company) name shown in the sidebar. */
  tenantName: z.string(),
  email: z.string(),
  name: z.string(),
  /** Role keys; a user can hold several. */
  roles: z.array(z.string()),
  /** Permission codes ("mylv:view") from all roles combined. */
  permissions: z.array(z.string()),
  /** Set by an admin (new account, password reset): only own-account screens open until a new password is set. */
  mustChangePassword: z.boolean(),
});

export type SessionUser = z.infer<typeof SessionUserSchema>;
