import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';

/** Permission matrix columns, in template order (V C E A P D X). */
export const PERMISSION_ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'POST', 'DELETE', 'EXPORT'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** One resource row of the catalogue with the actions it supports. */
export const PermissionResourceSchema = z.object({
  resource: z.string(),
  label: z.string(),
  /** Codes by action, e.g. { VIEW: "coa:view" }. Missing action = not applicable. */
  actions: z.record(z.string(), z.string()),
});
/** GET /settings/permissions: catalogue grouped by module (Company.Permissions). */
export const PermissionModuleSchema = z.object({ module: z.string(), resources: z.array(PermissionResourceSchema) });
export type PermissionModule = z.infer<typeof PermissionModuleSchema>;

export const RoleLimitsSchema = z.object({
  maxVoucherAmount: z.coerce.number().min(0, 'Not negative').max(1_000_000_000),
  maxDiscountPct: z.coerce.number().min(0, '0–100').max(100, '0–100'),
  backdateDays: z.coerce.number().int().refine((d) => [0, 3, 7, 30, 365].includes(d), 'Choose a value'),
  salaryVisibility: z.string().min(1),
});
export type RoleLimits = z.infer<typeof RoleLimitsSchema>;
export const DEFAULT_ROLE_LIMITS: RoleLimits = { maxVoucherAmount: 0, maxDiscountPct: 0, backdateDays: 0, salaryVisibility: 'HIDDEN' };

/** Role list item (left column of Roles & Permissions). */
export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  tone: z.string().nullable(),
  systemKey: z.string().nullable(),
  isSystem: z.boolean(),
  branchRestricted: z.boolean(),
  /** Users holding the role, not counting the company's default user (who holds every role). */
  userCount: z.number(),
  rowVersion: z.number().int(),
});
export type Role = z.infer<typeof RoleSchema>;

export const RoleDetailSchema = RoleSchema.extend({
  permissions: z.array(z.string()),
  limits: RoleLimitsSchema,
  limitsRowVersion: z.number().int().nullable(),
  users: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type RoleDetail = z.infer<typeof RoleDetailSchema>;

const RoleFields = {
  name: z.string().trim().min(2, 'Give the role a name').max(40, 'At most 40 characters'),
  description: z.string().trim().max(200).optional().nullable().transform((v) => (v ? v : null)),
  icon: z.string().trim().max(40).optional().nullable().transform((v) => (v ? v : null)),
  tone: z.string().optional().nullable().transform((v) => (v ? v : null)),
  branchRestricted: z.boolean().default(true),
};

/** POST /settings/roles: a custom role, starting from another role's permissions and limits. */
export const RoleCreateSchema = z.object({ ...RoleFields, copyFromRoleId: z.uuid().optional().nullable().transform((v) => v ?? null) });
export type RoleCreate = z.infer<typeof RoleCreateSchema>;
export type RoleCreateFields = z.input<typeof RoleCreateSchema>;

/** PATCH /settings/roles/:id. Optionally replaces grants and limits in the same save (matrix save bar). */
export const RoleUpdateSchema = patchFields(RoleFields)
  .extend({
    permissions: z.array(z.string().regex(/^[a-z]+:[a-z]+$/)).optional(),
    limits: RoleLimitsSchema.optional(),
  })
  .extend(RowVersionSchema.shape);
export type RoleUpdate = z.infer<typeof RoleUpdateSchema>;
