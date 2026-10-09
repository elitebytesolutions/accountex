import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PayablesStore } from '../../common/application/payables-store.js';

/** AP Ageing (open bill balances in due-date or bill-date buckets) and the Vendor Statement (AP sub-ledger, running balance). */
@Injectable()
export class PayablesReportsService {
  constructor(private readonly store: PayablesStore) {}

  ageing(user: SessionUser, q: { asOf?: string; basis: 'DUE' | 'BILL'; branch?: string; vendor?: string; includeZero: boolean }) {
    return this.store.ageing(user.tenantId, { ...q, asOf: q.asOf ?? new Date().toISOString().slice(0, 10) });
  }

  async statement(user: SessionUser, q: { vendor: string; from: string; to: string }) {
    if (q.from > q.to) throw new ValidationError('The period starts after it ends.', { from: ['On or before the end date'] });
    const s = await this.store.statement(user.tenantId, q.vendor, q.from, q.to);
    if (!s) throw new NotFoundError('Vendor not found');
    return s;
  }
}
