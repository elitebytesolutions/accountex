import { Injectable } from '@nestjs/common';
import type { VendorCategory } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { VendorCategoryStore } from '../application/vendor-category-store.js';

@Injectable()
export class PrismaVendorCategoryStore extends VendorCategoryStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<VendorCategory[]> {
    const db = this.prisma.db();
    const [rows, counts] = await Promise.all([
      db.vendorCategories.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      db.vendors.groupBy({ by: ['categoryId'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
    ]);
    const count = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return rows.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder, isActive: c.isActive, vendorCount: count.get(c.id) ?? 0, rowVersion: c.rowVersion }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'vendorCategoryAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'vendorCategories', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().vendorCategories.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this category. Reload and try again.');
  }
}
