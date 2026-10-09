import { Injectable } from '@nestjs/common';
import { PERIOD_MODULES, type FiscalYear, type FiscalYearCreate, type PeriodAction, type PeriodModule, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { FiscalStore } from './fiscal-store.js';

/** Fiscal Years & Periods: create years, close / lock / reopen periods per module. */
@Injectable()
export class FiscalService {
  constructor(
    private readonly store: FiscalStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser): Promise<FiscalYear[]> {
    return this.store.list(user.tenantId);
  }

  /** Next year after the latest one, or the year containing today when the company has none. */
  async create(user: SessionUser, meta: RequestMeta, input: FiscalYearCreate): Promise<FiscalYear> {
    let start = input.startDate ?? (await this.store.nextStart(user.tenantId));
    if (!start) {
      const month = await this.store.startMonth(user.tenantId);
      const now = new Date();
      const year = now.getUTCMonth() + 1 >= month ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      start = `${year}-${String(month).padStart(2, '0')}-01`;
    }
    if (!start.endsWith('-01')) throw new ValidationError('A fiscal year starts on the first day of a month', { startDate: ['Use the 1st of a month'] });
    const startDate = start;
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.create(startDate, input.hasAdjustmentPeriod));
    return (await this.store.list(user.tenantId)).find((y) => y.id === id)!;
  }

  /** Closes the chosen modules (all when none given); the period closes once every module is closed. */
  async close(user: SessionUser, meta: RequestMeta, id: string, input: PeriodAction): Promise<FiscalYear[]> {
    const p = await this.current(user, id, input.rowVersion);
    if (p.status === 'LOCKED') throw new ConflictError('This period is locked.', undefined, { code: 'PERIOD_LOCKED' });
    const modules = input.modules?.length ? input.modules : [...PERIOD_MODULES];
    const after = (m: PeriodModule) => (modules.includes(m) ? 'CLOSED' : (p.modules[m] ?? 'OPEN'));
    const allClosed = PERIOD_MODULES.every((m) => after(m) !== 'OPEN');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.setModules(user.tenantId, id, modules, 'CLOSED', user.id);
      if (allClosed && p.status === 'OPEN') await this.store.setPeriodStatus(user.tenantId, id, p.rowVersion, 'CLOSED');
    });
    return this.list(user);
  }

  /** Locks the whole period: no postings, and reopening needs an approved request (Phase 29). */
  async lock(user: SessionUser, meta: RequestMeta, id: string, input: PeriodAction): Promise<FiscalYear[]> {
    const p = await this.current(user, id, input.rowVersion);
    if (p.status === 'LOCKED') return this.list(user);
    if (p.status !== 'CLOSED') throw new ConflictError('Close every module of the period before locking it.', undefined, { code: 'PERIOD_NOT_CLOSED' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.setModules(user.tenantId, id, [...PERIOD_MODULES], 'LOCKED', user.id);
      await this.store.setPeriodStatus(user.tenantId, id, p.rowVersion, 'LOCKED');
    });
    return this.list(user);
  }

  /** Phase 29: closed periods and modules reopen only through an approved reopen request (/accounting/period-reopen-requests). */
  async reopen(user: SessionUser, _meta: RequestMeta, id: string, input: PeriodAction): Promise<FiscalYear[]> {
    await this.current(user, id, input.rowVersion);
    throw new ConflictError('Reopening a closed period needs an approved reopen request.', undefined, { code: 'REOPEN_NEEDS_REQUEST' });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const p = await this.store.period(user.tenantId, id);
    if (!p) throw new NotFoundError('Period not found');
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this period. Reload and try again.');
    return p;
  }
}
