import { Injectable } from '@nestjs/common';
import type { SessionUser, Unit, UnitCreate, UnitUpdate } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { UnitStore } from './unit-store.js';

/** Units of measure. System units (seeded per company) can be edited and deactivated, never deleted. */
@Injectable()
export class UnitsService {
  constructor(
    private readonly store: UnitStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: UnitCreate): Promise<Unit> {
    await this.checkRetired(user, input.code);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, isSystem: false, isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: UnitUpdate): Promise<Unit> {
    const u = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== u.code) await this.checkRetired(user, input.code);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Unit> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const u = await this.current(user, id, rowVersion);
    if (u.isSystem) throw new ConflictError('Standard units can be edited or deactivated, not deleted.', undefined, { code: 'SYSTEM_ROW_LOCKED' });
    if (await this.store.inUse(id)) throw new ConflictError('Products or documents use this unit. Deactivate it instead.', undefined, { code: 'UNIT_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.delete(user.tenantId, id, rowVersion));
  }

  private async checkRetired(user: SessionUser, code: string) {
    if ((await this.store.retiredCodes(user.tenantId)).includes(code)) {
      throw new ConflictError(`Code ${code} belonged to a deleted unit and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
  }

  private async get(user: SessionUser, id: string) {
    const u = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!u) throw new NotFoundError('Unit not found');
    return u;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const u = await this.get(user, id);
    if (u.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this unit. Reload and try again.');
    return u;
  }
}
