import { Injectable } from '@nestjs/common';
import { leaveTypeErrors, type LeaveType, type LeaveTypeCreate, type LeaveTypeUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertCodeFree } from '../../domain/codes.js';
import { LeaveTypeStore } from './leave-type-store.js';

/** Leave types with their accrual, carry-forward, encashment and eligibility rules (requests and balances come later). */
@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly store: LeaveTypeStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: LeaveTypeCreate): Promise<LeaveType> {
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'leave type');
    const { rules, ...fields } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save({ ...fields, status: 'ACTIVE' });
      if (rules?.length) await this.store.replaceRules(newId, rules);
      return newId;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: LeaveTypeUpdate): Promise<LeaveType> {
    const t = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== t.code) assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'leave type');
    const { rules, ...fields } = input;
    const merged = { ...t, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)), rules } as Parameters<typeof leaveTypeErrors>[0];
    const e = leaveTypeErrors(merged);
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ ...fields, id });
      if (rules) await this.store.replaceRules(id, rules);
    });
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<LeaveType> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Leave requests or balances use this leave type. Deactivate it instead.', undefined, { code: 'LEAVE_TYPE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async get(user: SessionUser, id: string) {
    const t = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!t) throw new NotFoundError('Leave type not found');
    return t;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.get(user, id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this leave type. Reload and try again.');
    return t;
  }
}
