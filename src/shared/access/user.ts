import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** A job role as shown on a user (pill with icon and tone). EMPLOYEE is never listed: every user holds it. */
export const UserRoleRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemKey: z.string().nullable(),
  icon: z.string().nullable(),
  tone: z.string().nullable(),
});
export type UserRoleRef = z.infer<typeof UserRoleRefSchema>;

export const UserBranchRefSchema = z.object({ id: z.string(), code: z.string(), name: z.string() });

/** Users table row (Settings › Users). */
export const UserListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  isExternal: z.boolean(),
  externalOrg: z.string().nullable(),
  status: z.string(),
  roles: z.array(UserRoleRefSchema),
  branches: z.array(UserBranchRefSchema),
  mfaEnabled: z.boolean(),
  lastActiveAt: z.string().nullable(),
  lastDevice: z.string().nullable(),
  /** The company's default user: holds every role and can't be suspended or removed. */
  isDefaultUser: z.boolean(),
  createdAt: z.string(),
});
export type UserListItem = z.infer<typeof UserListItemSchema>;

/** User detail drawer and edit wizard. */
export const UserDetailSchema = UserListItemSchema.extend({
  dataScope: z.string(),
  moduleAccess: z.array(z.string()),
  approvalLimit: z.number(),
  defaultBranchId: z.string().nullable(),
  ipRestricted: z.boolean(),
  ipAllowlist: z.array(z.string()),
  sessionTimeoutMin: z.number().int(),
  loginHours: z.string(),
  loginFrom: z.string().nullable(),
  loginTo: z.string().nullable(),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().nullable(),
  lastLoginIp: z.string().nullable(),
  rowVersion: z.number().int(),
});
export type UserDetail = z.infer<typeof UserDetailSchema>;

/** Template wizard › Modules switches (Users.moduleAccess). */
export const USER_MODULES = ['FINANCE', 'SALES', 'PURCHASES', 'INVENTORY', 'HR', 'PAYROLL', 'REPORTS', 'SETTINGS'] as const;
export const SESSION_TIMEOUTS = [15, 30, 60, 240, 480] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');
const cidr = z.string().trim().regex(/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/, 'Use an IPv4 address or range, e.g. 39.32.0.0/16');

/** Fields edited by the wizard (identity, role, access, security). Same rules as the database. */
const UserAccessFields = {
  fullName: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  phone: optionalText(30),
  jobTitle: optionalText(80),
  department: optionalText(80),
  isExternal: z.boolean().default(false),
  externalOrg: optionalText(120),
  /** Job roles; EMPLOYEE is added by the database. The first is the primary role. */
  roleIds: z.array(z.uuid()).min(1, 'Choose at least one role'),
  branchIds: z.array(z.uuid()).min(1, 'Pick at least one branch'),
  moduleAccess: z.array(z.enum(USER_MODULES)).default([]),
  approvalLimit: z.coerce.number().min(0).max(1_000_000_000).default(0),
  dataScope: z.string().min(1).default('BRANCH'),
  ipRestricted: z.boolean().default(false),
  ipAllowlist: z.array(cidr).default([]),
  sessionTimeoutMin: z.coerce.number().int().refine((n) => (SESSION_TIMEOUTS as readonly number[]).includes(n), 'Choose a timeout').default(60),
  loginHours: z.string().min(1).default('ANY'),
  loginFrom: hhmm.optional().nullable().transform((v) => v ?? null),
  loginTo: hhmm.optional().nullable().transform((v) => v ?? null),
};

const accessRules = <T extends z.ZodType<{ ipRestricted?: boolean; ipAllowlist?: string[]; loginHours?: string; loginFrom?: string | null; loginTo?: string | null; isExternal?: boolean; externalOrg?: string | null }>>(s: T) =>
  s
    .refine((u) => !u.ipRestricted || (u.ipAllowlist?.length ?? 0) > 0, { path: ['ipAllowlist'], message: 'Add at least one office network' })
    .refine((u) => u.loginHours !== 'CUSTOM' || (u.loginFrom && u.loginTo && u.loginFrom < u.loginTo), { path: ['loginTo'], message: 'End time must be after start time' })
    .refine((u) => !u.isExternal || !!u.externalOrg, { path: ['externalOrg'], message: 'Organisation is required for an external user' });

/** POST /settings/users: "Create account now" with a temporary password. */
export const UserCreateSchema = accessRules(
  z.object({
    ...UserAccessFields,
    temporaryPassword: z.string().min(1, 'Set a temporary password').max(72),
    mustChangePassword: z.boolean().default(true),
  }),
);
export type UserCreate = z.infer<typeof UserCreateSchema>;
export type UserCreateFields = z.input<typeof UserCreateSchema>;

/** PATCH /settings/users/:id: any wizard fields; roles and branches are replaced when sent. */
export const UserUpdateSchema = accessRules(patchFields(UserAccessFields).extend(RowVersionSchema.shape));
export type UserUpdate = z.infer<typeof UserUpdateSchema>;

/** POST /settings/users/:id/reset-password */
export const ResetPasswordSchema = z.object({
  temporaryPassword: z.string().min(1, 'Set a temporary password').max(72),
  rowVersion: z.coerce.number().int().min(0),
});
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

/** KPI strip of Settings › Users. */
export const UserSummarySchema = z.object({
  active: z.number(),
  suspended: z.number(),
  external: z.number(),
  total: z.number(),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;

/** One recent action by the user (their audit entries as actor). */
export const UserActivitySchema = z.object({
  occurredAt: z.string(),
  action: z.string(),
  schema: z.string(),
  table: z.string(),
  recordId: z.string().nullable(),
});
export type UserActivity = z.infer<typeof UserActivitySchema>;

/** A signed-in device (own Security tab and the admin's user drawer). */
export const UserSessionSchema = z.object({
  id: z.string(),
  deviceLabel: z.string().nullable(),
  clientType: z.string(),
  ipAddress: z.string().nullable(),
  signedInAt: z.string(),
  lastActiveAt: z.string(),
  current: z.boolean(),
});
export type UserSession = z.infer<typeof UserSessionSchema>;

// ---------------------------------------------------------------- Phase 44: invites and sign-in links
/**
 * POST /settings/users/invite: the wizard's fields without a password. The user is created INVITED and sets their own
 * password from a one-time link (7 days) the admin copies or shares on WhatsApp (no email provider yet).
 */
export const UserInviteSchema = accessRules(
  z.object({
    ...UserAccessFields,
    channels: z.array(z.enum(['EMAIL', 'WHATSAPP'])).min(1).default(['EMAIL']),
  }),
);
export type UserInviteInput = z.infer<typeof UserInviteSchema>;
export type UserInviteFields = z.input<typeof UserInviteSchema>;

/** A one-time sign-in link: shown once, never stored (only its hash is). `path` is relative to the app's origin. */
export type SignInLink = { path: string; expiresAt: string; purpose: 'INVITE' | 'ADMIN_RESET' };

export type PendingInvite = {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string | null;
  channels: string[];
  invitedBy: { id: string; name: string } | null;
  sentAt: string;
  expiresAt: string;
  resendCount: number;
  /** PENDING, or EXPIRED once the link's time has passed. */
  status: string;
  rowVersion: number;
};
export type UserInviteResult = { user: UserDetail; link: SignInLink };
