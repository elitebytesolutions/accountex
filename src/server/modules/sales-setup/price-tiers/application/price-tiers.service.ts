import { Injectable } from '@nestjs/common';
import type { PriceTier, PriceTierUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError } from '../../../../core/domain/errors.js';
import { PriceTierStore } from './price-tier-store.js';

/** The three wholesale price tiers (seeded per company; codes fixed by the PriceTierCode lookup): edited, never added or deleted. */
@Injectable()
export class PriceTiersService {
  constructor(
    private readonly store: PriceTierStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: PriceTierUpdate): Promise<PriceTier> {
    const t = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!t) throw new NotFoundError('Price tier not found');
    if (t.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this tier. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return (await this.store.list(user.tenantId)).find((x) => x.id === id)!;
  }
}
