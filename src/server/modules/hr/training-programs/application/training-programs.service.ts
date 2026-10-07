import { Injectable } from '@nestjs/common';
import {
  programErrors, TRAINING_TRANSITIONS, type SessionUser, type TalentListQuery, type TrainingProgram, type TrainingProgramCreate, type TrainingProgramUpdate,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { TrainingProgramStore } from './training-program-store.js';

/**
 * Training programs (the catalogue sessions and enrolments hang off in Phase 33). No activate / deactivate: the status
 * (PLANNED → IN_PROGRESS → COMPLETED, or CANCELLED) replaces it. Sessions are never sent from here.
 */
@Injectable()
export class TrainingProgramsService {
  constructor(
    private readonly store: TrainingProgramStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: TalentListQuery) {
    return this.store.page(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<TrainingProgram> {
    const p = await this.store.get(user.tenantId, id);
    if (!p) throw new NotFoundError('Training program not found');
    return p;
  }

  async create(user: SessionUser, meta: RequestMeta, input: TrainingProgramCreate): Promise<TrainingProgram> {
    await this.assertNameFree(user, input.name, null);
    await this.checkDepartment(user, input.departmentId);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, status: 'PLANNED' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: TrainingProgramUpdate): Promise<TrainingProgram> {
    const p = await this.current(user, id, input.rowVersion);
    if (input.name && input.name !== p.name) await this.assertNameFree(user, input.name, id);
    if (input.departmentId && input.departmentId !== p.department?.id) await this.checkDepartment(user, input.departmentId);
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const e = programErrors({ ...p, ...patch });
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...patch, id }));
    return this.get(user, id);
  }

  async setStatus(user: SessionUser, meta: RequestMeta, id: string, status: string, rowVersion: number): Promise<TrainingProgram> {
    const p = await this.current(user, id, rowVersion);
    if (p.status === status) return p;
    if (!TRAINING_TRANSITIONS[p.status]?.includes(status)) throw new ValidationError(`A ${p.status.toLowerCase().replace('_', ' ')} program can't move to ${status.toLowerCase().replace('_', ' ')}`, { status: ['Not allowed from the current status'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status }));
    return this.get(user, id);
  }

  /** Soft delete of an unused program; one with sessions or enrolments is cancelled instead. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Sessions or enrolments use this program. Cancel it instead.', undefined, { code: 'TRAINING_PROGRAM_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkDepartment(user: SessionUser, departmentId: string | null | undefined) {
    if (departmentId && !(await this.store.activeDepartment(user.tenantId, departmentId))) throw new ValidationError('Choose an active department', { departmentId: ['Unknown or inactive department'] });
  }

  private async assertNameFree(user: SessionUser, name: string, id: string | null) {
    const hit = (await this.store.allNames(user.tenantId)).find((n) => n.id !== id && n.name.toLowerCase() === name.toLowerCase());
    if (hit) {
      throw new ConflictError(hit.deleted ? `${name} belonged to a deleted program and can't be reused.` : `A program named ${name} already exists.`,
        { name: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const p = await this.get(user, id);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this program. Reload and try again.');
    return p;
  }
}
