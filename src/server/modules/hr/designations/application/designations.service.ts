import { Injectable } from '@nestjs/common';
import { wouldCycle, type Designation, type DesignationCreate, type DesignationUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { DesignationStore } from './designation-store.js';

/** Designations (positions) per department, with grade, approved positions and a reporting line without loops. */
@Injectable()
export class DesignationsService {
  constructor(
    private readonly store: DesignationStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, departmentId?: string) {
    return this.store.list(user.tenantId, departmentId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: DesignationCreate): Promise<Designation> {
    await this.check(user, null, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: DesignationUpdate): Promise<Designation> {
    const d = await this.current(user, id, input.rowVersion);
    await this.check(user, id, {
      title: input.title ?? d.title, departmentId: input.departmentId ?? d.department.id,
      gradeId: input.gradeId !== undefined ? input.gradeId : null, reportsToDesignationId: input.reportsToDesignationId !== undefined ? input.reportsToDesignationId : null,
    }, input.departmentId !== undefined && input.departmentId !== d.department.id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Designation> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Employees, other designations or job openings use this designation. Deactivate it instead.', undefined, { code: 'DESIGNATION_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async check(user: SessionUser, id: string | null, d: { title: string; departmentId: string; gradeId?: string | null; reportsToDesignationId?: string | null }, deptChanged = true) {
    if (deptChanged && !(await this.store.activeDepartment(user.tenantId, d.departmentId))) throw new ValidationError('Choose an active department', { departmentId: ['Unknown or inactive department'] });
    if (d.gradeId && !(await this.store.activeGrade(user.tenantId, d.gradeId))) throw new ValidationError('Choose an active grade', { gradeId: ['Unknown or inactive grade'] });
    const all = await this.store.list(user.tenantId, d.departmentId);
    if (all.some((x) => x.id !== id && x.title.toLowerCase() === d.title.toLowerCase())) {
      throw new ConflictError('This department already has that designation.', { title: ['Already in this department'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    if (d.reportsToDesignationId) {
      const chain = await this.store.chain(user.tenantId);
      if (!chain.some((x) => x.id === d.reportsToDesignationId)) throw new ValidationError('Choose an existing designation', { reportsToDesignationId: ['Unknown designation'] });
      if (id && (d.reportsToDesignationId === id || wouldCycle(new Map(chain.map((x) => [x.id, x.reportsToDesignationId])), id, d.reportsToDesignationId))) {
        throw new ValidationError("A designation can't report, directly or indirectly, to itself.", { reportsToDesignationId: ['That would make a loop'] }, { code: 'DESIGNATION_CYCLE' });
      }
    }
  }

  private async get(user: SessionUser, id: string) {
    const d = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!d) throw new NotFoundError('Designation not found');
    return d;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const d = await this.get(user, id);
    if (d.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this designation. Reload and try again.');
    return d;
  }
}
