import { Injectable } from '@nestjs/common';
import type { UserActivity, UserDetail, UserListItem } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { UserAdminStore, type NewUser, type UserFields } from '../application/user-admin-store.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const hhmm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
/** "HH:MM" → a time value Postgres accepts (json → time). */
const time = (t: string | null | undefined) => (t ? `${t}:00` : t);

const listColumns = {
  id: true, fullName: true, email: true, phone: true, jobTitle: true, department: true, isExternal: true, externalOrg: true,
  status: true, mfaEnabled: true, lastActiveAt: true, createdAt: true,
  UserRoles: { select: { isPrimary: true, Roles: { select: { id: true, name: true, systemKey: true, icon: true, tone: true, deletedAt: true } } } },
} as const;

type ListRow = {
  id: string; fullName: string; email: string; phone: string | null; jobTitle: string | null; department: string | null;
  isExternal: boolean; externalOrg: string | null; status: string; mfaEnabled: boolean; lastActiveAt: Date | null; createdAt: Date;
  UserRoles: { isPrimary: boolean; Roles: { id: string; name: string; systemKey: string | null; icon: string | null; tone: string | null; deletedAt: Date | null } }[];
};

@Injectable()
export class PrismaUserAdminStore extends UserAdminStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<UserListItem[]> {
    const rows = await this.prisma.db().users.findMany({
      where: { tenantId, status: { not: 'REMOVED' }, deletedAt: null },
      select: listColumns,
      orderBy: { fullName: 'asc' },
    });
    return this.toItems(tenantId, rows);
  }

  async get(tenantId: string, id: string): Promise<UserDetail | null> {
    const db = this.prisma.db();
    const row = await db.users.findFirst({
      where: { tenantId, id, status: { not: 'REMOVED' }, deletedAt: null },
      select: {
        ...listColumns, dataScope: true, moduleAccess: true, approvalLimit: true, defaultBranchId: true, ipRestricted: true,
        sessionTimeoutMin: true, loginHours: true, loginFrom: true, loginTo: true, mustChangePassword: true, lastLoginAt: true,
        lastLoginIp: true, rowVersion: true,
      },
    });
    if (!row) return null;
    const [item] = await this.toItems(tenantId, [row]);
    // cidr[] is not readable by Prisma.
    const [ips] = await db.$queryRaw<{ list: string[] }[]>`select coalesce("ipAllowlist"::text[], '{}') as list from "Company"."Users" where id = ${id}::uuid`;
    return {
      ...item!,
      dataScope: row.dataScope,
      moduleAccess: row.moduleAccess,
      approvalLimit: row.approvalLimit.toNumber(),
      defaultBranchId: row.defaultBranchId,
      ipRestricted: row.ipRestricted,
      ipAllowlist: ips?.list ?? [],
      sessionTimeoutMin: row.sessionTimeoutMin,
      loginHours: row.loginHours,
      loginFrom: hhmm(row.loginFrom),
      loginTo: hhmm(row.loginTo),
      mustChangePassword: row.mustChangePassword,
      lastLoginAt: iso(row.lastLoginAt),
      lastLoginIp: row.lastLoginIp,
      rowVersion: row.rowVersion,
    };
  }

  async jobRoleIds(tenantId: string, ids: string[]) {
    const rows = await this.prisma.db().roles.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null, OR: [{ systemKey: null }, { systemKey: { not: 'EMPLOYEE' } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async activeBranchIds(tenantId: string, ids: string[]) {
    const rows = await this.prisma.db().branches.findMany({ where: { tenantId, id: { in: ids }, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async create(u: NewUser) {
    const { roleIds, branchIds, loginFrom, loginTo, ...fields } = u;
    const id = await addUpdate(this.prisma, 'userAddUpdate', {
      ...fields,
      loginFrom: time(loginFrom),
      loginTo: time(loginTo),
      status: 'ACTIVE',
      activatedAt: new Date().toISOString(),
      branches: branchIds.map((branchId) => ({ branchId })),
    });
    // The insert trigger has just added EMPLOYEE; job roles go on in a second step that keeps that row
    // (a roles array in the insert would replace it, which the Employee rule refuses).
    const user = await this.prisma.db().users.findUniqueOrThrow({ where: { id }, select: { tenantId: true, rowVersion: true } });
    await this.update(user.tenantId, id, user.rowVersion, {}, roleIds);
    return id;
  }

  async update(tenantId: string, id: string, rowVersion: number, fields: Partial<UserFields>, roleIds?: string[], branchIds?: string[]) {
    const db = this.prisma.db();
    const data: Record<string, unknown> = { ...fields, id, rowVersion };
    if ('loginFrom' in fields) data.loginFrom = time(fields.loginFrom);
    if ('loginTo' in fields) data.loginTo = time(fields.loginTo);
    if (roleIds) {
      // Keep existing rows by id (no history noise, EMPLOYEE untouched); the primary row goes last so the
      // one-primary index never sees two at once.
      const current = await db.userRoles.findMany({ where: { tenantId, userId: id }, select: { id: true, roleId: true, Roles: { select: { systemKey: true } } } });
      const rows = current
        .filter((r) => r.Roles.systemKey === 'EMPLOYEE' || roleIds.includes(r.roleId))
        .map((r) => ({ id: r.id, roleId: r.roleId, isPrimary: r.roleId === roleIds[0] }));
      for (const roleId of roleIds) if (!rows.some((r) => r.roleId === roleId)) rows.push({ id: '', roleId, isPrimary: roleId === roleIds[0] });
      data.roles = rows
        .sort((a, b) => Number(a.isPrimary) - Number(b.isPrimary))
        .map((r) => (r.id ? { id: r.id, isPrimary: r.isPrimary } : { roleId: r.roleId, isPrimary: r.isPrimary }));
    }
    if (branchIds) {
      const current = await db.userBranches.findMany({ where: { tenantId, userId: id }, select: { id: true, branchId: true } });
      data.branches = [
        ...current.filter((b) => branchIds.includes(b.branchId)).map((b) => ({ id: b.id })),
        ...branchIds.filter((b) => !current.some((c) => c.branchId === b)).map((branchId) => ({ branchId })),
      ];
    }
    await addUpdate(this.prisma, 'userAddUpdate', data);
  }

  async setStatus(id: string, rowVersion: number, status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED') {
    // userAddUpdate does not write deletedAt, so status changes are one direct update guarded by rowVersion.
    const now = new Date();
    const extra = status === 'SUSPENDED' ? { suspendedAt: now } : status === 'REMOVED' ? { deletedAt: now } : { suspendedAt: null };
    const { count } = await this.prisma.db().users.updateMany({ where: { id, rowVersion }, data: { status, ...extra } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this user. Reload and try again.');
  }

  async setPassword(id: string, rowVersion: number, passwordHash: string, mustChangePassword: boolean) {
    await addUpdate(this.prisma, 'userAddUpdate', {
      id, rowVersion, passwordHash, mustChangePassword, passwordChangedAt: new Date().toISOString(), failedLoginCount: 0, lockedUntil: null,
    });
  }

  async activity(tenantId: string, userId: string, limit: number): Promise<UserActivity[]> {
    const rows = await this.prisma.db().$queryRaw<{ occurredAt: Date; action: string; schemaName: string; tableName: string; recordId: string | null }[]>`
      select "occurredAt", "action", "schemaName", "tableName", "recordId"::text as "recordId"
      from "Company"."AuditTrailEntries"
      where "tenantId" = ${tenantId}::uuid and "userId" = ${userId}::uuid
      order by "occurredAt" desc limit ${limit}`;
    return rows.map((r) => ({ occurredAt: r.occurredAt.toISOString(), action: r.action, schema: r.schemaName, table: r.tableName, recordId: r.recordId }));
  }

  /** Adds branches, last activity and the default-user flag to user rows. */
  private async toItems(tenantId: string, rows: ListRow[]): Promise<UserListItem[]> {
    const db = this.prisma.db();
    const ids = rows.map((r) => r.id);
    const [tenant, links, branches, lastSessions] = await Promise.all([
      db.tenants.findUnique({ where: { id: tenantId }, select: { defaultUserId: true } }),
      db.userBranches.findMany({ where: { tenantId, userId: { in: ids } }, select: { userId: true, branchId: true } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      ids.length
        ? db.$queryRaw<{ userId: string; lastActiveAt: Date; deviceLabel: string | null }[]>`
            select distinct on ("userId") "userId"::text as "userId", "lastActiveAt", "deviceLabel"
            from "Company"."UserSessions" where "tenantId" = ${tenantId}::uuid
            order by "userId", "lastActiveAt" desc`
        : Promise.resolve([]),
    ]);
    const byId = new Map(branches.map((b) => [b.id, b]));
    const last = new Map(lastSessions.map((s) => [s.userId, s]));
    return rows.map((r) => {
      const s = last.get(r.id);
      return {
        id: r.id,
        name: r.fullName,
        email: r.email,
        phone: r.phone,
        jobTitle: r.jobTitle,
        department: r.department,
        isExternal: r.isExternal,
        externalOrg: r.externalOrg,
        status: r.status,
        roles: r.UserRoles.filter((ur) => !ur.Roles.deletedAt && ur.Roles.systemKey !== 'EMPLOYEE')
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.Roles.name.localeCompare(b.Roles.name))
          .map(({ Roles: x }) => ({ id: x.id, name: x.name, systemKey: x.systemKey, icon: x.icon, tone: x.tone })),
        branches: links.filter((l) => l.userId === r.id).map((l) => byId.get(l.branchId)).filter((b) => !!b),
        mfaEnabled: r.mfaEnabled,
        lastActiveAt: iso(s?.lastActiveAt ?? r.lastActiveAt),
        lastDevice: s?.deviceLabel ?? null,
        isDefaultUser: tenant?.defaultUserId === r.id,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }
}
