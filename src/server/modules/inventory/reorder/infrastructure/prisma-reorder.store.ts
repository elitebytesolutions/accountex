import { Injectable } from '@nestjs/common';
import type { ReorderRule } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { ReorderStore, type ReorderInput } from '../application/reorder-store.js';

@Injectable()
export class PrismaReorderStore extends ReorderStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, itemId?: string): Promise<ReorderRule[]> {
    const db = this.prisma.db();
    const rows = await db.reorderRules.findMany({ where: { tenantId, ...(itemId && { itemId }) }, orderBy: { createdAt: 'asc' } });
    const [products, warehouses] = await Promise.all([
      db.products.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.itemId))] } }, select: { id: true, sku: true, name: true } }),
      db.warehouses.findMany({ where: { tenantId, id: { in: rows.map((r) => r.warehouseId).filter((x): x is string => !!x) } }, select: { id: true, code: true, name: true } }),
    ]);
    return rows.map((r) => ({
      id: r.id, product: products.find((p) => p.id === r.itemId) ?? { id: r.itemId, sku: '?', name: '?' }, warehouse: warehouses.find((w) => w.id === r.warehouseId) ?? null,
      lowLevel: r.lowLevel.toNumber(), highLevel: r.highLevel.toNumber(), leadDays: r.leadDays, safetyDays: r.safetyDays, coverAlertDays: r.coverAlertDays,
      isActive: r.isActive, rowVersion: r.rowVersion,
    }));
  }

  /** Active rules, plus products without any rule that carry their own low / high levels (all warehouses). */
  async inputs(tenantId: string): Promise<ReorderInput[]> {
    const db = this.prisma.db();
    const [rules, products] = await Promise.all([
      db.reorderRules.findMany({ where: { tenantId, isActive: true } }),
      db.products.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
    ]);
    const withRule = new Set(rules.map((r) => r.itemId));
    const fallback = products.filter((p) => !withRule.has(p.id) && p.lowLevel.toNumber() > 0);
    const ids = [...withRule, ...fallback.map((p) => p.id)];
    const [uoms, suppliers, stock, warehouses] = await Promise.all([
      db.unitsOfMeasure.findMany({ where: { tenantId }, select: { id: true, code: true } }),
      db.productSuppliers.findMany({ where: { tenantId, itemId: { in: ids }, isPreferred: true } }),
      db.stockBalances.groupBy({ by: ['itemId', 'warehouseId'], where: { tenantId, itemId: { in: ids } }, _sum: { qtyOnHand: true } }),
      db.warehouses.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);
    const vendors = await db.vendors.findMany({ where: { tenantId, id: { in: suppliers.map((s) => s.vendorId) } }, select: { id: true, code: true, name: true } });
    const productOf = (id: string) => products.find((p) => p.id === id);
    const info = (id: string) => {
      const p = productOf(id)!;
      const sup = suppliers.find((s) => s.itemId === id);
      return {
        product: { id: p.id, sku: p.sku, name: p.name, ctn: p.ctn, uomCode: uoms.find((u) => u.id === p.uomId)?.code ?? '', cost: p.cost.toNumber(), avgDaily: p.avgDailySales?.toNumber() ?? 0 },
        supplier: sup ? (vendors.find((v) => v.id === sup.vendorId) ?? null) : null,
      };
    };
    const onHand = (itemId: string, warehouseId: string | null) =>
      stock.filter((s) => s.itemId === itemId && (!warehouseId || s.warehouseId === warehouseId)).reduce((t, s) => t + (s._sum.qtyOnHand?.toNumber() ?? 0), 0);
    return [
      ...rules.filter((r) => productOf(r.itemId)).map((r) => ({
        ...info(r.itemId), warehouse: warehouses.find((w) => w.id === r.warehouseId) ?? null, onHand: onHand(r.itemId, r.warehouseId),
        lowLevel: r.lowLevel.toNumber(), highLevel: r.highLevel.toNumber(), leadDays: r.leadDays, safetyDays: r.safetyDays, coverAlertDays: r.coverAlertDays,
      })),
      ...fallback.map((p) => ({
        ...info(p.id), warehouse: null, onHand: onHand(p.id, null), lowLevel: p.lowLevel.toNumber(), highLevel: p.highLevel.toNumber(),
        leadDays: p.leadDays ?? 14, safetyDays: 14, coverAlertDays: 21,
      })),
    ];
  }

  async productExists(tenantId: string, itemId: string) {
    return (await this.prisma.db().products.count({ where: { tenantId, id: itemId, deletedAt: null } })) > 0;
  }

  async activeWarehouse(tenantId: string, id: string) {
    return (await this.prisma.db().warehouses.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'reorderRuleAddUpdate', data);
  }

  async delete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().reorderRules.deleteMany({ where: { tenantId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
  }
}
