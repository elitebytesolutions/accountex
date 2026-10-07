import { Injectable } from '@nestjs/common';
import { holidayErrors, type Holiday, type HolidayCreate, type HolidayListQuery, type HolidayUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { HolidayStore } from './holiday-store.js';

/** The holiday calendar: public, company, optional holidays and events, for all branches or some; moon-dependent ones may be tentative. */
@Injectable()
export class HolidaysService {
  constructor(
    private readonly store: HolidayStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: HolidayListQuery) {
    return this.store.list(user.tenantId, q);
  }

  async create(user: SessionUser, meta: RequestMeta, input: HolidayCreate): Promise<Holiday> {
    const { branchIds, ...h } = input;
    await this.checkBranches(user, h.appliesToAllBranches ? [] : branchIds);
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.save({ ...h, source: 'MANUAL', branches: h.appliesToAllBranches ? [] : branchIds.map((branchId) => ({ branchId })) }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: HolidayUpdate): Promise<Holiday> {
    const cur = await this.current(user, id, input.rowVersion);
    const { branchIds, ...h } = input;
    const all = h.appliesToAllBranches ?? cur.appliesToAllBranches;
    const ids = branchIds ?? cur.branches.map((b) => b.id);
    const e = holidayErrors({ ...cur, ...Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined)), appliesToAllBranches: all, branchIds: ids });
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    await this.checkBranches(user, all ? [] : ids);
    const existing = await this.store.branchRows(user.tenantId, id);
    const branches = all ? [] : ids.map((branchId) => { const row = existing.find((x) => x.branchId === branchId); return row ? { id: row.id, branchId } : { branchId }; });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...h, id, ...((branchIds !== undefined || h.appliesToAllBranches !== undefined) && { branches }) }));
    return this.get(user, id);
  }

  /** Mark observed / cancelled / back to upcoming (tentative only for moon-dependent holidays). */
  async setStatus(user: SessionUser, meta: RequestMeta, id: string, status: string, rowVersion: number): Promise<Holiday> {
    const h = await this.current(user, id, rowVersion);
    if (status === 'TENTATIVE' && !h.isMoonDependent) throw new ValidationError('Only moon-dependent holidays are tentative', { status: ['Not moon-dependent'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Attendance already uses this holiday. Cancel it instead.', undefined, { code: 'HOLIDAY_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkBranches(user: SessionUser, ids: string[]) {
    if (!(await this.store.activeBranches(user.tenantId, ids))) throw new ValidationError('Choose active branches', { branchIds: ['Unknown or inactive branch'] });
  }

  private async get(user: SessionUser, id: string) {
    const h = (await this.store.list(user.tenantId, {})).find((x) => x.id === id);
    if (!h) throw new NotFoundError('Holiday not found');
    return h;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const h = await this.get(user, id);
    if (h.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this holiday. Reload and try again.');
    return h;
  }
}
