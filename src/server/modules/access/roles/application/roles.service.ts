import { Injectable } from '@nestjs/common';
import {
  DEFAULT_ROLE_LIMITS,
  type PermissionModule,
  type Role,
  type RoleCreate,
  type RoleDetail,
  type RoleUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { SodRulesService } from '../../sod-rules/application/sod-rules.service.js';
import { RoleStore, type RoleFields } from './role-store.js';

/** Roles & Permissions: custom roles, the permission matrix and data limits. System roles keep their name; Admin keeps everything. */
@Injectable()
export class RolesService {
  constructor(
    private readonly store: RoleStore,
    private readonly unitOfWork: UnitOfWork,
    private readonly sod: SodRulesService,
  ) {}

  catalogue(): Promise<PermissionModule[]> {
    return this.store.catalogue();
  }

  list(user: SessionUser): Promise<Role[]> {
    return this.store.list(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<RoleDetail> {
    const role = await this.store.get(user.tenantId, id);
    if (!role) throw new NotFoundError('Role not found');
    return role;
  }

  /** A custom role, starting from another role's grants and limits (or from nothing). */
  async create(user: SessionUser, meta: RequestMeta, input: RoleCreate): Promise<RoleDetail> {
    const base = input.copyFromRoleId ? await this.get(user, input.copyFromRoleId) : null;
    const { copyFromRoleId, ...fields } = input;
    if (base) await this.sod.assertRoleAllowed(user.tenantId, base.permissions, false);
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.create(
        { ...fields, icon: fields.icon ?? base?.icon ?? 'shield', tone: fields.tone ?? base?.tone ?? 'neutral' },
        copyFromRoleId,
        base?.permissions ?? [],
        base?.limits ?? DEFAULT_ROLE_LIMITS,
      ),
    );
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: RoleUpdate): Promise<RoleDetail> {
    const role = await this.current(user, id, input.rowVersion);
    const { rowVersion, permissions, limits, ...fields } = input;
    if (role.isSystem && fields.name !== undefined && fields.name !== role.name) {
      throw new ConflictError("System roles can't be renamed.", undefined, { code: 'ROLE_SYSTEM_LOCKED' });
    }
    if (permissions) {
      const known = new Set((await this.store.catalogue()).flatMap((m) => m.resources.flatMap((r) => Object.values(r.actions))));
      const unknown = permissions.filter((p) => !known.has(p));
      if (unknown.length) throw new ValidationError('Unknown permissions', { permissions: unknown });
      if (role.systemKey === 'ADMIN' && known.size !== new Set(permissions).size) {
        throw new ConflictError('The Admin role always keeps every permission.', undefined, { code: 'ROLE_SYSTEM_LOCKED' });
      }
      await this.sod.assertRoleAllowed(user.tenantId, permissions, role.systemKey === 'ADMIN');
    }
    await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.update(user.tenantId, id, rowVersion, fields as Partial<RoleFields>, permissions ? [...new Set(permissions)] : undefined, limits),
    );
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const role = await this.current(user, id, rowVersion);
    if (role.isSystem) throw new ConflictError("System roles can't be deleted.", undefined, { code: 'ROLE_SYSTEM_LOCKED' });
    if (role.userCount > 0) {
      throw new ConflictError(`${role.userCount} user${role.userCount === 1 ? ' holds' : 's hold'} this role. Move them to another role first.`, undefined, { code: 'ROLE_IN_USE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(id, rowVersion));
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const role = await this.get(user, id);
    if (role.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this role. Reload and try again.');
    return role;
  }
}
