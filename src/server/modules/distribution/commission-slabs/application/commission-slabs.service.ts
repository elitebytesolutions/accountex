import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import {
  slabsContiguous, type CommissionPeriod, type CommissionSlab, type CommissionSlabsResult, type CommissionSlabsSave,
} from '../../../../../shared/distribution/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { CommissionSlabStore } from './commission-slab-store.js';

const today = () => new Date().toISOString().slice(0, 10);
const FAR = '9999-12-31';
const datesOverlap = (a: { from: string; to: string | null }, b: { from: string; to: string | null }) => a.from <= (b.to ?? FAR) && b.from <= (a.to ?? FAR);

/**
 * Commission slabs: achievement bands per effective period. The database blocks overlapping bands (exclusion
 * constraint); the app checks that a period's bands start at 0 % and follow on without gaps. Slabs have no status:
 * a period ends with an effective-to date.
 */
@Injectable()
export class CommissionSlabsService {
  constructor(
    private readonly store: CommissionSlabStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(user: SessionUser, asOf = today()): Promise<CommissionSlabsResult> {
    const periods = this.periods(await this.store.live(user.tenantId));
    const current = periods.find((p) => p.effectiveFrom <= asOf && (!p.effectiveTo || p.effectiveTo >= asOf))?.effectiveFrom ?? null;
    return { asOf, current, periods };
  }

  /** Replaces the bands of one period. Unchanged bands keep their rows; changed or dropped ones are soft-deleted. */
  async save(user: SessionUser, meta: RequestMeta, input: CommissionSlabsSave): Promise<CommissionSlabsResult> {
    const gap = slabsContiguous(input.bands);
    if (gap) throw new ValidationError(gap, { bands: [gap] }, { code: 'COMMISSION_SLABS_NOT_CONTIGUOUS' });
    const all = await this.store.live(user.tenantId);
    const existing = input.replaceFrom ? all.filter((s) => s.effectiveFrom === input.replaceFrom) : [];
    if (input.replaceFrom && !existing.length) throw new NotFoundError('That commission period no longer exists. Reload and try again.');
    const target = { from: input.effectiveFrom, to: input.effectiveTo };
    const clash = all.find((s) => !existing.includes(s) && datesOverlap(target, { from: s.effectiveFrom, to: s.effectiveTo }));
    if (clash) {
      throw new ConflictError(`These dates overlap the period from ${clash.effectiveFrom}${clash.effectiveTo ? ` to ${clash.effectiveTo}` : ''}.`, { effectiveFrom: ['Overlaps another period'] }, { code: 'COMMISSION_SLAB_OVERLAP' });
    }
    const same = (s: CommissionSlab, b: CommissionSlabsSave['bands'][number]) =>
      s.effectiveFrom === input.effectiveFrom && s.effectiveTo === input.effectiveTo && s.label === b.label && s.fromPct === b.fromPct && s.toPct === b.toPct && s.ratePct === b.ratePct;
    const keep = existing.filter((s) => input.bands.some((b) => same(s, b)));
    const drop = existing.filter((s) => !keep.includes(s));
    const add = input.bands.filter((b) => !keep.some((s) => same(s, b)));
    for (const s of drop) await this.notInUse(s);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.softDelete(user.tenantId, drop);
      for (const b of add) await this.store.save({ ...b, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo });
    });
    return this.list(user, input.effectiveFrom);
  }

  /** Removes one band; the rest of its period must still follow on without gaps. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const all = await this.store.live(user.tenantId);
    const s = all.find((x) => x.id === id);
    if (!s) throw new NotFoundError('Commission band not found');
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this band. Reload and try again.');
    const rest = all.filter((x) => x.id !== id && x.effectiveFrom === s.effectiveFrom);
    const gap = slabsContiguous(rest);
    if (gap) throw new ValidationError(`Removing this band leaves the period broken: ${gap}.`, { bands: [gap] }, { code: 'COMMISSION_SLABS_NOT_CONTIGUOUS' });
    await this.notInUse(s);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, [s]));
  }

  private async notInUse(s: CommissionSlab) {
    if (await this.store.inUse(s.id)) throw new ConflictError(`Salesman commissions were worked out on the ${s.label} band. End the period with an effective-to date instead.`, undefined, { code: 'COMMISSION_SLAB_IN_USE' });
  }

  private periods(rows: CommissionSlab[]): CommissionPeriod[] {
    const out: CommissionPeriod[] = [];
    for (const r of rows) {
      const p = out.find((x) => x.effectiveFrom === r.effectiveFrom);
      if (p) p.bands.push(r);
      else out.push({ effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, bands: [r] });
    }
    for (const p of out) p.bands.sort((a, b) => a.fromPct - b.fromPct);
    return out.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  }
}
