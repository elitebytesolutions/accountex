import { Injectable } from '@nestjs/common';
import type { AssetQuery, DepreciationRun, DepreciationRunInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { FixedAssetStore } from '../../register/application/fixed-asset-store.js';

/**
 * Monthly depreciation runs, one per period: preview creates the draft run and computes a line per active asset
 * (SLM / WDV, never below residual value); recompute refreshes it; post books Dr depreciation expense / Cr accumulated
 * depreciation and moves each asset's accumulated depreciation; reverse cancels the journal and rolls the assets back.
 */
@Injectable()
export class DepreciationRunsService {
  constructor(private readonly store: FixedAssetStore, private readonly unitOfWork: UnitOfWork) {}

  list(user: SessionUser, q: AssetQuery) {
    return this.store.listRuns(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<DepreciationRun> {
    const r = await this.store.getRun(user.tenantId, id);
    if (!r) throw new NotFoundError('Depreciation run not found');
    return r;
  }

  /** Creates the period's draft run and computes it (409 when the period already has one). */
  async preview(user: SessionUser, meta: RequestMeta, input: DepreciationRunInput) {
    const o = await this.store.options(user.tenantId);
    const p = o.periods.find((x) => x.id === input.fiscalPeriodId);
    if (!p) throw new ValidationError('Choose the period', { fiscalPeriodId: ['Choose the period'] });
    const existing = await this.store.runForPeriod(user.tenantId, input.fiscalPeriodId);
    if (existing) throw new ConflictError(`Period ${p.code} already has run ${existing.docNo}.`, { runId: [existing.id] }, { code: 'DEPRECIATION_PERIOD_HAS_RUN' });
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const runId = await this.store.save('depreciationRunAddUpdate', {
        fiscalPeriodId: input.fiscalPeriodId, postingDate: input.postingDate, branchId: input.branchId ?? null, categoryId: input.categoryId ?? null, notifyUserId: user.id,
      });
      await this.store.run('depreciationRunCompute', runId);
      return runId;
    });
    return this.get(user, id);
  }

  async recompute(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('depreciationRunCompute', id));
    return this.get(user, id);
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.current(user, id, rowVersion);
    if (r.status !== 'DRAFT') throw new ConflictError('This depreciation run is already posted or cancelled.', undefined, { code: 'DEPRECIATION_RUN_NOT_DRAFT' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.run('depreciationRunCompute', id);
      await this.store.run('depreciationRunPost', id);
    });
    return this.get(user, id);
  }

  /** Reverses a posted run (journal reversed, assets rolled back); refused when a later run or a disposal depends on it. */
  async reverse(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const r = await this.current(user, id, rowVersion);
    if (r.status !== 'POSTED') throw new ConflictError('Only a posted run can be reversed; delete a draft instead.', undefined, { code: 'DEPRECIATION_RUN_NOT_DRAFT' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('depreciationRunCancel', id, reason));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.current(user, id, rowVersion);
    if (r.status !== 'DRAFT') throw new ConflictError('Only a draft run can be deleted; reverse a posted one.', undefined, { code: 'DEPRECIATION_RUN_NOT_DRAFT' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('run', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This run was changed. Reload and try again.');
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('This run was changed. Reload and try again.');
    return r;
  }
}
