import { Injectable } from '@nestjs/common';
import type { BankBook, BankTxn, BankTxnQuery, CategoriseInput, SessionUser, VoucherInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { VouchersService } from '../../../ledger/vouchers/application/vouchers.service.js';
import { BankTxnStore } from './bank-txn-store.js';

const locked = () => new ConflictError('This statement line is already categorised, matched or reconciled.', undefined, { code: 'STATEMENT_LINE_LOCKED' });

/**
 * The bank book: one row per posted voucher line on a bank account's GL account (made by the database on posting), plus
 * imported statement lines that are not in the books yet. Categorising such a line raises a BPV / BRV for it.
 */
@Injectable()
export class BankTransactionsService {
  constructor(
    private readonly store: BankTxnStore,
    private readonly vouchers: VouchersService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  list(user: SessionUser, q: BankTxnQuery) {
    return this.store.list(user.tenantId, user.id, q);
  }

  async get(user: SessionUser, id: string) {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw new NotFoundError('Bank transaction not found');
    return t;
  }

  /** Bank book: opening balance, booked transactions with a running balance, closing balance. */
  async book(user: SessionUser, q: { account: string; from: string; to: string }): Promise<BankBook> {
    if (q.from > q.to) throw new ValidationError('The start date must be on or before the end date', { from: ['On or before the end date'] });
    const opts = await this.store.options(user.tenantId);
    const bank = opts.bankAccounts.find((b) => b.id === q.account);
    if (!bank) throw new NotFoundError('Bank account not found');
    const opening = Math.round((await this.store.balanceBefore(user.tenantId, bank.id, q.from)) * 100) / 100;
    let run = opening;
    const rows = (await this.store.booked(user.tenantId, bank.id, q.from, q.to)).map((t) => ({ ...t, balance: (run = Math.round((run + t.deposit - t.withdrawal) * 100) / 100) }));
    const gl = opts.accounts.find((a) => a.id === bank.accountId);
    return {
      bankAccount: { id: bank.id, title: bank.title, last4: bank.last4, glCode: gl?.code ?? null }, from: q.from, to: q.to, opening, closing: run,
      deposits: Math.round(rows.reduce((s, r) => s + r.deposit, 0) * 100) / 100, withdrawals: Math.round(rows.reduce((s, r) => s + r.withdrawal, 0) * 100) / 100, rows,
    };
  }

  /** Raises the BPV (money out) or BRV (money in) for an uncategorised imported line; posted unless a workflow routes it. */
  async categorise(user: SessionUser, meta: RequestMeta, id: string, input: CategoriseInput, bankRuleId?: string | null): Promise<BankTxn> {
    const t = await this.get(user, id);
    if (t.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this line. Reload and try again.');
    if (t.status !== 'UNCATEGORISED' || (await this.store.openVoucherFor(user.tenantId, id))) throw locked();
    const opts = await this.store.options(user.tenantId);
    const bank = opts.bankAccounts.find((b) => b.id === t.bankAccount.id);
    if (!bank?.accountId) throw new ValidationError('This bank account has no GL account.');
    if (!opts.accounts.some((a) => a.id === input.accountId)) throw new ValidationError('Choose an active postable account', { accountId: ['Choose an active postable account'] });
    if (input.accountId === bank.accountId) throw new ValidationError('Choose the other side of the entry, not the bank itself', { accountId: ['Not the bank account'] });
    const amount = t.deposit || t.withdrawal;
    const out = t.withdrawal > 0;
    const voucher: VoucherInput = {
      voucherType: out ? 'BPV' : 'BRV', docDate: t.txnDate, postingDate: t.txnDate, referenceNo: t.reference, branchId: bank.branchId, department: null,
      narration: (input.narration ?? t.description).slice(0, 300), remarks: null, tags: [], cashBankAccountId: bank.accountId, partyName: null,
      instrumentType: null, instrumentNo: null, instrumentDate: null, autoReverseOn: null,
      lines: [{ accountId: input.accountId, particulars: t.detail ?? t.description.slice(0, 200), debit: out ? amount : 0, credit: out ? 0 : amount, costCentreId: input.costCentreId }],
    };
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.categoriseLine(user.tenantId, id, { accountId: input.accountId, costCentreId: input.costCentreId, category: input.category, bankRuleId });
      await this.vouchers.createForSource(user, meta, voucher, { type: 'BK', id, no: t.reference });
    });
    return this.get(user, id);
  }
}
