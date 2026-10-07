import { Injectable } from '@nestjs/common';
import type { DocumentType, NumberingSeries, NumberingSeriesCreate, NumberingSeriesUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError } from '../../../../core/domain/errors.js';
import { NumberingStore } from './numbering-store.js';

/** Numbering series use cases. Format locks for series in use are enforced by the database. */
@Injectable()
export class NumberingService {
  constructor(
    private readonly store: NumberingStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser): Promise<NumberingSeries[]> {
    return this.store.list(user.tenantId);
  }

  documentTypes(): Promise<DocumentType[]> {
    return this.store.documentTypes();
  }

  async get(user: SessionUser, id: string): Promise<NumberingSeries> {
    const series = await this.store.get(user.tenantId, id);
    if (!series) throw new NotFoundError('Numbering series not found');
    return series;
  }

  async create(user: SessionUser, meta: RequestMeta, input: NumberingSeriesCreate): Promise<NumberingSeries> {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(input));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: NumberingSeriesUpdate): Promise<NumberingSeries> {
    await this.get(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const series = await this.get(user, id);
    if (series.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this series. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.delete(user.tenantId, id));
  }
}
