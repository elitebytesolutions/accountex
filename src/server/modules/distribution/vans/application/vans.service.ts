import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type { Van, VanCreate, VanStatusChange, VanUpdate } from '../../../../../shared/distribution/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { StaffDirectory } from '../../routes/application/staff-directory.js';
import { VanStore } from './van-store.js';

/** A free warehouse code (Warehouses.code: 2–3 letters, "-", 2–6 letters/digits) for a van: VN-LES4471, else VN-01… */
export function stockLocationCode(regNo: string, used: Set<string>): string {
  const alnum = regNo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const tries = [alnum.length >= 2 && alnum.length <= 6 ? alnum : '', alnum.length > 6 ? alnum.slice(-6) : ''].filter(Boolean).map((x) => `VN-${x}`);
  for (const c of tries) if (!used.has(c)) return c;
  for (let n = 1; ; n++) {
    const c = `VN-${String(n).padStart(2, '0')}`;
    if (!used.has(c)) return c;
  }
}

/** Vans: registration, capacity, the VAN-type warehouse holding their stock (one van each) and the default driver. */
@Injectable()
export class VansService {
  constructor(
    private readonly store: VanStore,
    private readonly staff: StaffDirectory,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId, (ids) => this.staff.byIds(user.tenantId, ids));
  }

  warehouses(user: SessionUser) {
    return this.store.vanWarehouses(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: VanCreate): Promise<Van> {
    await this.check(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: VanUpdate): Promise<Van> {
    const v = await this.current(user, id, input.rowVersion);
    await this.check(user, {
      regNo: input.regNo ?? v.regNo,
      warehouseId: input.warehouseId !== undefined ? input.warehouseId : v.warehouse?.id ?? null,
      defaultDriverEmployeeId: input.defaultDriverEmployeeId !== undefined ? input.defaultDriverEmployeeId : v.defaultDriver?.id ?? null,
    }, v);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setStatus(user: SessionUser, meta: RequestMeta, id: string, input: VanStatusChange): Promise<Van> {
    await this.current(user, id, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion: input.rowVersion, status: input.status }));
    return this.get(user, id);
  }

  /**
   * "Create van stock location": in one unit of work, a VAN-type warehouse pointing back at the van (vehicleId, as
   * warehouseVanVehicleChk needs) is created through the warehouses' save function, then the van is linked to it.
   * Code VN-<registration> (or the next free VN-NN; codes are never reused), name "Van <regNo>", the van's branch or
   * the default branch. VAN warehouses are only made here; the warehouses API keeps to WAREHOUSE / SHOP.
   */
  async createStockLocation(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<Van> {
    const v = await this.current(user, id, rowVersion);
    if (v.warehouse) throw new ConflictError(`${v.regNo} already has a stock location (${v.warehouse.code}).`, undefined, { code: 'VAN_HAS_STOCK_LOCATION' });
    const t = user.tenantId;
    const branchId = await this.store.stockBranch(t, v.branchId);
    if (!branchId) throw new ValidationError('Add an active branch first: the van warehouse belongs to one.', { branchId: ['No active branch'] });
    const code = stockLocationCode(v.regNo, new Set(await this.store.warehouseCodes(t)));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const warehouseId = await this.store.saveWarehouse({
        code, name: `Van ${v.regNo}`, description: `Stock carried on van ${v.regNo}`, type: 'VAN', branchId, vehicleId: id,
        blockNegativeStock: true, isPrimary: false, status: 'ACTIVE',
      });
      await this.store.save({ id, rowVersion, warehouseId });
    });
    return this.get(user, id);
  }

  /** Soft delete, only while no route, load sheet, challan, transfer or warehouse points at the van. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Routes, load sheets, challans, transfers or its stock location use this van. Set it inactive instead.', undefined, { code: 'VAN_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async check(user: SessionUser, v: { regNo: string; warehouseId: string | null; defaultDriverEmployeeId: string | null }, self?: Van) {
    const t = user.tenantId;
    if (v.regNo !== self?.regNo && (await this.store.regNoTaken(t, v.regNo, self?.id)))
      throw new ConflictError(`${v.regNo} is already registered.`, { regNo: ['Already registered'] }, { code: 'DB_UNIQUE_VIOLATION' });
    if (v.warehouseId && v.warehouseId !== self?.warehouse?.id) {
      const type = await this.store.warehouseType(t, v.warehouseId);
      if (!type) throw new ValidationError('Choose a van warehouse', { warehouseId: ['Unknown warehouse'] });
      if (type !== 'VAN') throw new ValidationError('A van can only be linked to a warehouse of type Van.', { warehouseId: ['Not a van warehouse'] }, { code: 'VAN_WAREHOUSE_TYPE' });
      if (await this.store.vanOnWarehouse(t, v.warehouseId, self?.id)) throw new ConflictError('Another van already uses this van warehouse.', { warehouseId: ['Used by another van'] }, { code: 'VAN_WAREHOUSE_IN_USE' });
    }
    if (v.defaultDriverEmployeeId && v.defaultDriverEmployeeId !== self?.defaultDriver?.id) {
      const [e] = await this.staff.byIds(t, [v.defaultDriverEmployeeId]);
      if (!e) throw new ValidationError('Choose an employee', { defaultDriverEmployeeId: ['Unknown employee'] });
      if (!e.roles.includes('DELIVERYMAN')) throw new ConflictError(`${e.name} doesn't hold the Deliveryman role.`, { defaultDriverEmployeeId: ['Needs the Deliveryman role'] }, { code: 'ROUTE_STAFF_ROLE_MISMATCH' });
    }
  }

  private async get(user: SessionUser, id: string) {
    const v = (await this.list(user)).find((x) => x.id === id);
    if (!v) throw new NotFoundError('Van not found');
    return v;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const v = await this.get(user, id);
    if (v.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this van. Reload and try again.');
    return v;
  }
}
