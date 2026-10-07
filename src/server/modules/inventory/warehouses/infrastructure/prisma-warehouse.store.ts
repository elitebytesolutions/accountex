import { Injectable } from '@nestjs/common';
import type { Warehouse } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { WarehouseStore } from '../application/warehouse-store.js';

@Injectable()
export class PrismaWarehouseStore extends WarehouseStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<Warehouse[]> {
    const db = this.prisma.db();
    const rows = await db.warehouses.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] });
    const ids = rows.map((w) => w.id);
    const some = <T>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);
    const [bins, branches, users, gl, stock] = await Promise.all([
      db.warehouseBins.findMany({ where: { tenantId, warehouseId: { in: ids }, deletedAt: null }, orderBy: { code: 'asc' } }),
      db.branches.findMany({ where: { tenantId, id: { in: some(rows.map((w) => w.branchId)) } }, select: { id: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: some(rows.map((w) => w.managerUserId)) } }, select: { id: true, fullName: true } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: some(rows.map((w) => w.inventoryAccountId)) } }, select: { id: true, code: true, name: true } }),
      ids.length
        ? db.$queryRaw<{ warehouseId: string; value: string; skus: number }[]>`
            select b."warehouseId"::text as "warehouseId", coalesce(sum(b.value), 0)::text as value,
                   count(distinct b."itemId") filter (where b."qtyOnHand" <> 0)::int as skus
              from "Inventory"."StockBalances" b
             where b."tenantId" = ${tenantId}::uuid and b."warehouseId" = any(${ids}::uuid[])
             group by b."warehouseId"`
        : Promise.resolve([]),
    ]);
    return rows.map((w) => {
      const own = bins.filter((b) => b.warehouseId === w.id);
      const s = stock.find((x) => x.warehouseId === w.id);
      const branch = branches.find((b) => b.id === w.branchId);
      const manager = users.find((u) => u.id === w.managerUserId);
      return {
        id: w.id, code: w.code, name: w.name, description: w.description, type: w.type,
        branch: branch ? { id: branch.id, name: branch.name } : null,
        manager: manager ? { id: manager.id, name: manager.fullName } : null,
        address: w.address, city: w.city, capacityPallets: w.capacityPallets,
        inventoryAccount: gl.find((g) => g.id === w.inventoryAccountId) ?? null,
        blockNegativeStock: w.blockNegativeStock, isPrimary: w.isPrimary, status: w.status,
        bins: own.map((b) => ({ id: b.id, code: b.code, rack: b.rack, shelfRow: b.shelfRow, position: b.position, zone: b.zone, isActive: b.isActive, rowVersion: b.rowVersion })),
        rackCount: new Set(own.map((b) => b.rack).filter(Boolean)).size,
        stockValue: Number(s?.value ?? 0), skuCount: s?.skus ?? 0, rowVersion: w.rowVersion,
      };
    });
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().warehouses.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  async allBinCodes(tenantId: string, warehouseId: string) {
    const rows = await this.prisma.db().warehouseBins.findMany({ where: { tenantId, warehouseId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  async activeBranch(tenantId: string, id: string) {
    return (await this.prisma.db().branches.count({ where: { tenantId, id, status: 'ACTIVE', deletedAt: null } })) > 0;
  }

  async activeUser(tenantId: string, id: string) {
    return (await this.prisma.db().users.count({ where: { tenantId, id, status: 'ACTIVE' } })) > 0;
  }

  async formOptions(tenantId: string) {
    const db = this.prisma.db();
    const [users, accounts] = await Promise.all([
      db.users.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, kind: 'POSTABLE', status: 'ACTIVE', deletedAt: null, accountClass: 1 }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    ]);
    return { managers: users.map((u) => ({ id: u.id, name: u.fullName })), accounts };
  }

  async hasStock(tenantId: string, warehouseId: string) {
    return (await this.prisma.db().stockBalances.count({ where: { tenantId, warehouseId, qtyOnHand: { not: 0 } } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'warehouseAddUpdate', data);
  }

  saveBin(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'warehouseBinAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'warehouses', id, ['warehouseBins']);
  }

  binInUse(id: string) {
    return isReferenced(this.prisma, 'warehouseBins', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const { count } = await db.warehouses.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isPrimary: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this warehouse. Reload and try again.');
    await db.warehouseBins.updateMany({ where: { tenantId, warehouseId: id, deletedAt: null }, data: { deletedAt: new Date() } });
  }

  async softDeleteBin(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().warehouseBins.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this bin. Reload and try again.');
  }
}
