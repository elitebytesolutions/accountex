import { Injectable } from '@nestjs/common';
import type { CustomerGroup, CustomerGroupCreate, CustomerGroupUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { CustomerGroupStore } from './customer-group-store.js';

/** Customer groups (filters and reports now; price lists from Phase 9). */
@Injectable()
export class CustomerGroupsService {
  constructor(
    private readonly store: CustomerGroupStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: CustomerGroupCreate): Promise<CustomerGroup> {
    await this.checkCode(user, input.code);
    await this.checkPriceList(user, input.priceListId);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: CustomerGroupUpdate): Promise<CustomerGroup> {
    const g = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== g.code) await this.checkCode(user, input.code);
    await this.checkPriceList(user, input.priceListId);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<CustomerGroup> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Customers belong to this group. Deactivate it instead.', undefined, { code: 'CUSTOMER_GROUP_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkCode(user: SessionUser, code: string) {
    const hit = (await this.store.allCodes(user.tenantId)).find((c) => c.code === code);
    if (!hit) return;
    throw hit.deleted
      ? new ConflictError(`Code ${code} belonged to a deleted group and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async get(user: SessionUser, id: string) {
    const g = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!g) throw new NotFoundError('Customer group not found');
    return g;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const g = await this.get(user, id);
    if (g.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this group. Reload and try again.');
    return g;
  }

  private async checkPriceList(user: SessionUser, id: string | null | undefined) {
    if (id && !(await this.store.activePriceList(user.tenantId, id))) {
      throw new ValidationError('Choose an active price list', { priceListId: ['Unknown or inactive price list'] });
    }
  }
}
