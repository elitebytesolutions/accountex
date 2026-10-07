import { Injectable } from '@nestjs/common';
import { wouldCycle, type Department, type DepartmentCreate, type DepartmentListQuery, type DepartmentUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertCodeFree } from '../../domain/codes.js';
import { DepartmentStore } from './department-store.js';

/** Departments in a hierarchy (no cycles), with cost centre and budget. Heads and headcount come with employees (Phase 11). */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly store: DepartmentStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: DepartmentListQuery) {
    return this.store.page(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<Department> {
    const d = await this.store.get(user.tenantId, id);
    if (!d) throw new NotFoundError('Department not found');
    return d;
  }

  async create(user: SessionUser, meta: RequestMeta, input: DepartmentCreate): Promise<Department> {
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'department');
    await this.checkLinks(user, null, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: DepartmentUpdate): Promise<Department> {
    const d = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== d.code) assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'department');
    await this.checkLinks(user, id, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Department> {
    const d = await this.current(user, id, rowVersion);
    const tree = await this.store.tree(user.tenantId);
    if (!active && tree.some((x) => x.parentId === id && x.isActive)) {
      throw new ConflictError('Deactivate or move its active sub-departments first.', undefined, { code: 'DEPARTMENT_HAS_ACTIVE_CHILDREN' });
    }
    if (active && d.parent && !tree.find((x) => x.id === d.parent!.id)?.isActive) throw new ValidationError('Activate the parent department first', { parentId: ['Parent is inactive'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Sub-departments, designations, employees or documents use this department. Deactivate it instead.', undefined, { code: 'DEPARTMENT_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkLinks(user: SessionUser, id: string | null, l: { parentId?: string | null; costCentreId?: string | null }) {
    if (l.parentId) {
      const tree = await this.store.tree(user.tenantId);
      const parent = tree.find((x) => x.id === l.parentId);
      if (!parent || !parent.isActive) throw new ValidationError('Choose an active parent department', { parentId: ['Unknown or inactive department'] });
      if (id && (l.parentId === id || wouldCycle(new Map(tree.map((x) => [x.id, x.parentId])), id, l.parentId))) {
        throw new ValidationError("A department can't sit under one of its own sub-departments.", { parentId: ['That would make a loop'] }, { code: 'DEPARTMENT_CYCLE' });
      }
    }
    if (l.costCentreId && !(await this.store.activeCostCentre(user.tenantId, l.costCentreId))) throw new ValidationError('Choose an active cost centre', { costCentreId: ['Unknown or inactive cost centre'] });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const d = await this.get(user, id);
    if (d.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this department. Reload and try again.');
    return d;
  }
}
