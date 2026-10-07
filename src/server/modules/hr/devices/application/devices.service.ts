import { Injectable } from '@nestjs/common';
import { deviceErrors, type Device, type DeviceCreate, type DeviceUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertCodeFree } from '../../domain/codes.js';
import { DeviceStore } from './device-store.js';

/**
 * Biometric terminals per branch. Registration only: pulling punches needs the device connector that arrives with
 * attendance, so status stays as the device last reported (Offline for a new one). The comm key is write-only.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly store: DeviceStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  logs(user: SessionUser, deviceId?: string) {
    return this.store.logs(user.tenantId, deviceId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: DeviceCreate): Promise<Device> {
    await this.checkUnique(user, input.code, input.serialNo);
    if (!(await this.store.activeBranch(user.tenantId, input.branchId))) throw new ValidationError('Choose an active branch', { branchId: ['Not an active branch'] });
    const { commKey, ...fields } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...fields, commKeySecret: commKey || null, status: 'OFFLINE', isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: DeviceUpdate): Promise<Device> {
    const d = await this.current(user, id, input.rowVersion);
    await this.checkUnique(user, input.code && input.code !== d.code ? input.code : undefined, input.serialNo && input.serialNo !== d.serialNo ? input.serialNo : undefined);
    if (input.branchId && input.branchId !== d.branch.id && !(await this.store.activeBranch(user.tenantId, input.branchId))) throw new ValidationError('Choose an active branch', { branchId: ['Not an active branch'] });
    const merged = { ...d, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as Device;
    const e = deviceErrors(merged);
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    const { commKey, ...fields } = input;
    // An empty key keeps the stored one; null clears it.
    const key = commKey === null ? { commKeySecret: null } : commKey ? { commKeySecret: commKey } : {};
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...fields, ...key, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Device> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Punches or sync logs come from this device. Deactivate it instead.', undefined, { code: 'DEVICE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkUnique(user: SessionUser, code?: string, serialNo?: string) {
    if (!code && !serialNo) return;
    const taken = await this.store.taken(user.tenantId);
    if (code) assertCodeFree(taken.map((t) => ({ code: t.code, deleted: t.deleted })), code, 'device');
    if (serialNo && taken.some((t) => t.serialNo === serialNo)) throw new ConflictError(`Serial ${serialNo} is already registered.`, { serialNo: ['Already registered'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async get(user: SessionUser, id: string) {
    const d = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!d) throw new NotFoundError('Device not found');
    return d;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const d = await this.get(user, id);
    if (d.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this device. Reload and try again.');
    return d;
  }
}
