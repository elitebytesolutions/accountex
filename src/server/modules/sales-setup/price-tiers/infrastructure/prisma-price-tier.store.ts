import { Injectable } from '@nestjs/common';
import type { PriceTier } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { PriceTierStore } from '../application/price-tier-store.js';

@Injectable()
export class PrismaPriceTierStore extends PriceTierStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<PriceTier[]> {
    const rows = await this.prisma.db().priceTiers.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ rateFactor: 'desc' }, { name: 'asc' }] });
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, rateFactor: r.rateFactor.toNumber(), allocationRank: r.allocationRank, isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'priceTierAddUpdate', data);
  }
}
