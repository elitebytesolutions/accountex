import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { NotFoundError } from '../../../../core/domain/errors.js';
import { SalesStore } from './sales-store.js';

/** Pick lists, price-list prices and a customer's credit position for the sales document screens. */
@Injectable()
export class SalesOptionsService {
  constructor(private readonly store: SalesStore) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  prices(user: SessionUser, priceListId: string) {
    return this.store.prices(user.tenantId, priceListId);
  }

  async credit(user: SessionUser, customerId: string) {
    const c = await this.store.credit(user.tenantId, customerId);
    if (!c) throw new NotFoundError('Customer not found');
    return c;
  }
}
