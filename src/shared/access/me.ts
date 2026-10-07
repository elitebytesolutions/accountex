import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

/** My Profile › Account & Security › Profile tab. */
export const MyProfileSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  defaultBranchId: z.string().nullable(),
  branches: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  roles: z.array(z.string()),
  approvalLimit: z.number(),
  dataScope: z.string(),
  lastLoginAt: z.string().nullable(),
  passwordChangedAt: z.string().nullable(),
  mustChangePassword: z.boolean(),
  rowVersion: z.number().int(),
});
export type MyProfile = z.infer<typeof MyProfileSchema>;

export const MyProfileUpdateSchema = z.object({
  firstName: optionalText(60),
  lastName: optionalText(60),
  fullName: z.string().trim().min(2, 'Display name is required').max(120),
  jobTitle: optionalText(80),
  phone: optionalText(30),
  defaultBranchId: z.uuid().optional().nullable().transform((v) => v ?? null),
  rowVersion: z.coerce.number().int().min(0),
});
export type MyProfileUpdate = z.infer<typeof MyProfileUpdateSchema>;
export type MyProfileUpdateFields = z.input<typeof MyProfileUpdateSchema>;

/** POST /me/password */
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(72),
    newPassword: z.string().min(1, 'Enter a new password').max(72),
    confirmPassword: z.string().min(1, 'Repeat the new password'),
  })
  .refine((p) => p.newPassword === p.confirmPassword, { path: ['confirmPassword'], message: "Passwords don't match" })
  .refine((p) => p.newPassword !== p.currentPassword, { path: ['newPassword'], message: 'Choose a password you have not just used' });
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

/** Template "Notifications" switches → UserPreferences.notifyEvents. */
export const NOTIFY_EVENTS = [
  { code: 'APPROVAL_ASSIGNED', label: 'Approval requests assigned to me' },
  { code: 'DOC_REJECTED', label: 'Vouchers rejected or returned' },
  { code: 'BANK_ALERT', label: 'Bank feed & reconciliation alerts' },
  { code: 'CREDIT_BREACH', label: 'Customer credit limit breaches' },
  { code: 'DAILY_CASH_POSITION', label: 'Daily cash position email (08:00)' },
  { code: 'TAX_DUE', label: 'Tax return due reminders' },
] as const;

/** My Profile › Preferences tab (Company.UserPreferences; defaults until first saved). */
export const MyPreferencesSchema = z.object({
  language: z.string().min(1),
  dateFormat: z.string().min(1),
  numberFormat: z.string().min(1),
  startRoute: z.string().min(1),
  theme: z.string().min(1),
  compactTables: z.boolean(),
  showAccountCodes: z.boolean(),
  notifyEvents: z.array(z.string()),
  notifyWhatsapp: z.boolean(),
});
export type MyPreferences = z.infer<typeof MyPreferencesSchema>;
export const MyPreferencesResponseSchema = MyPreferencesSchema.extend({ saved: z.boolean(), rowVersion: z.number().int() });
export type MyPreferencesResponse = z.infer<typeof MyPreferencesResponseSchema>;
export const MyPreferencesUpdateSchema = MyPreferencesSchema.extend({ rowVersion: z.coerce.number().int().min(0).optional() });
export type MyPreferencesUpdate = z.infer<typeof MyPreferencesUpdateSchema>;
