import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import type { PlatformModule } from '../../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../../infrastructure/prisma/references.js';
import { ModuleStore } from '../application/module-store.js';

const include = {
  PlatformModulePlans: { orderBy: { createdAt: 'asc' } },
  Addons: { where: { deletedAt: null }, select: { id: true } },
} as const satisfies Prisma.PlatformModulesInclude;
type Row = Prisma.PlatformModulesGetPayload<{ include: typeof include }>;

@Injectable()
export class PrismaModuleStore extends ModuleStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    const rows = await this.prisma.db().platformModules.findMany({ where: { deletedAt: null }, include, orderBy: [{ entGroup: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map(toModule);
  }

  async get(id: string) {
    const row = await this.prisma.db().platformModules.findFirst({ where: { id, deletedAt: null }, include });
    return row ? toModule(row) : null;
  }

  async allKeys() {
    const rows = await this.prisma.db().platformModules.findMany({ select: { id: true, key: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, key: r.key, deleted: r.deletedAt !== null }));
  }

  async planExists(id: string) {
    return (await this.prisma.db().subscriptionPlans.count({ where: { id } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'platformModuleAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'platformModules', id, ['platformModulePlans']);
  }

  async softDelete(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().platformModules.updateMany({ where: { id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this module. Reload and try again.');
  }
}

const toModule = (r: Row): PlatformModule => ({
  id: r.id, key: r.key, name: r.name, icon: r.icon, kind: r.kind, entGroup: r.entGroup, moduleKey: r.moduleKey,
  featureFlagId: r.featureFlagId, minPlanId: r.minPlanId, isCore: r.isCore, isEnabled: r.isEnabled, sortOrder: r.sortOrder,
  plans: r.PlatformModulePlans.map((p) => ({ id: p.id, planId: p.planId, isIncluded: p.isIncluded })),
  addonCount: r.Addons.length,
  rowVersion: r.rowVersion,
});
