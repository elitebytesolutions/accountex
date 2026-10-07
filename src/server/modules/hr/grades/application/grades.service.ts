import { Injectable } from '@nestjs/common';
import type { Grade, GradeCreate, GradeUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertCodeFree } from '../../domain/codes.js';
import { GradeStore } from './grade-store.js';

/** Grade bands (G-1 …) with monthly salary ranges: min ≤ mid ≤ max, one grade per level rank. */
@Injectable()
export class GradesService {
  constructor(
    private readonly store: GradeStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: GradeCreate): Promise<Grade> {
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'grade');
    await this.checkRank(user, null, input.levelRank);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: GradeUpdate): Promise<Grade> {
    const g = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== g.code) assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'grade');
    if (input.levelRank !== undefined && input.levelRank !== g.levelRank) await this.checkRank(user, id, input.levelRank);
    const min = input.minSalary ?? g.minSalary, mid = input.midSalary ?? g.midSalary, max = input.maxSalary ?? g.maxSalary;
    if (!(min <= mid && mid <= max)) throw new ValidationError('Min ≤ mid ≤ max', { midSalary: ['Min ≤ mid ≤ max'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Grade> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Designations, employees or policies use this grade. Deactivate it instead.', undefined, { code: 'GRADE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  /** Ranks are unique across every grade row, deleted ones included (the DB constraint has no deletedAt filter). */
  private async checkRank(user: SessionUser, id: string | null, rank: number) {
    const hit = (await this.store.allRanks(user.tenantId)).find((g) => g.id !== id && g.levelRank === rank);
    if (!hit) return;
    throw new ConflictError(hit.deleted ? `Level ${rank} belonged to a deleted grade and can't be reused.` : `Level ${rank} already has a grade.`, { levelRank: [hit.deleted ? 'Used by a deleted grade' : 'Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async get(user: SessionUser, id: string) {
    const g = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!g) throw new NotFoundError('Grade not found');
    return g;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const g = await this.get(user, id);
    if (g.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this grade. Reload and try again.');
    return g;
  }
}
