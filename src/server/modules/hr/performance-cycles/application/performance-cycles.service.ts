import { Injectable } from '@nestjs/common';
import {
  CYCLE_STAGES, cycleErrors, type PerformanceCycle, type PerformanceCycleCreate, type PerformanceCycleUpdate, type SessionUser, type TalentListQuery,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PerformanceCycleStore } from './performance-cycle-store.js';

const closed = () => new ConflictError('This appraisal cycle is closed and can\'t be changed.', undefined, { code: 'PERFORMANCE_CYCLE_CLOSED' });

/**
 * Appraisal cycles: DRAFT → ACTIVE (one per company) → CLOSED; while active the stage moves through the five steps in
 * order. There is no open / close function in the database: the status and stage are saved through the cycle's save.
 */
@Injectable()
export class PerformanceCyclesService {
  constructor(
    private readonly store: PerformanceCycleStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: TalentListQuery) {
    return this.store.page(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<PerformanceCycle> {
    const c = await this.store.get(user.tenantId, id);
    if (!c) throw new NotFoundError('Performance cycle not found');
    return c;
  }

  async create(user: SessionUser, meta: RequestMeta, input: PerformanceCycleCreate): Promise<PerformanceCycle> {
    await this.assertNameFree(user, input.name, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, stage: 'GOAL_SETTING', status: 'DRAFT' }));
    return this.get(user, id);
  }

  /** Settings can change while the cycle is a draft or active; a closed cycle is read-only. */
  async update(user: SessionUser, meta: RequestMeta, id: string, input: PerformanceCycleUpdate): Promise<PerformanceCycle> {
    const c = await this.current(user, id, input.rowVersion);
    if (c.status === 'CLOSED') throw closed();
    if (input.name && input.name !== c.name) await this.assertNameFree(user, input.name, id);
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const e = cycleErrors({ ...c, ...patch });
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...patch, id }));
    return this.get(user, id);
  }

  async open(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<PerformanceCycle> {
    const c = await this.current(user, id, rowVersion);
    if (c.status === 'CLOSED') throw closed();
    if (c.status === 'ACTIVE') throw new ValidationError('This cycle is already open', { status: ['Already active'] });
    const other = await this.store.active(user.tenantId);
    if (other && other.id !== id) throw new ConflictError(`${other.name} is already active. Close it before opening this one.`, undefined, { code: 'PERFORMANCE_CYCLE_ACTIVE_EXISTS' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: 'ACTIVE', stage: CYCLE_STAGES[0] }));
    return this.get(user, id);
  }

  async advance(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<PerformanceCycle> {
    const c = await this.current(user, id, rowVersion);
    if (c.status === 'CLOSED') throw closed();
    if (c.status !== 'ACTIVE') throw new ValidationError('Open the cycle first', { status: ['Draft cycle'] });
    const at = CYCLE_STAGES.indexOf(c.stage as (typeof CYCLE_STAGES)[number]);
    const next = CYCLE_STAGES[at + 1];
    if (!next) throw new ValidationError('Sign-off is the last stage: close the cycle instead', { stage: ['Last stage'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, stage: next }));
    return this.get(user, id);
  }

  async close(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<PerformanceCycle> {
    const c = await this.current(user, id, rowVersion);
    if (c.status === 'CLOSED') throw closed();
    if (c.status !== 'ACTIVE') throw new ValidationError('Only an open cycle can be closed; delete a draft instead', { status: ['Draft cycle'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: 'CLOSED' }));
    return this.get(user, id);
  }

  /** Only an unused draft can be deleted (hard delete: cycles have no deletedAt). */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const c = await this.current(user, id, rowVersion);
    if (c.status !== 'DRAFT' || (await this.store.inUse(id))) {
      throw new ConflictError(c.status !== 'DRAFT' ? 'Only a draft cycle can be deleted. Close it instead.' : 'Goals, reviews, feedback or 1:1s belong to this cycle.', undefined, { code: 'PERFORMANCE_CYCLE_IN_USE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.remove(user.tenantId, id, rowVersion));
  }

  private async assertNameFree(user: SessionUser, name: string, id: string | null) {
    const hit = await this.store.byName(user.tenantId, name);
    if (hit && hit.id !== id) throw new ConflictError(`A cycle named ${name} already exists.`, { name: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this cycle. Reload and try again.');
    return c;
  }
}
