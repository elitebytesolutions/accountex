import { Injectable } from '@nestjs/common';
import type { Batch, BatchCreate, BatchDispositionChange, BatchListQuery, BatchUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { BatchStore } from './batch-store.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Batches & Expiry register. Batches come from GRNs from Phase 20; for now they're added by hand (e.g. opening stock). */
@Injectable()
export class BatchesService {
  constructor(
    private readonly store: BatchStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: BatchListQuery) {
    return this.store.page(user.tenantId, q, today());
  }

  summary(user: SessionUser) {
    return this.store.summary(user.tenantId, today());
  }

  async create(user: SessionUser, meta: RequestMeta, input: BatchCreate): Promise<Batch> {
    if (!(await this.store.productExists(user.tenantId, input.itemId))) throw new ValidationError('Choose a product', { itemId: ['Unknown product'] });
    if (await this.store.batchNoTaken(user.tenantId, input.itemId, input.batchNo)) {
      throw new ConflictError(`Batch ${input.batchNo} already exists for this product.`, { batchNo: ['Already used for this product'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, disposition: 'SALEABLE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: BatchUpdate): Promise<Batch> {
    const b = await this.current(user, id, input.rowVersion);
    const mfg = input.mfgDate !== undefined ? input.mfgDate : b.mfgDate, exp = input.expiryDate !== undefined ? input.expiryDate : b.expiryDate;
    if (mfg && exp && mfg > exp) throw new ValidationError('Expiry is before manufacture', { expiryDate: ['Expiry is before manufacture'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  /** Saleable / priority / quarantine / clearance / return to principal / written off, stamped with who and when. */
  async setDisposition(user: SessionUser, meta: RequestMeta, id: string, input: BatchDispositionChange): Promise<Batch> {
    const b = await this.current(user, id, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.save({ id, rowVersion: input.rowVersion, disposition: input.disposition, dispositionAt: new Date().toISOString(), dispositionByUserId: user.id, notes: input.notes ?? b.notes }),
    );
    return this.get(user, id);
  }

  private async get(user: SessionUser, id: string) {
    const b = await this.store.get(user.tenantId, id);
    if (!b) throw new NotFoundError('Batch not found');
    return b;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const b = await this.get(user, id);
    if (b.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this batch. Reload and try again.');
    return b;
  }
}
