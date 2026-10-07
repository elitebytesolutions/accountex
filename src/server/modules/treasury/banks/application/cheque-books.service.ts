import { Injectable } from '@nestjs/common';
import { chequeBookErrors, type ChequeBook, type ChequeBookCreate, type ChequeBookUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { BankStore } from './bank-store.js';

const fieldErrors = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));

/** Cheque books of a bank account: leaf ranges never overlap, one book is active at a time. */
@Injectable()
export class ChequeBooksService {
  constructor(
    private readonly store: BankStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, bankAccountId?: string) {
    return this.store.books(user.tenantId, bankAccountId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: ChequeBookCreate): Promise<ChequeBook> {
    const account = (await this.store.accounts(user.tenantId)).find((a) => a.id === input.bankAccountId);
    if (!account) throw new ValidationError('Choose the bank account', { bankAccountId: ['Unknown bank account'] });
    if (account.status !== 'ACTIVE') throw new ValidationError('The bank account is not active', { bankAccountId: ['Only active accounts get cheque books'] });
    await this.checkRange(user, input.bankAccountId, input, null);
    if (input.status === 'ACTIVE') await this.checkOneActive(user, input.bankAccountId, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBook({ ...input, nextLeafNo: input.firstLeafNo }));
    return this.book(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ChequeBookUpdate): Promise<ChequeBook> {
    const b = await this.current(user, id, input.rowVersion);
    const range = { firstLeafNo: input.firstLeafNo ?? b.firstLeafNo, lastLeafNo: input.lastLeafNo ?? b.lastLeafNo, leafDigits: input.leafDigits ?? b.leafDigits };
    const rangeChanged = range.firstLeafNo !== b.firstLeafNo || range.lastLeafNo !== b.lastLeafNo;
    if (rangeChanged && b.used > 0) throw new ValidationError('Leaves were already written from this book', { firstLeafNo: ['The range is fixed once a cheque is written'] });
    if (b.status === 'CANCELLED' || b.status === 'EXHAUSTED') throw new ConflictError('This cheque book is closed.');
    await this.checkRange(user, b.bankAccountId, range, id);
    if (input.status === 'ACTIVE' && b.status !== 'ACTIVE') await this.checkOneActive(user, b.bankAccountId, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBook({ ...input, id, ...(rangeChanged && { nextLeafNo: range.firstLeafNo }) }));
    return this.book(user, id);
  }

  /** ON_ORDER → ACTIVE (one active per account), or → CANCELLED. */
  async setStatus(user: SessionUser, meta: RequestMeta, id: string, action: 'activate' | 'cancel', rowVersion: number): Promise<ChequeBook> {
    const b = await this.current(user, id, rowVersion);
    if (action === 'activate') {
      if (b.status !== 'ON_ORDER') throw new ConflictError('Only a book on order can be activated.');
      await this.checkOneActive(user, b.bankAccountId, id);
    } else if (b.status === 'CANCELLED') {
      return b;
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBook({ id, rowVersion, status: action === 'activate' ? 'ACTIVE' : 'CANCELLED' }));
    return this.book(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const b = await this.current(user, id, rowVersion);
    if (b.used > 0 || (await this.store.bookInUse(id))) {
      throw new ConflictError('Cheques were written from this book. Cancel it instead.', undefined, { code: 'CHEQUE_BOOK_IN_USE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteBook(user.tenantId, id, rowVersion));
  }

  private async checkRange(user: SessionUser, bankAccountId: string, r: { firstLeafNo: number; lastLeafNo: number; leafDigits: number }, selfId: string | null) {
    const errors = chequeBookErrors(r);
    if (Object.keys(errors).length) throw new ValidationError('Check the leaf numbers', fieldErrors(errors));
    const clash = (await this.store.books(user.tenantId, bankAccountId)).find(
      (b) => b.id !== selfId && b.status !== 'CANCELLED' && b.firstLeafNo <= r.lastLeafNo && r.firstLeafNo <= b.lastLeafNo,
    );
    if (clash) {
      throw new ValidationError(`Leaves overlap book ${clash.bookRef ?? `${clash.firstLeafNo}–${clash.lastLeafNo}`}`, { firstLeafNo: [`Overlaps ${clash.firstLeafNo}–${clash.lastLeafNo}`] }, { code: 'CHEQUE_BOOK_OVERLAP' });
    }
  }

  private async checkOneActive(user: SessionUser, bankAccountId: string, selfId: string | null) {
    if ((await this.store.books(user.tenantId, bankAccountId)).some((b) => b.status === 'ACTIVE' && b.id !== selfId)) {
      throw new ConflictError('This bank account already has an active cheque book. Finish or cancel it first.', { status: ['Another book is active'] });
    }
  }

  private async book(user: SessionUser, id: string) {
    const b = (await this.store.books(user.tenantId)).find((x) => x.id === id);
    if (!b) throw new NotFoundError('Cheque book not found');
    return b;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const b = await this.book(user, id);
    if (b.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this cheque book. Reload and try again.');
    return b;
  }
}
