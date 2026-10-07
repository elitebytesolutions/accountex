import type { PermissionModule, Role, RoleDetail, RoleLimits } from '../../../../../shared/index.js';

export type RoleFields = { name: string; description: string | null; icon: string | null; tone: string | null; branchRestricted: boolean };

/** Port: roles, their grants and limits (Company.roleAddUpdate). Writes run inside a UnitOfWork. */
export abstract class RoleStore {
  /** Permission catalogue grouped by module, resources in catalogue order. */
  abstract catalogue(): Promise<PermissionModule[]>;
  abstract list(tenantId: string): Promise<Role[]>;
  abstract get(tenantId: string, id: string): Promise<RoleDetail | null>;
  abstract create(fields: RoleFields, copiedFromRoleId: string | null, permissions: string[], limits: RoleLimits): Promise<string>;
  /** Partial update; grants and limits are replaced when given. */
  abstract update(tenantId: string, id: string, rowVersion: number, fields: Partial<RoleFields>, permissions?: string[], limits?: RoleLimits): Promise<void>;
  /** Soft delete; the name is freed for reuse. */
  abstract softDelete(id: string, rowVersion: number): Promise<void>;
}
