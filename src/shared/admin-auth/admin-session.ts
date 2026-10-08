import { z } from 'zod';

/** The signed-in platform admin (Super Admin portal) as returned by the API. */
export const AdminSessionSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  /** The admin's Platform.PlatformStaff mirror row: the actor id recorded in platform history. */
  staffId: z.string().nullable(),
});

export type AdminSession = z.infer<typeof AdminSessionSchema>;
