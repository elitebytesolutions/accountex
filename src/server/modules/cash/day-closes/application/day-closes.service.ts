import { Injectable } from '@nestjs/common';
import { countTotal, type CashDayClose, type DayCountInput, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { VouchersService } from '../../../ledger/vouchers/application/vouchers.service.js';
import { CashBookStore } from '../../book/application/cash-book-store.js';
import { DayCloseStore } from './day-close-store.js';

const lockedErr = (d: string) => new ConflictError(`The cash day ${d} is closed. Reopen it before changing the count.`, undefined, { code: 'CASH_DAY_LOCKED' });

/**
 * Daily cash count: notes counted by denomination against the cash account's GL balance for the day. Locking the day
 * posts any variance to cash over / short (beyond the account's tolerance only with cash approval) and makes the day
 * read-only; reopening (cash approval) reverses the variance voucher.
 */
@Injectable()
export class DayClosesService {
  constructor(
    private readonly store: DayCloseStore,
    private readonly book: CashBookStore,
    private readonly vouchers: VouchersService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** The day's count (or an empty one) with the live book balance and the day's receipts / payments. */
  async day(user: SessionUser, cashAccountId: string, date: string): Promise<CashDayClose> {
    const acc = await this.account(user, cashAccountId);
    const [row, totals, book] = await Promise.all([
      this.store.find(user.tenantId, acc.id, date),
      this.store.dayTotals(user.tenantId, acc.accountId, date),
      this.book.glBalance(user.tenantId, acc.accountId, date),
    ]);
    const base = row ?? { id: null, cashAccountId: acc.id, closeDate: date, bookBalance: book, countedAmount: 0, varianceAmount: -book, status: 'OPEN', lockedBy: null, lockedAt: null, varianceVoucher: null, remarks: null, denominations: [], rowVersion: null };
    // an open count follows the books; a locked one keeps what it was closed against
    const live = base.status === 'LOCKED' ? base : { ...base, bookBalance: book, varianceAmount: Math.round((base.countedAmount - book) * 100) / 100 };
    return { ...live, tolerance: acc.varianceTolerance, receipts: totals.receipts, payments: totals.payments };
  }

  async count(user: SessionUser, meta: RequestMeta, input: DayCountInput) {
    const acc = await this.account(user, input.cashAccountId);
    const cur = await this.store.find(user.tenantId, acc.id, input.closeDate);
    if (cur?.status === 'LOCKED') throw lockedErr(input.closeDate);
    if (cur && cur.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this count. Reload and try again.');
    const book = await this.book.glBalance(user.tenantId, acc.accountId, input.closeDate);
    const dens = input.denominations.filter((d) => d.qty > 0);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      ...(cur && { id: cur.id, rowVersion: cur.rowVersion }), cashAccountId: acc.id, closeDate: input.closeDate, bookBalance: book,
      countedAmount: countTotal(dens), remarks: input.remarks, denominations: dens.map((d) => ({ noteValue: d.noteValue, qty: d.qty })),
    }));
    return this.day(user, acc.id, input.closeDate);
  }

  async lock(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const d = await this.current(user, id, rowVersion);
    if (d.status === 'LOCKED') throw lockedErr(d.closeDate);
    const acc = await this.account(user, d.cashAccountId);
    const book = await this.book.glBalance(user.tenantId, acc.accountId, d.closeDate);
    const variance = Math.round((d.countedAmount - book) * 100) / 100;
    if (Math.abs(variance) > acc.varianceTolerance && !user.permissions.includes('cash:approve')) {
      throw new ForbiddenError(`The count is ${variance > 0 ? 'over' : 'short'} by ${Math.abs(variance).toLocaleString('en-PK')}, beyond the ${acc.varianceTolerance.toLocaleString('en-PK')} allowed. Someone with cash approval must close this day.`, undefined, { code: 'CASH_VARIANCE_APPROVAL' });
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const je = variance !== 0 ? await this.store.postVariance(d.closeDate, acc.branchId, acc.accountId, variance, `${acc.name} ${d.closeDate}`) : null;
      await this.store.set(user.tenantId, id, { bookBalance: book, status: 'LOCKED', lockedByUserId: user.id, lockedAt: new Date(), varianceJournalEntryId: je });
    });
    return this.day(user, acc.id, d.closeDate);
  }

  async reopen(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const d = await this.current(user, id, rowVersion);
    if (d.status !== 'LOCKED') throw new ConflictError('Only a closed cash day can be reopened.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set(user.tenantId, id, { status: 'REOPENED' });
      if (d.varianceVoucher?.status === 'POSTED') {
        const v = await this.vouchers.get(user, d.varianceVoucher.id);
        await this.vouchers.reverse(user, meta, v.id, { reversalDate: d.closeDate, reason: 'OTHER', remarks: 'Cash day reopened', rowVersion: v.rowVersion });
      }
      await this.store.set(user.tenantId, id, { varianceJournalEntryId: null });
    });
    return this.day(user, d.cashAccountId, d.closeDate);
  }

  private async account(user: SessionUser, cashAccountId: string) {
    const acc = (await this.book.options(user.tenantId)).cashAccounts.find((c) => c.id === cashAccountId);
    if (!acc) throw new NotFoundError('Cash account not found');
    return acc;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const d = await this.store.get(user.tenantId, id);
    if (!d) throw new NotFoundError('Cash count not found');
    if (d.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this count. Reload and try again.');
    return d;
  }
}
