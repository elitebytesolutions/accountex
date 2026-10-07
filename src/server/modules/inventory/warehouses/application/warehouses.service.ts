import { Injectable } from '@nestjs/common';
import {
  generateBinCodes,
  type BinCreate,
  type BinGenerate,
  type BinUpdate,
  type SessionUser,
  type Warehouse,
  type WarehouseCreate,
  type WarehouseUpdate,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../../treasury/gl-links/application/gl-links.js';
import { WarehouseStore } from './warehouse-store.js';

/**
 * Warehouses (each belongs to a branch) and their bins. One primary warehouse per company: making another one primary
 * moves the flag in the same unit of work. A warehouse holding stock can't be deactivated.
 */
@Injectable()
export class WarehousesService {
  constructor(
    private readonly store: WarehouseStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  /** Choices for the warehouse form (no Finance or Users permission needed). */
  formOptions(user: SessionUser) {
    return this.store.formOptions(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: WarehouseCreate): Promise<Warehouse> {
    await this.checkCode(user, input.code);
    await this.checkLinks(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isPrimary) await this.clearPrimary(user);
      return this.store.save({ ...input, status: 'ACTIVE' });
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: WarehouseUpdate): Promise<Warehouse> {
    const w = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== w.code) await this.checkCode(user, input.code);
    // A van stock location (made by Distribution › Vans) keeps its type: its van needs a VAN-type warehouse.
    if (w.type === 'VAN' && input.type) {
      throw new ValidationError('A van stock location stays of type Van.', { type: ['Van warehouses keep their type'] }, { code: 'VAN_WAREHOUSE_TYPE' });
    }
    await this.checkLinks(user, input);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isPrimary && !w.isPrimary) await this.clearPrimary(user);
      await this.store.save({ ...input, id });
    });
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Warehouse> {
    await this.current(user, id, rowVersion);
    if (!active && (await this.store.hasStock(user.tenantId, id))) {
      throw new ConflictError('This warehouse still holds stock. Move or write it off first.', undefined, { code: 'WAREHOUSE_HAS_STOCK' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Stock or documents use this warehouse. Deactivate it instead.', undefined, { code: 'WAREHOUSE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  async addBin(user: SessionUser, meta: RequestMeta, warehouseId: string, input: BinCreate): Promise<Warehouse> {
    await this.get(user, warehouseId);
    await this.checkBinCodes(user, warehouseId, [input.code]);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBin({ ...input, warehouseId }));
    return this.get(user, warehouseId);
  }

  /** "Generate A-01 … A-20": every code must be new for the warehouse; all bins are created in one unit of work. */
  async generateBins(user: SessionUser, meta: RequestMeta, warehouseId: string, input: BinGenerate): Promise<Warehouse> {
    await this.get(user, warehouseId);
    const codes = generateBinCodes(input);
    if (codes.some((c) => c.length > 20)) throw new ValidationError('Bin codes are at most 20 characters', { prefix: ['Shorten the prefix'] });
    await this.checkBinCodes(user, warehouseId, codes);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const code of codes) await this.store.saveBin({ warehouseId, code, rack: input.rack, zone: input.zone });
    });
    return this.get(user, warehouseId);
  }

  async updateBin(user: SessionUser, meta: RequestMeta, binId: string, input: BinUpdate): Promise<Warehouse> {
    const { w, b } = await this.currentBin(user, binId, input.rowVersion);
    if (input.code && input.code !== b.code) await this.checkBinCodes(user, w.id, [input.code]);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBin({ ...input, id: binId }));
    return this.get(user, w.id);
  }

  async deleteBin(user: SessionUser, meta: RequestMeta, binId: string, rowVersion: number): Promise<void> {
    await this.currentBin(user, binId, rowVersion);
    if (await this.store.binInUse(binId)) throw new ConflictError('Stock or documents use this bin. Deactivate it instead.', undefined, { code: 'BIN_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteBin(user.tenantId, binId, rowVersion));
  }

  /** Inside the unit of work: the current primary warehouse stops being primary. */
  private async clearPrimary(user: SessionUser) {
    const primary = (await this.store.list(user.tenantId)).find((w) => w.isPrimary);
    if (primary) await this.store.save({ id: primary.id, rowVersion: primary.rowVersion, isPrimary: false });
  }

  private async checkLinks(user: SessionUser, input: { branchId?: string; managerUserId?: string | null; inventoryAccountId?: string | null }) {
    if (input.branchId && !(await this.store.activeBranch(user.tenantId, input.branchId))) {
      throw new ValidationError('Choose an active branch', { branchId: ['Unknown or inactive branch'] });
    }
    if (input.managerUserId && !(await this.store.activeUser(user.tenantId, input.managerUserId))) {
      throw new ValidationError('Choose an active user as manager', { managerUserId: ['Unknown or inactive user'] });
    }
    if (input.inventoryAccountId) await this.gl.postable(user, input.inventoryAccountId, 'inventoryAccountId', [1]);
  }

  private async checkCode(user: SessionUser, code: string) {
    const hit = (await this.store.allCodes(user.tenantId)).find((c) => c.code === code);
    if (!hit) return;
    throw hit.deleted
      ? new ConflictError(`Code ${code} belonged to a deleted warehouse and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async checkBinCodes(user: SessionUser, warehouseId: string, codes: string[]) {
    const used = await this.store.allBinCodes(user.tenantId, warehouseId);
    const clash = used.filter((u) => codes.includes(u.code));
    if (!clash.length) return;
    const names = clash.slice(0, 5).map((c) => c.code).join(', ') + (clash.length > 5 ? ` and ${clash.length - 5} more` : '');
    throw clash.every((c) => c.deleted)
      ? new ConflictError(`Bin ${names} belonged to deleted bins and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`Bin ${names} already exists in this warehouse.`, { code: ['Already used in this warehouse'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async get(user: SessionUser, id: string) {
    const w = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!w) throw new NotFoundError('Warehouse not found');
    return w;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const w = await this.get(user, id);
    if (w.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this warehouse. Reload and try again.');
    return w;
  }

  private async currentBin(user: SessionUser, binId: string, rowVersion: number) {
    const w = (await this.store.list(user.tenantId)).find((x) => x.bins.some((b) => b.id === binId));
    const b = w?.bins.find((x) => x.id === binId);
    if (!w || !b) throw new NotFoundError('Bin not found');
    if (b.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this bin. Reload and try again.');
    return { w, b };
  }
}
