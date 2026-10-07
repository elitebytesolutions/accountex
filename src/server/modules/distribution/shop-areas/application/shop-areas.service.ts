import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type { ShopArea, ShopAreaCreate, ShopAreaUpdate } from '../../../../../shared/distribution/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { ShopAreaStore } from './shop-area-store.js';

/** Shop areas: the groups shown as chips on the route board (Manage areas). */
@Injectable()
export class ShopAreasService {
  constructor(
    private readonly store: ShopAreaStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: ShopAreaCreate): Promise<ShopArea> {
    await this.checkUnique(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, status: 'ACTIVE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ShopAreaUpdate): Promise<ShopArea> {
    const a = await this.current(user, id, input.rowVersion);
    await this.checkUnique(user, { code: input.code !== undefined ? input.code : a.code, name: input.name ?? a.name, city: input.city !== undefined ? input.city : a.city }, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<ShopArea> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  /** Soft delete, only while no shop profile uses the area. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Shops on routes use this area. Deactivate it instead.', undefined, { code: 'SHOP_AREA_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkUnique(user: SessionUser, a: { code: string | null; name: string; city: string | null }, exceptId?: string) {
    const hit = await this.store.clashes(user.tenantId, a, exceptId);
    if (hit.code) throw new ConflictError(`Code ${a.code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    if (hit.name) throw new ConflictError(`${a.name}${a.city ? `, ${a.city}` : ''} already exists.`, { name: ['Already exists in this city'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async get(user: SessionUser, id: string) {
    const a = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!a) throw new NotFoundError('Shop area not found');
    return a;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const a = await this.get(user, id);
    if (a.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this area. Reload and try again.');
    return a;
  }
}
