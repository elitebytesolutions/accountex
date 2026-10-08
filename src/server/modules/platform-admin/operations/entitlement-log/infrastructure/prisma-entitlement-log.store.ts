import { Injectable } from '@nestjs/common';
import type { EntitlementChangeSet } from '../../../../../../shared/index.js';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { EntitlementLogStore, type EntitlementLogRow } from '../application/entitlement-log-store.js';
import { staffNames } from '../../infrastructure/staff-names.js';

@Injectable()
export class PrismaEntitlementLogStore extends EntitlementLogStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async write(changeSetId: string, staffId: string, flags: { grandfatherUntilRenewal: boolean; emailOwners: boolean; postChangelog: boolean }, rows: EntitlementLogRow[]) {
    const db = this.prisma.db();
    for (const r of rows) {
      await db.entitlementChangeLogs.create({
        data: {
          changeSetId, changeKind: r.changeKind, planId: r.planId, platformModuleId: r.platformModuleId, usageMeterId: r.usageMeterId, addonId: r.addonId,
          fromValue: r.fromValue as Prisma.InputJsonValue, toValue: r.toValue as Prisma.InputJsonValue, tenantsAffected: r.tenantsAffected, impactTone: r.impactTone,
          ...flags, savedByStaffId: staffId,
        },
      });
    }
  }

  async changeSets(limit: number): Promise<EntitlementChangeSet[]> {
    const db = this.prisma.db();
    const sets = await db.entitlementChangeLogs.groupBy({ by: ['changeSetId'], _max: { savedAt: true }, orderBy: { _max: { savedAt: 'desc' } }, take: limit });
    if (!sets.length) return [];
    const rows = await db.entitlementChangeLogs.findMany({ where: { changeSetId: { in: sets.map((s) => s.changeSetId) } }, orderBy: { createdAt: 'asc' } });
    const [plans, modules, meters, addons, names] = await Promise.all([
      db.subscriptionPlans.findMany({ where: { id: { in: rows.map((r) => r.planId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
      db.platformModules.findMany({ where: { id: { in: rows.map((r) => r.platformModuleId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
      db.usageMeters.findMany({ where: { id: { in: rows.map((r) => r.usageMeterId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
      db.addons.findMany({ where: { id: { in: rows.map((r) => r.addonId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
      staffNames(this.prisma, rows.map((r) => r.savedByStaffId)),
    ]);
    const name = (list: { id: string; name: string }[], id: string | null) => (id ? (list.find((x) => x.id === id)?.name ?? null) : null);
    return sets.map((s) => {
      const mine = rows.filter((r) => r.changeSetId === s.changeSetId);
      const first = mine[0]!;
      return {
        changeSetId: s.changeSetId, savedAt: first.savedAt.toISOString(), savedBy: names.get(first.savedByStaffId) ?? null,
        grandfatherUntilRenewal: first.grandfatherUntilRenewal, emailOwners: first.emailOwners, postChangelog: first.postChangelog,
        tenantsAffected: mine.reduce((t, r) => t + r.tenantsAffected, 0),
        rows: mine.map((r) => ({
          id: r.id, changeKind: r.changeKind, planId: r.planId, planName: name(plans, r.planId), moduleName: name(modules, r.platformModuleId), meterName: name(meters, r.usageMeterId),
          addonName: name(addons, r.addonId), fromValue: r.fromValue, toValue: r.toValue, tenantsAffected: r.tenantsAffected, impactTone: r.impactTone,
        })),
      };
    });
  }
}
