import { Injectable } from '@nestjs/common';
import type { MyPreferences, MyPreferencesResponse, MyProfile, MyProfileUpdate, UserActivity } from '../../../../shared/index.js';
import { addUpdate } from '../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { MeStore } from '../application/me-store.js';

/** Column defaults of Company.UserPreferences. */
const DEFAULTS: MyPreferences = {
  language: 'EN', dateFormat: 'DD MMM YYYY', numberFormat: 'WESTERN', startRoute: 'app/dashboard', theme: 'SYSTEM',
  compactTables: true, showAccountCodes: false, notifyWhatsapp: false,
  notifyEvents: ['APPROVAL_ASSIGNED', 'DOC_REJECTED', 'BANK_ALERT', 'CREDIT_BREACH', 'TAX_DUE'],
};
const prefColumns = {
  id: true, language: true, dateFormat: true, numberFormat: true, startRoute: true, theme: true, compactTables: true,
  showAccountCodes: true, notifyWhatsapp: true, notifyEvents: true, rowVersion: true,
} as const;

@Injectable()
export class PrismaMeStore extends MeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async profile(tenantId: string, userId: string): Promise<MyProfile | null> {
    const db = this.prisma.db();
    const u = await db.users.findFirst({
      where: { tenantId, id: userId },
      select: {
        firstName: true, lastName: true, fullName: true, jobTitle: true, email: true, phone: true, defaultBranchId: true,
        approvalLimit: true, dataScope: true, lastLoginAt: true, passwordChangedAt: true, mustChangePassword: true, rowVersion: true,
        UserRoles: { where: { Roles: { deletedAt: null } }, select: { isPrimary: true, Roles: { select: { name: true, systemKey: true } } } },
      },
    });
    if (!u) return null;
    const links = await db.userBranches.findMany({ where: { tenantId, userId }, select: { branchId: true } });
    const branches = await db.branches.findMany({
      where: { tenantId, id: { in: links.map((l) => l.branchId) }, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    const { UserRoles, approvalLimit, lastLoginAt, passwordChangedAt, ...rest } = u;
    return {
      ...rest,
      branches,
      roles: UserRoles.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((r) => r.Roles.name),
      approvalLimit: approvalLimit.toNumber(),
      lastLoginAt: lastLoginAt?.toISOString() ?? null,
      passwordChangedAt: passwordChangedAt?.toISOString() ?? null,
    };
  }

  async updateProfile(userId: string, input: MyProfileUpdate) {
    await addUpdate(this.prisma, 'userAddUpdate', { id: userId, ...input });
  }

  passwordHash(userId: string) {
    return this.prisma
      .db()
      .users.findUnique({ where: { id: userId }, select: { passwordHash: true, rowVersion: true } })
      .then((u) => (u ? { hash: u.passwordHash, rowVersion: u.rowVersion } : null));
  }

  async setPassword(userId: string, rowVersion: number, hash: string) {
    await addUpdate(this.prisma, 'userAddUpdate', {
      id: userId, rowVersion, passwordHash: hash, mustChangePassword: false, passwordChangedAt: new Date().toISOString(),
    });
  }

  async preferences(tenantId: string, userId: string): Promise<MyPreferencesResponse> {
    const row = await this.prisma.db().userPreferences.findFirst({ where: { tenantId, userId }, select: prefColumns });
    if (!row) return { ...DEFAULTS, saved: false, rowVersion: 0 };
    return {
      language: row.language, dateFormat: row.dateFormat, numberFormat: row.numberFormat, startRoute: row.startRoute, theme: row.theme,
      compactTables: row.compactTables, showAccountCodes: row.showAccountCodes, notifyWhatsapp: row.notifyWhatsapp, notifyEvents: row.notifyEvents,
      rowVersion: row.rowVersion, saved: true,
    };
  }

  async activity(tenantId: string, userId: string, limit: number): Promise<UserActivity[]> {
    const rows = await this.prisma.db().$queryRaw<{ occurredAt: Date; action: string; schemaName: string; tableName: string; recordId: string | null }[]>`
      select "occurredAt", "action", "schemaName", "tableName", "recordId"::text as "recordId"
      from "Company"."AuditTrailEntries"
      where "tenantId" = ${tenantId}::uuid and "userId" = ${userId}::uuid
      order by "occurredAt" desc limit ${limit}`;
    return rows.map((r) => ({ occurredAt: r.occurredAt.toISOString(), action: r.action, schema: r.schemaName, table: r.tableName, recordId: r.recordId }));
  }

  async savePreferences(tenantId: string, userId: string, prefs: MyPreferences, rowVersion?: number) {
    const existing = await this.prisma.db().userPreferences.findFirst({ where: { tenantId, userId }, select: { id: true } });
    await addUpdate(this.prisma, 'userPreferenceAddUpdate', existing ? { ...prefs, id: existing.id, ...(rowVersion !== undefined && { rowVersion }) } : { ...prefs, userId });
  }
}
