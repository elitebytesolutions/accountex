import { Injectable } from '@nestjs/common';
import type { SessionUser, VendorCategory, VendorCategoryCreate, VendorCategoryUpdate } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { VendorCategoryStore } from './vendor-category-store.js';

/** Vendor categories (filters and reports). Names are unique among live rows. */
@Injectable()
export class VendorCategoriesService {
  constructor(
    private readonly store: VendorCategoryStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: VendorCategoryCreate): Promise<VendorCategory> {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: VendorCategoryUpdate): Promise<VendorCategory> {
    await this.current(user, id, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<VendorCategory> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Vendors belong to this category. Deactivate it instead.', undefined, { code: 'VENDOR_CATEGORY_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async get(user: SessionUser, id: string) {
    const c = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!c) throw new NotFoundError('Vendor category not found');
    return c;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this category. Reload and try again.');
    return c;
  }
}
