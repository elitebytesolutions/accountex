import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { User } from '../domain/user.entity.js';
import { UserRepository } from '../domain/user.repository.js';

const userColumns = {
  id: true,
  tenantId: true,
  Tenants: { select: { displayName: true, timezone: true } },
  email: true,
  fullName: true,
  mustChangePassword: true,
  sessionTimeoutMin: true,
  UserRoles: {
    where: { Roles: { deletedAt: null } },
    select: { Roles: { select: { id: true, systemKey: true, RolePermissions: { select: { permissionCode: true } } } } },
  },
} as const;

/** Company.Users rows that may sign in. */
const active = { status: 'ACTIVE', deletedAt: null } as const;

type UserRow = {
  id: string;
  tenantId: string;
  Tenants: { displayName: string; timezone: string };
  email: string;
  fullName: string;
  mustChangePassword: boolean;
  sessionTimeoutMin: number;
  UserRoles: { Roles: { id: string; systemKey: string | null; RolePermissions: { permissionCode: string }[] } }[];
};

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string) {
    const row = await this.prisma.db().users.findFirst({ where: { id, ...active }, select: userColumns });
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: UserRow): User {
    const roles = row.UserRoles.map(({ Roles }) => Roles.systemKey ?? Roles.id);
    const permissions = new Set(row.UserRoles.flatMap(({ Roles }) => Roles.RolePermissions.map((p) => p.permissionCode)));
    return new User(row.id, row.tenantId, row.Tenants.displayName, row.email, row.fullName, roles, [...permissions].sort(), row.mustChangePassword, row.sessionTimeoutMin, row.Tenants.timezone);
  }
}
