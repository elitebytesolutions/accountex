import { Injectable } from '@nestjs/common';
import type { AssetCategory } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { AssetCategoryStore } from '../application/asset-category-store.js';

@Injectable()
export class PrismaAssetCategoryStore extends AssetCategoryStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<AssetCategory[]> {
    const db = this.prisma.db();
    const rows = await db.fixedAssetCategories.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' } });
    const ids = rows.flatMap((r) => [r.costAccountId, r.accumDepAccountId, r.depExpenseAccountId]).filter((x): x is string => !!x);
    const gl = ids.length ? await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, code: true, name: true } }) : [];
    const ref = (id: string | null) => (id ? (gl.find((g) => g.id === id) ?? null) : null);
    return rows.map((c) => ({
      id: c.id, code: c.code, name: c.name, defaultMethod: c.defaultMethod, defaultRatePct: c.defaultRatePct?.toNumber() ?? null,
      costAccount: ref(c.costAccountId)!, accumDepAccount: ref(c.accumDepAccountId), depExpenseAccount: ref(c.depExpenseAccountId),
      tagPrefix: c.tagPrefix, status: c.status, rowVersion: c.rowVersion,
    }));
  }

  async retiredCodes(tenantId: string) {
    return (await this.prisma.db().fixedAssetCategories.findMany({ where: { tenantId, deletedAt: { not: null } }, select: { code: true } })).map((r) => r.code);
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'fixedAssetCategoryAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'fixedAssetCategories', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    // The name is unique too: free it so a new category can take it (the code stays retired).
    const row = await this.prisma.db().fixedAssetCategories.findFirst({ where: { tenantId, id }, select: { name: true } });
    const { count } = await this.prisma.db().fixedAssetCategories.updateMany({
      where: { tenantId, id, rowVersion, deletedAt: null },
      data: { deletedAt: new Date(), name: `${row?.name ?? 'Category'} (deleted ${id.slice(0, 8)})` },
    });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this category. Reload and try again.');
  }
}
