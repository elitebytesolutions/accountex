import { Injectable } from '@nestjs/common';
import type { Unit } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { UnitStore } from '../application/unit-store.js';

@Injectable()
export class PrismaUnitStore extends UnitStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<Unit[]> {
    const db = this.prisma.db();
    const [rows, counts] = await Promise.all([
      db.unitsOfMeasure.findMany({ where: { tenantId }, orderBy: [{ kind: 'asc' }, { code: 'asc' }] }),
      db.products.groupBy({ by: ['uomId'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
    ]);
    const count = new Map(counts.map((c) => [c.uomId, c._count._all]));
    return rows.map((u) => ({
      id: u.id, code: u.code, name: u.name, nameUrdu: u.nameUrdu, kind: u.kind, decimals: u.decimals,
      isSystem: u.isSystem, isActive: u.isActive, productCount: count.get(u.id) ?? 0, rowVersion: u.rowVersion,
    }));
  }

  async retiredCodes(tenantId: string) {
    const rows = await this.prisma.db().$queryRaw<{ code: string }[]>`
      select distinct a."rowData"->>'code' as code from "Company"."AuditTrailEntries" a
       where a."tenantId" = ${tenantId}::uuid and a."tableName" = 'UnitsOfMeasure' and a.action = 'DELETE'`;
    return rows.map((r) => r.code);
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'unitOfMeasureAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'unitsOfMeasure', id);
  }

  async delete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().unitsOfMeasure.deleteMany({ where: { tenantId, id, rowVersion, isSystem: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this unit. Reload and try again.');
  }
}
