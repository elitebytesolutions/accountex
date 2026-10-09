import { Injectable } from '@nestjs/common';
import type { PettyVoucherInput, ReplenishInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { CashBookStore } from '../../book/application/cash-book-store.js';
import { PettyStore } from './petty-store.js';

const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const short = (have: number) => new ValidationError(`The fund has ${have.toLocaleString('en-PK')} in cash. Top it up first.`, { amount: ['More than the fund holds'] }, { code: 'PETTY_FUND_SHORT' });

/**
 * Petty cash: expense vouchers are recorded against a fund (no posting yet — the cash is still in the box, so a voucher
 * can't exceed the fund's cash on hand); a top-up posts every unreplenished voucher's expense plus the imprest refill
 * against the paying cash or bank account (the database's pettyCashReplenishmentPost) and can be cancelled.
 */
@Injectable()
export class PettyService {
  constructor(
    private readonly store: PettyStore,
    private readonly book: CashBookStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  vouchers(user: SessionUser, q: { fund?: string; status?: string; search?: string; page: number; pageSize: number }) {
    return this.store.vouchers(user.tenantId, q);
  }

  async voucher(user: SessionUser, id: string) {
    const p = await this.store.voucher(user.tenantId, id);
    if (!p) throw new NotFoundError('Petty cash voucher not found');
    return p;
  }

  async create(user: SessionUser, meta: RequestMeta, input: PettyVoucherInput) {
    const data = await this.validate(user, input, 0);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveVoucher({ ...data, recordedByUserId: user.id }));
    return this.voucher(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: PettyVoucherInput & { rowVersion: number }) {
    const p = await this.voucher(user, id);
    if (p.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this voucher. Reload and try again.');
    if (p.status !== 'UNREPLENISHED') throw new ConflictError('Only an unreplenished voucher can be changed.');
    const data = await this.validate(user, input, p.fund.id === input.fundId ? p.amount : 0);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveVoucher({ ...data, id, rowVersion: input.rowVersion }));
    return this.voucher(user, id);
  }

  async void(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    const p = await this.voucher(user, id);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this voucher. Reload and try again.');
    if (p.status !== 'UNREPLENISHED') throw new ConflictError(p.status === 'REPLENISHED' ? 'This voucher is already expensed by a top-up; cancel that top-up first.' : 'This voucher is already void.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.voidVoucher(id, reason));
    return this.voucher(user, id);
  }

  replenishments(user: SessionUser, fundId: string | null) {
    return this.store.replenishments(user.tenantId, fundId);
  }

  /** Tops the fund up: posts its unreplenished vouchers (to this date) and the rest of the amount as imprest. */
  async replenish(user: SessionUser, meta: RequestMeta, fundId: string, input: ReplenishInput) {
    const o = await this.book.options(user.tenantId);
    const fund = o.pettyFunds.find((f) => f.id === fundId);
    if (!fund) throw new NotFoundError('Petty cash fund not found');
    if (fund.status === 'CLOSED') throw new ConflictError('This fund is closed.');
    const e: Record<string, string> = {};
    if (input.payFromCashAccountId) {
      const c = o.cashAccounts.find((x) => x.id === input.payFromCashAccountId);
      if (!c) e.payFromCashAccountId = 'Choose an active cash account';
      else if (c.id === fund.cashAccountId) e.payFromCashAccountId = 'Pay from another cash account than the fund itself';
      else if (input.amount > c.balance) throw new ValidationError(`Only ${c.balance.toLocaleString('en-PK')} is in ${c.name}.`, { amount: ['More than the cash available'] }, { code: 'CASH_INSUFFICIENT' });
    }
    if (input.payFromBankAccountId && !o.bankAccounts.some((b) => b.id === input.payFromBankAccountId && b.accountId)) e.payFromBankAccountId = 'Choose an active bank account';
    if (input.amount < fund.unreplenishedTotal) e.amount = `At least the ${fund.unreplenishedTotal.toLocaleString('en-PK')} of unreplenished vouchers`;
    if (Object.keys(e).length) throw v(e);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const rid = await this.store.saveReplenishment({
        fundId, docDate: input.docDate, payFromCashAccountId: input.payFromCashAccountId, payFromBankAccountId: input.payFromBankAccountId, amount: input.amount,
        voucherCount: fund.unreplenishedCount, vouchersTotal: fund.unreplenishedTotal, postTogether: input.postTogether, remarks: input.remarks,
      });
      await this.store.postReplenishment(rid);
      return rid;
    });
    return this.store.replenishment(user.tenantId, id);
  }

  async cancelReplenishment(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    const r = await this.store.replenishment(user.tenantId, id);
    if (!r) throw new NotFoundError('Top-up not found');
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this top-up. Reload and try again.');
    if (r.status !== 'POSTED') throw new ConflictError('Only a posted top-up can be cancelled.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.cancelReplenishment(id, reason));
    return this.store.replenishment(user.tenantId, id);
  }

  private async validate(user: SessionUser, p: PettyVoucherInput, ownAmount: number) {
    const o = await this.book.options(user.tenantId);
    const fund = o.pettyFunds.find((f) => f.id === p.fundId);
    const cat = o.expenseCategories.find((c) => c.id === p.categoryId);
    const e: Record<string, string> = {};
    if (!fund) e.fundId = 'Choose a fund';
    else if (fund.status === 'CLOSED') e.fundId = 'This fund is closed';
    if (!cat) e.categoryId = 'Choose an active category';
    if (p.accountId && !o.accounts.some((a) => a.id === p.accountId)) e.accountId = 'Choose an active postable account';
    if (p.costCentreId && !o.costCentres.some((c) => c.id === p.costCentreId)) e.costCentreId = 'Choose an active cost centre';
    if (cat?.receiptRequired && p.receiptStatus === 'MISSING') e.receiptStatus = 'This category needs a receipt';
    if (Object.keys(e).length) throw v(e);
    if (p.amount > fund!.cashOnHand + ownAmount) throw short(fund!.cashOnHand + ownAmount);
    return {
      fundId: p.fundId, docDate: p.docDate, categoryId: p.categoryId, description: p.description, paidTo: p.paidTo, amount: p.amount,
      accountId: p.accountId ?? cat!.accountId, costCentreId: p.costCentreId, receiptStatus: p.receiptStatus, receiptCount: p.receiptCount,
    };
  }
}
