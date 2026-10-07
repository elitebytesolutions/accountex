import { Injectable } from '@nestjs/common';
import type { CustomerGroup } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { CustomerGroupStore } from '../application/customer-group-store.js';

@Injectable()
export class PrismaCustomerGroupStore extends CustomerGroupStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<CustomerGroup[]> {
    const db = this.prisma.db();
    const [rows, counts] = await Promise.all([
      db.customerGroups.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' } }),
      db.customers.groupBy({ by: ['customerGroupId'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
    ]);
    const count = new Map(counts.map((c) => [c.customerGroupId, c._count._all]));
    const lists = await db.priceLists.findMany({ where: { tenantId, id: { in: rows.map((g) => g.priceListId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    return rows.map((g) => ({
      id: g.id, code: g.code, name: g.name, remarks: g.remarks, priceList: lists.find((l) => l.id === g.priceListId) ?? null,
      isActive: g.isActive, customerCount: count.get(g.id) ?? 0, rowVersion: g.rowVersion,
    }));
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().customerGroups.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  async activePriceList(tenantId: string, id: string) {
    return (await this.prisma.db().priceLists.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'customerGroupAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'customerGroups', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().customerGroups.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this group. Reload and try again.');
  }
}
