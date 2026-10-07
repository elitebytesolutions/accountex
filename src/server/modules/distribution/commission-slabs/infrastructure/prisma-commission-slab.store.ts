import { Injectable } from '@nestjs/common';
import type { CommissionSlab } from '../../../../../shared/distribution/index.js';
import { ConcurrencyError, ConflictError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { CommissionSlabStore } from '../application/commission-slab-store.js';

const day = (d: Date) => d.toISOString().slice(0, 10);
/** PostgreSQL exclusion_violation (commissionSlabNoOverlap), as surfaced by Prisma's driver adapter. */
const isOverlap = (e: unknown) => (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } })?.meta?.driverAdapterError?.cause?.originalCode === '23P01';

@Injectable()
export class PrismaCommissionSlabStore extends CommissionSlabStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async live(tenantId: string): Promise<CommissionSlab[]> {
    const rows = await this.prisma.db().commissionSlabs.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ effectiveFrom: 'desc' }, { fromPct: 'asc' }] });
    return rows.map((r) => ({
      id: r.id, label: r.label, fromPct: r.fromPct.toNumber(), toPct: r.toPct?.toNumber() ?? null, ratePct: r.ratePct.toNumber(),
      effectiveFrom: day(r.effectiveFrom), effectiveTo: r.effectiveTo ? day(r.effectiveTo) : null, rowVersion: r.rowVersion,
    }));
  }

  async save(data: Record<string, unknown>) {
    try {
      return await addUpdate(this.prisma, 'commissionSlabAddUpdate', data);
    } catch (e) {
      if (isOverlap(e)) throw new ConflictError('These bands overlap bands of another effective period.', { effectiveFrom: ['Overlaps another period'] }, { code: 'COMMISSION_SLAB_OVERLAP' });
      throw e;
    }
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'commissionSlabs', id);
  }

  async softDelete(tenantId: string, rows: { id: string; rowVersion: number }[]) {
    for (const r of rows) {
      const { count } = await this.prisma.db().commissionSlabs.updateMany({ where: { tenantId, id: r.id, rowVersion: r.rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
      if (count !== 1) throw new ConcurrencyError('Someone else changed these commission bands. Reload and try again.');
    }
  }
}
