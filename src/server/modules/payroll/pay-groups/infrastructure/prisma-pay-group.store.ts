import { Injectable } from '@nestjs/common';
import type { PayGroup, TaxSlab } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { PayGroupStore, TaxSlabStore } from '../application/pay-group-store.js';

@Injectable()
export class PrismaPayGroupStore extends PayGroupStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<PayGroup[]> {
    const db = this.prisma.db();
    const today = new Date(new Date().toISOString().slice(0, 10));
    const [rows, staff] = await Promise.all([
      db.payGroups.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } }),
      db.employeeSalaries.groupBy({ by: ['payGroupId'], where: { tenantId, payGroupId: { not: null }, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, _count: { _all: true } }),
    ]);
    return rows.map((g) => ({ id: g.id, code: g.code, name: g.name, frequency: g.frequency, status: g.status, employees: staff.find((s) => s.payGroupId === g.id)?._count._all ?? 0, rowVersion: g.rowVersion }));
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().payGroups.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'payGroupAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'payGroups', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().payGroups.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this pay group. Reload and try again.');
  }
}

@Injectable()
export class PrismaTaxSlabStore extends TaxSlabStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async years(tenantId: string) {
    const rows = await this.prisma.db().salaryTaxSlabs.findMany({ where: { tenantId }, orderBy: [{ taxYear: 'desc' }, { slabNo: 'asc' }] });
    const out = new Map<string, TaxSlab[]>();
    for (const r of rows) {
      const list = out.get(r.taxYear) ?? [];
      list.push({ id: r.id, slabNo: r.slabNo, incomeFrom: r.incomeFrom.toNumber(), incomeTo: r.incomeTo?.toNumber() ?? null, fixedTax: r.fixedTax.toNumber(), ratePercent: r.ratePercent.toNumber(), rowVersion: r.rowVersion });
      out.set(r.taxYear, list);
    }
    return [...out].map(([taxYear, slabs]) => ({ taxYear, slabs }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'salaryTaxSlabAddUpdate', data);
  }

  async remove(tenantId: string, ids: string[]) {
    if (ids.length) await this.prisma.db().salaryTaxSlabs.deleteMany({ where: { tenantId, id: { in: ids } } });
  }
}
