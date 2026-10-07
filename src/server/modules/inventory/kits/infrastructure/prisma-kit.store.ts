import { Injectable } from '@nestjs/common';
import type { Kit } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { KitStore } from '../application/kit-store.js';

@Injectable()
export class PrismaKitStore extends KitStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<Kit[]> {
    const db = this.prisma.db();
    const kits = await db.kitsAndBundles.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } });
    if (!kits.length) return [];
    const comps = await db.kitComponents.findMany({ where: { tenantId, kitId: { in: kits.map((k) => k.id) } }, orderBy: { sortOrder: 'asc' } });
    const itemIds = [...new Set([...comps.map((c) => c.itemId), ...kits.map((k) => k.kitItemId)])];
    const [products, stock] = await Promise.all([
      db.products.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, sku: true, name: true, cost: true, price: true, ctn: true, uomId: true, productClassId: true } }),
      db.stockBalances.groupBy({ by: ['itemId'], where: { tenantId, itemId: { in: itemIds } }, _sum: { qtyOnHand: true } }),
    ]);
    const [uoms, classes] = await Promise.all([
      db.unitsOfMeasure.findMany({ where: { tenantId, id: { in: [...new Set(products.map((p) => p.uomId))] } }, select: { id: true, code: true } }),
      db.productClasses.findMany({ where: { tenantId, id: { in: products.map((p) => p.productClassId).filter((x): x is string => !!x) } }, select: { id: true, icon: true } }),
    ]);
    const onHand = (id: string) => stock.find((s) => s.itemId === id)?._sum.qtyOnHand?.toNumber() ?? 0;
    return kits.map((k) => ({
      id: k.id, code: k.code, name: k.name, icon: k.icon, tone: k.tone,
      kitItem: { id: k.kitItemId, sku: products.find((p) => p.id === k.kitItemId)?.sku ?? k.code },
      sellingPrice: k.sellingPrice.toNumber(), targetMarginPct: k.targetMarginPct.toNumber(), status: k.status,
      components: comps.filter((c) => c.kitId === k.id).map((c) => {
        const p = products.find((x) => x.id === c.itemId)!;
        return {
          id: c.id, qtyPerKit: c.qtyPerKit.toNumber(), sortOrder: c.sortOrder, onHand: onHand(c.itemId),
          product: {
            id: p.id, sku: p.sku, name: p.name, cost: p.cost.toNumber(), price: p.price.toNumber(), ctn: p.ctn,
            uomCode: uoms.find((u) => u.id === p.uomId)?.code ?? '', classIcon: classes.find((x) => x.id === p.productClassId)?.icon ?? null,
          },
        };
      }),
      inStock: onHand(k.kitItemId), rowVersion: k.rowVersion,
    }));
  }

  async allCodes(tenantId: string) {
    return (await this.prisma.db().kitsAndBundles.findMany({ where: { tenantId }, select: { code: true } })).map((k) => k.code);
  }

  async products(tenantId: string, ids: string[]) {
    const db = this.prisma.db();
    const [rows, kits] = await Promise.all([
      db.products.findMany({ where: { tenantId, id: { in: ids }, deletedAt: null }, select: { id: true, cost: true } }),
      db.kitsAndBundles.findMany({ where: { tenantId, kitItemId: { in: ids }, deletedAt: null }, select: { kitItemId: true } }),
    ]);
    return rows.map((r) => ({ id: r.id, cost: r.cost.toNumber(), isKit: kits.some((k) => k.kitItemId === r.id) }));
  }

  async pieceUnit(tenantId: string) {
    const db = this.prisma.db();
    const pcs = await db.unitsOfMeasure.findFirst({ where: { tenantId, code: 'PCS', isActive: true }, select: { id: true } });
    return pcs?.id ?? (await db.unitsOfMeasure.findFirst({ where: { tenantId, kind: 'COUNT', isActive: true }, orderBy: { code: 'asc' }, select: { id: true } }))?.id ?? null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'kitAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'kits', id, ['kitComponents']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().kitsAndBundles.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this kit. Reload and try again.');
    // The bill of materials goes with the kit, so its components stop counting as uses of their products (history keeps it).
    await this.prisma.db().kitComponents.deleteMany({ where: { tenantId, kitId: id } });
  }
}
