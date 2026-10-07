import { Injectable } from '@nestjs/common';
import { overtimeErrors, type OvertimeCreate, type OvertimePolicy, type OvertimeUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { OvertimeStore } from './overtime-store.js';

const activeExists = () => new ConflictError('Only one overtime policy can be active. Deactivate the current one first.', undefined, { code: 'OVERTIME_POLICY_ACTIVE_EXISTS' });

/** Overtime policies: rates, caps and approval rules. One is active per company (claims arrive with attendance). */
@Injectable()
export class OvertimeService {
  constructor(
    private readonly store: OvertimeStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  grades(user: SessionUser) {
    return this.store.grades(user.tenantId);
  }

  /** A new policy starts active only when no other policy is. */
  async create(user: SessionUser, meta: RequestMeta, input: OvertimeCreate): Promise<OvertimePolicy> {
    const none = !(await this.store.list(user.tenantId)).some((p) => p.isActive);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, isActive: none }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: OvertimeUpdate): Promise<OvertimePolicy> {
    const p = await this.current(user, id, input.rowVersion);
    const merged = { ...p, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as OvertimePolicy;
    const e = overtimeErrors(merged);
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<OvertimePolicy> {
    await this.current(user, id, rowVersion);
    if (active && (await this.store.list(user.tenantId)).some((p) => p.isActive && p.id !== id)) throw activeExists();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Overtime claims use this policy. Deactivate it instead.', undefined, { code: 'DB_FOREIGN_KEY_VIOLATION' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async get(user: SessionUser, id: string) {
    const p = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!p) throw new NotFoundError('Overtime policy not found');
    return p;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const p = await this.get(user, id);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this policy. Reload and try again.');
    return p;
  }
}
