import { Injectable } from '@nestjs/common';
import { DEFAULT_ROLE_LIMITS, type PermissionModule, type Role, type RoleDetail, type RoleLimits } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { RoleStore, type RoleFields } from '../application/role-store.js';

const roleColumns = {
  id: true, name: true, description: true, icon: true, tone: true, systemKey: true, isSystem: true, branchRestricted: true, rowVersion: true,
} as const;

/** Display order of the system roles; custom roles follow by name. */
const SYSTEM_ORDER = ['ADMIN', 'FINANCIAL_ACCOUNTANT', 'HR_MANAGER', 'SALESMAN', 'ORDER_BOOKER', 'DELIVERYMAN', 'STOREKEEPER', 'CASHIER', 'AUDITOR', 'EMPLOYEE'];
const order = (r: { systemKey: string | null; name: string }) => (r.systemKey ? SYSTEM_ORDER.indexOf(r.systemKey) : 100);

@Injectable()
export class PrismaRoleStore extends RoleStore {
  private catalogueCache?: Promise<PermissionModule[]>;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** The catalogue is global and changes only with a deployment, so it is read once. */
  catalogue(): Promise<PermissionModule[]> {
    this.catalogueCache ??= this.prisma
      .db()
      .permissions.findMany({ orderBy: [{ sortOrder: 'asc' }], select: { code: true, module: true, resource: true, resourceLabel: true, action: true } })
      .then((rows) => {
        const modules = new Map<string, Map<string, { resource: string; label: string; actions: Record<string, string> }>>();
        for (const p of rows) {
          const m = modules.get(p.module) ?? new Map();
          modules.set(p.module, m);
          const r = m.get(p.resource) ?? { resource: p.resource, label: p.resourceLabel, actions: {} };
          m.set(p.resource, r);
          r.actions[p.action] = p.code;
        }
        return [...modules].map(([module, resources]) => ({ module, resources: [...resources.values()] }));
      });
    return this.catalogueCache;
  }

  async list(tenantId: string): Promise<Role[]> {
    const db = this.prisma.db();
    const [roles, holders] = await Promise.all([
      db.roles.findMany({ where: { tenantId, deletedAt: null }, select: roleColumns }),
      this.holderCounts(tenantId),
    ]);
    return roles
      .map((r) => ({ ...r, userCount: holders.get(r.id) ?? 0 }))
      .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  }

  async get(tenantId: string, id: string): Promise<RoleDetail | null> {
    const db = this.prisma.db();
    const role = await db.roles.findFirst({
      where: { tenantId, id, deletedAt: null },
      select: { ...roleColumns, RolePermissions: { select: { permissionCode: true } } },
    });
    if (!role) return null;
    const [limits, holders, tenant] = await Promise.all([
      db.roleLimits.findFirst({ where: { tenantId, roleId: id } }),
      db.userRoles.findMany({
        where: { tenantId, roleId: id, Users: { status: { not: 'REMOVED' }, deletedAt: null } },
        select: { Users: { select: { id: true, fullName: true } } },
      }),
      db.tenants.findUnique({ where: { id: tenantId }, select: { defaultUserId: true } }),
    ]);
    const users = holders.map((h) => ({ id: h.Users.id, name: h.Users.fullName })).sort((a, b) => a.name.localeCompare(b.name));
    const { RolePermissions, ...rest } = role;
    return {
      ...rest,
      userCount: users.filter((u) => u.id !== tenant?.defaultUserId).length,
      permissions: RolePermissions.map((p) => p.permissionCode).sort(),
      limits: limits
        ? { maxVoucherAmount: limits.maxVoucherAmount.toNumber(), maxDiscountPct: limits.maxDiscountPct.toNumber(), backdateDays: limits.backdateDays, salaryVisibility: limits.salaryVisibility }
        : DEFAULT_ROLE_LIMITS,
      limitsRowVersion: limits?.rowVersion ?? null,
      users,
    };
  }

  create(fields: RoleFields, copiedFromRoleId: string | null, permissions: string[], limits: RoleLimits) {
    return addUpdate(this.prisma, 'roleAddUpdate', {
      ...fields,
      isSystem: false,
      copiedFromRoleId,
      permissions: permissions.map((permissionCode) => ({ permissionCode })),
      limits: [limits],
    });
  }

  async update(tenantId: string, id: string, rowVersion: number, fields: Partial<RoleFields>, permissions?: string[], limits?: RoleLimits) {
    const db = this.prisma.db();
    const data: Record<string, unknown> = { ...fields, id, rowVersion };
    if (permissions) {
      // Unchanged grants keep their rows (by id), so history shows only real additions and removals.
      const current = await db.rolePermissions.findMany({ where: { tenantId, roleId: id }, select: { id: true, permissionCode: true } });
      data.permissions = [
        ...current.filter((p) => permissions.includes(p.permissionCode)).map((p) => ({ id: p.id })),
        ...permissions.filter((code) => !current.some((p) => p.permissionCode === code)).map((permissionCode) => ({ permissionCode })),
      ];
    }
    if (limits) {
      const current = await db.roleLimits.findFirst({ where: { tenantId, roleId: id }, select: { id: true } });
      data.limits = [current ? { id: current.id, ...limits } : limits];
    }
    await addUpdate(this.prisma, 'roleAddUpdate', data);
  }

  async softDelete(id: string, rowVersion: number) {
    const role = await this.prisma.db().roles.findUnique({ where: { id }, select: { name: true } });
    // The name is unique per company even for deleted roles; suffix it so the name can be used again.
    const { count } = await this.prisma.db().roles.updateMany({
      where: { id, rowVersion, deletedAt: null },
      data: { deletedAt: new Date(), name: `${role?.name ?? 'Role'} (deleted ${id.slice(0, 8)})` },
    });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this role. Reload and try again.');
  }

  /** Users per role, not counting the company's default user (who holds every role). */
  private async holderCounts(tenantId: string) {
    const rows = await this.prisma.db().$queryRaw<{ roleId: string; n: bigint }[]>`
      select ur."roleId"::text as "roleId", count(*) as n
      from "Company"."UserRoles" ur
      join "Company"."Users" u on u.id = ur."userId" and u."status" <> 'REMOVED' and u."deletedAt" is null
      join "Platform"."Tenants" t on t.id = ur."tenantId"
      where ur."tenantId" = ${tenantId}::uuid and u.id is distinct from t."defaultUserId"
      group by ur."roleId"`;
    return new Map(rows.map((r) => [r.roleId, Number(r.n)]));
  }
}
