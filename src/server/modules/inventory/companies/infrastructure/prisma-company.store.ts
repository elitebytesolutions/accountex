import { Injectable } from '@nestjs/common';
import type { ProductCompany } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { CompanyStore } from '../application/company-store.js';

@Injectable()
export class PrismaCompanyStore extends CompanyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<ProductCompany[]> {
    const db = this.prisma.db();
    const [rows, counts] = await Promise.all([
      db.productCompanies.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' } }),
      db.products.groupBy({ by: ['manufacturerId'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
    ]);
    const count = new Map(counts.map((c) => [c.manufacturerId, c._count._all]));
    return rows.map((c) => ({
      id: c.id, code: c.code, name: c.name, shortName: c.shortName, status: c.status, address: c.address, city: c.city,
      country: c.country, phone: c.phone, email: c.email, website: c.website, brandColour: c.brandColour, notes: c.notes,
      productCount: count.get(c.id) ?? 0, updatedAt: c.updatedAt.toISOString(), rowVersion: c.rowVersion,
    }));
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().productCompanies.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'productCompanyAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'productCompanies', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().productCompanies.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this company. Reload and try again.');
  }
}
