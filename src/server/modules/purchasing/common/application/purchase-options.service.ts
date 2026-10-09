import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { NotFoundError, PermissionDeniedError } from '../../../../core/domain/errors.js';
import { PurchasingStore } from './purchasing-store.js';

const VIEW = ['po:view', 'grn:view', 'bill:view'];

/** Masters the purchasing screens pick from (any purchasing view permission). */
@Injectable()
export class PurchaseOptionsService {
  constructor(private readonly store: PurchasingStore) {}

  options(user: SessionUser) {
    if (!VIEW.some((p) => user.permissions.includes(p))) throw new PermissionDeniedError('You don’t have access to purchasing.');
    return this.store.options(user.tenantId);
  }

  async itemInsight(user: SessionUser, itemId: string) {
    if (!VIEW.some((p) => user.permissions.includes(p))) throw new PermissionDeniedError('You don’t have access to purchasing.');
    const r = await this.store.itemInsight(user.tenantId, itemId);
    if (!r) throw new NotFoundError('Product not found');
    return r;
  }
}
