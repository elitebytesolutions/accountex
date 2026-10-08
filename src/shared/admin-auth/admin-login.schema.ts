import { z } from 'zod';

/** Super Admin sign-in: no company code (the Super Admin belongs to no tenant). */
export const AdminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required').max(72),
});

export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
