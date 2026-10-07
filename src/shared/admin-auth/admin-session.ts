import { z } from 'zod';

/** The signed-in platform admin (Super Admin portal) as returned by the API. */
export const AdminSessionSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

export type AdminSession = z.infer<typeof AdminSessionSchema>;
