import { Injectable } from '@nestjs/common';
import type { Branch, BranchCreate, BranchUpdate, ListResult, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError } from '../../../../core/domain/errors.js';
import { BranchStore, type BranchListQuery } from './branch-store.js';

/** Branch use cases. Every change runs in the user's audit context, so row history records who made it. */
@Injectable()
export class BranchesService {
  constructor(
    private readonly store: BranchStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, query: BranchListQuery): Promise<ListResult<Branch>> {
    return this.store.list(user.tenantId, query);
  }

  async get(user: SessionUser, id: string): Promise<Branch> {
    const branch = await this.store.get(user.tenantId, id);
    if (!branch) throw new NotFoundError('Branch not found');
    return branch;
  }

  async create(user: SessionUser, meta: RequestMeta, input: BranchCreate): Promise<Branch> {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, status: 'ACTIVE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: BranchUpdate): Promise<Branch> {
    await this.get(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  /** Deactivate / activate. The database refuses to deactivate the default or the last active branch. */
  async setStatus(user: SessionUser, meta: RequestMeta, id: string, status: 'ACTIVE' | 'INACTIVE', rowVersion: number): Promise<Branch> {
    await this.get(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, status, rowVersion }));
    return this.get(user, id);
  }

  async makeDefault(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<Branch> {
    await this.ensureVersion(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.makeDefault(id));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.ensureVersion(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.delete(user.tenantId, id));
  }

  /** The user acted on the version they saw; anything else is a lost update. */
  private async ensureVersion(user: SessionUser, id: string, rowVersion: number) {
    const branch = await this.get(user, id);
    if (branch.rowVersion !== rowVersion) {
      throw new ConcurrencyError('Someone else changed this branch. Reload and try again.');
    }
  }
}
