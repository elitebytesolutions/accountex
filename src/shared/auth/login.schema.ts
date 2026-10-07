import { z } from 'zod';

export const LoginSchema = z.object({
  /** Platform.Tenants.code, e.g. "demo". */
  companyCode: z.string({ error: 'Company code is required' }).trim().toLowerCase().min(1, 'Company code is required').max(40),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required').max(72),
});

export type LoginInput = z.infer<typeof LoginSchema>;
