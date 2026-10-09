import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { ValidationError } from '../../../../core/domain/errors.js';
import { PeriodCloseStore } from '../../common/application/period-close-store.js';

/** Profit & Loss, Balance Sheet and Cash Flow from the ledger (Accounting.getProfitAndLossForPeriod / getBalanceSheetAsAt / getCashFlowForPeriod). */
@Injectable()
export class StatementsService {
  constructor(private readonly store: PeriodCloseStore) {}

  pnl(user: SessionUser, q: { from: string; to: string; cmpFrom?: string; cmpTo?: string; branch?: string }) {
    if (q.to < q.from) throw new ValidationError('End after start', { to: ['End after start'] });
    return this.store.pnl(user.tenantId, q.from, q.to, q.cmpFrom ?? null, q.cmpTo ?? null, q.branch ?? null);
  }

  balanceSheet(user: SessionUser, q: { asAt: string; cmpAsAt?: string; branch?: string }) {
    return this.store.balanceSheet(user.tenantId, q.asAt, q.cmpAsAt ?? null, q.branch ?? null);
  }

  cashFlow(user: SessionUser, q: { from: string; to: string; branch?: string }) {
    if (q.to < q.from) throw new ValidationError('End after start', { to: ['End after start'] });
    return this.store.cashFlow(user.tenantId, q.from, q.to, q.branch ?? null);
  }
}
