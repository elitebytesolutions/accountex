import { Injectable } from '@nestjs/common';
import type { ShopArea } from '../../../../../shared/distribution/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { ShopAreaStore } from '../application/shop-area-store.js';

@Injectable()
export class PrismaShopAreaStore extends ShopAreaStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<ShopArea[]> {
    const db = this.prisma.db();
    const [rows, counts] = await Promise.all([
      db.shopAreas.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ name: 'asc' }] }),
      db.shopRouteProfiles.groupBy({ by: ['areaId'], where: { tenantId, areaId: { not: null } }, _count: { _all: true } }),
    ]);
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, city: r.city, branchId: r.branchId, status: r.status,
      shops: counts.find((c) => c.areaId === r.id)?._count._all ?? 0, rowVersion: r.rowVersion,
    }));
  }

  async clashes(tenantId: string, a: { code: string | null; name: string; city: string | null }, exceptId?: string) {
    const rows = await this.prisma.db().shopAreas.findMany({ where: { tenantId, deletedAt: null, ...(exceptId && { id: { not: exceptId } }) }, select: { code: true, name: true, city: true } });
    const low = (s: string | null) => (s ?? '').trim().toLowerCase();
    return {
      code: !!a.code && rows.some((r) => r.code === a.code),
      name: rows.some((r) => low(r.name) === low(a.name) && low(r.city) === low(a.city)),
    };
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'shopAreaAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'shopAreas', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().shopAreas.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this area. Reload and try again.');
  }
}
