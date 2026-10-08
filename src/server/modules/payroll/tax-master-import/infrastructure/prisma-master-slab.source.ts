import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { MasterSlabSource } from '../application/slab-import.service.js';

@Injectable()
export class PrismaMasterSlabSource extends MasterSlabSource {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async slabs(taxYear: number) {
    const rows = await this.prisma.db().taxMasterSalarySlabs.findMany({ where: { taxYear }, orderBy: { slabNo: 'asc' } });
    return rows.map((r) => ({
      id: r.id, slabNo: r.slabNo, incomeFrom: r.incomeFrom.toNumber(), incomeTo: r.incomeTo?.toNumber() ?? null, fixedTax: r.fixedTax.toNumber(), ratePct: r.ratePct.toNumber(),
    }));
  }

  async linked(tenantId: string, payrollYear: string) {
    return (await this.prisma.db().salaryTaxSlabs.count({ where: { tenantId, taxYear: payrollYear, sourceMasterId: { not: null } } })) > 0;
  }
}
