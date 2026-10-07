import { Injectable } from '@nestjs/common';
import type { Van, VanWarehouse } from '../../../../../shared/distribution/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { VanStore } from '../application/van-store.js';

@Injectable()
export class PrismaVanStore extends VanStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, drivers: (ids: string[]) => Promise<{ id: string; code: string; name: string }[]>): Promise<Van[]> {
    const db = this.prisma.db();
    const vans = await db.vans.findMany({ where: { tenantId, deletedAt: null }, orderBy: { regNo: 'asc' } });
    if (!vans.length) return [];
    const ids = vans.map((v) => v.id);
    const [whs, routes, people] = await Promise.all([
      db.warehouses.findMany({ where: { tenantId, id: { in: vans.map((v) => v.warehouseId).filter((x): x is string => !!x) } }, select: { id: true, code: true, name: true } }),
      db.routes.findMany({ where: { tenantId, deletedAt: null, vehicleId: { in: ids } }, select: { code: true, vehicleId: true }, orderBy: { code: 'asc' } }),
      drivers([...new Set(vans.map((v) => v.defaultDriverEmployeeId).filter((x): x is string => !!x))]),
    ]);
    return vans.map((v) => ({
      id: v.id, regNo: v.regNo, model: v.model, capacityCtn: v.capacityCtn.toNumber(), capacityKg: v.capacityKg.toNumber(),
      warehouse: whs.find((w) => w.id === v.warehouseId) ?? null,
      defaultDriver: people.find((p) => p.id === v.defaultDriverEmployeeId) ?? null,
      branchId: v.branchId, status: v.status, remarks: v.remarks,
      routes: routes.filter((r) => r.vehicleId === v.id).map((r) => r.code), rowVersion: v.rowVersion,
    }));
  }

  async vanWarehouses(tenantId: string): Promise<VanWarehouse[]> {
    const db = this.prisma.db();
    const [whs, vans] = await Promise.all([
      db.warehouses.findMany({ where: { tenantId, type: 'VAN', deletedAt: null }, select: { id: true, code: true, name: true, status: true }, orderBy: { code: 'asc' } }),
      db.vans.findMany({ where: { tenantId, deletedAt: null, warehouseId: { not: null } }, select: { id: true, warehouseId: true } }),
    ]);
    return whs.map((w) => ({ ...w, vanId: vans.find((v) => v.warehouseId === w.id)?.id ?? null }));
  }

  async warehouseType(tenantId: string, id: string) {
    return (await this.prisma.db().warehouses.findFirst({ where: { tenantId, id, deletedAt: null }, select: { type: true } }))?.type ?? null;
  }

  async vanOnWarehouse(tenantId: string, warehouseId: string, exceptId?: string) {
    return (await this.prisma.db().vans.findFirst({ where: { tenantId, warehouseId, deletedAt: null, ...(exceptId && { id: { not: exceptId } }) }, select: { id: true } }))?.id ?? null;
  }

  async regNoTaken(tenantId: string, regNo: string, exceptId?: string) {
    // regNo is citext in the database; compare case-insensitively here too.
    const hit = await this.prisma.db().vans.findFirst({ where: { tenantId, deletedAt: null, regNo: { equals: regNo, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) }, select: { id: true } });
    return !!hit;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'vanAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'vans', id);
  }

  async warehouseCodes(tenantId: string) {
    return (await this.prisma.db().warehouses.findMany({ where: { tenantId }, select: { code: true } })).map((w) => w.code);
  }

  async stockBranch(tenantId: string, vanBranchId: string | null) {
    const live = { tenantId, status: 'ACTIVE', deletedAt: null };
    const db = this.prisma.db();
    if (vanBranchId && (await db.branches.count({ where: { ...live, id: vanBranchId } }))) return vanBranchId;
    const b = await db.branches.findFirst({ where: live, orderBy: [{ isDefault: 'desc' }, { isHeadOffice: 'desc' }, { name: 'asc' }], select: { id: true } });
    return b?.id ?? null;
  }

  saveWarehouse(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'warehouseAddUpdate', data);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().vans.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this van. Reload and try again.');
  }
}
