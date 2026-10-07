import { Injectable } from '@nestjs/common';
import { shiftErrors, type SessionUser, type Shift, type ShiftCreate, type ShiftUpdate } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertCodeFree } from '../../domain/codes.js';
import { ShiftStore } from './shift-store.js';

/** Work shifts: timings (overnight allowed, flag computed), grace, break, half-day and overtime rules; one default shift. */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly store: ShiftStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: ShiftCreate): Promise<Shift> {
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'shift');
    const first = (await this.store.list(user.tenantId)).length === 0;
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.save({ ...input, crossesMidnight: input.endTime < input.startTime, isDefault: first, status: 'ACTIVE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ShiftUpdate): Promise<Shift> {
    const s = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== s.code) assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'shift');
    const merged = { ...s, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as Shift & ShiftUpdate;
    const e = shiftErrors(merged);
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id, crossesMidnight: merged.endTime < merged.startTime }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Shift> {
    const s = await this.current(user, id, rowVersion);
    if (!active && s.isDefault) throw new ConflictError('This is the default shift. Make another shift the default first.', undefined, { code: 'SHIFT_DEFAULT_REQUIRED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  /** The company default (new employees get it); the previous default stops being the default. */
  async makeDefault(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<Shift> {
    const s = await this.current(user, id, rowVersion);
    if (s.status !== 'ACTIVE') throw new ValidationError('Activate the shift first', { status: ['Inactive shift'] });
    const others = (await this.store.list(user.tenantId)).filter((x) => x.isDefault && x.id !== id);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const o of others) await this.store.save({ id: o.id, isDefault: false });
      await this.store.save({ id, rowVersion, isDefault: true });
    });
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const s = await this.current(user, id, rowVersion);
    if (s.isDefault) throw new ConflictError('This is the default shift. Make another shift the default first.', undefined, { code: 'SHIFT_DEFAULT_REQUIRED' });
    if (await this.store.inUse(id)) throw new ConflictError('Employees, rosters or attendance use this shift. Deactivate it instead.', undefined, { code: 'SHIFT_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async get(user: SessionUser, id: string) {
    const s = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!s) throw new NotFoundError('Shift not found');
    return s;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this shift. Reload and try again.');
    return s;
  }
}
