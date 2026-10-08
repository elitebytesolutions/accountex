import { Injectable } from '@nestjs/common';
import type { AdminHistoryPage, AdminSession, HistoryQuery, RoleGrantMatrix, RoleGrantRole } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { RoleGrantStore } from './seed-store.js';

/** The Admin system role always holds every permission (same rule as Settings › Roles). */
const LOCKED = new Set(['ADMIN']);

/**
 * Default role grants (Templates › Default role grants): the permission set each system role starts with in a new
 * company (Platform.provisionTenant reads Platform.SystemRoleGrants). Existing companies keep their own roles.
 */
@Injectable()
export class RoleGrantsService {
  constructor(
    private readonly store: RoleGrantStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async matrix(): Promise<RoleGrantMatrix> {
    const [roles, catalogue, grants, changed] = await Promise.all([this.store.systemRoles(), this.store.catalogue(), this.store.grants(), this.store.lastChanged()]);
    return {
      catalogue,
      roles: roles.map((r) => this.role(r, grants, changed)),
    };
  }

  /** Replaces one role's grants by difference (unchanged grants leave no history). */
  async save(admin: AdminSession, meta: RequestMeta, systemKey: string, permissions: string[]): Promise<RoleGrantRole> {
    const role = (await this.store.systemRoles()).find((r) => r.systemKey === systemKey);
    if (!role) throw new NotFoundError(`Unknown system role ${systemKey}`);
    if (LOCKED.has(systemKey)) throw new ConflictError('The Admin role always keeps every permission.', undefined, { code: 'SYSTEM_ROLE_LOCKED' });
    const known = new Set((await this.store.catalogue()).flatMap((m) => m.resources.flatMap((r) => Object.values(r.actions))));
    const unknown = [...new Set(permissions)].filter((p) => !known.has(p));
    if (unknown.length) throw new ValidationError(`Unknown permission${unknown.length > 1 ? 's' : ''}: ${unknown.slice(0, 5).join(', ')}`, { permissions: unknown }, { code: 'PERMISSION_UNKNOWN' });
    const want = new Set(permissions);
    const have = new Set((await this.store.grants()).filter((g) => g.systemKey === systemKey).map((g) => g.permissionCode));
    const add = [...want].filter((p) => !have.has(p));
    const remove = [...have].filter((p) => !want.has(p));
    if (add.length || remove.length) await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.apply(systemKey, add, remove));
    const [grants, changed] = await Promise.all([this.store.grants(), this.store.lastChanged()]);
    return this.role(role, grants, changed);
  }

  history(systemKey: string, query: HistoryQuery): Promise<AdminHistoryPage> {
    return this.store.history(systemKey, query.pageSize, (query.page - 1) * query.pageSize);
  }

  private role(r: { systemKey: string; label: string; isActive: boolean }, grants: { systemKey: string; permissionCode: string }[], changed: Map<string, string>): RoleGrantRole {
    return {
      ...r,
      locked: LOCKED.has(r.systemKey),
      permissions: grants.filter((g) => g.systemKey === r.systemKey).map((g) => g.permissionCode),
      updatedAt: changed.get(r.systemKey) ?? null,
    };
  }
}
