import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { NotFoundError, PermissionDeniedError } from '../../../../core/domain/errors.js';
import { ReceivablesStore } from '../../common/application/receivables-store.js';

const today = () => new Date().toISOString().slice(0, 10);

/** AR ageing (Sales.getReceivablesAgeingAsOf, by due or document date) and the customer statement with running balance. */
@Injectable()
export class ArReportsService {
  constructor(private readonly store: ReceivablesStore) {}

  ageing(user: SessionUser, q: { asOf?: string; basis: 'DUE' | 'DOC' }) {
    return this.store.ageing(user.tenantId, q.asOf ?? today(), q.basis);
  }

  async statement(user: SessionUser, q: { customer: string; from?: string; to?: string }) {
    const to = q.to ?? today();
    const from = q.from ?? `${to.slice(0, 4)}-01-01`;
    const s = await this.store.statement(user.tenantId, q.customer, from, to);
    if (!s) throw new NotFoundError('Customer not found');
    return s;
  }

  options(user: SessionUser) {
    if (!['sinv:view', 'rcpt:view', 'pos:create'].some((p) => user.permissions.includes(p))) throw new PermissionDeniedError('You do not have permission to do this.');
    return this.store.options(user.tenantId);
  }
}
