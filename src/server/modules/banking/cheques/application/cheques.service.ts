import { Injectable } from '@nestjs/common';
import { chequeActions, type BounceInput, type Cheque, type ChequeAction, type ChequeInput, type ChequeQuery, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { BankTransactionsService } from '../../transactions/application/bank-transactions.service.js';
import { ChequeStore } from './cheque-store.js';

const today = () => new Date().toISOString().slice(0, 10);
const stateErr = (c: Cheque, action: string) =>
  new ConflictError(`Cheque ${c.chequeNo} can't ${action} while it is ${c.status.toLowerCase().replace('_', ' ')}.`, undefined, { code: 'CHEQUE_STATE' });
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * Received and issued cheques through clearing accounts. Recording posts a JV (received: Dr cheques in hand / Cr
 * customer; issued: Dr vendor / Cr PDC payable); clearing posts the BRV / BPV that moves the money through the bank;
 * a bounce, stop, cancel or replacement reverses what is still posted. The DB guard enforces the status machine.
 */
@Injectable()
export class ChequesService {
  constructor(
    private readonly store: ChequeStore,
    private readonly txns: BankTransactionsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async list(user: SessionUser, q: ChequeQuery) {
    const t = today();
    return this.store.list(user.tenantId, q, t, await this.store.fiscalYearStart(user.tenantId, t));
  }

  async get(user: SessionUser, id: string) {
    const c = await this.store.get(user.tenantId, id);
    if (!c) throw new NotFoundError('Cheque not found');
    return c;
  }

  async create(user: SessionUser, meta: RequestMeta, input: ChequeInput): Promise<Cheque> {
    const data = await this.validate(user, input, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.createIn(user, input, data));
    return this.get(user, id);
  }

  /** Inside a unit of work: saves the cheque, advances its cheque book and posts the receipt / issue voucher. */
  async createIn(user: SessionUser, input: ChequeInput, data?: Record<string, unknown>) {
    const d = data ?? (await this.validate(user, input, null));
    const id = await this.store.save({ ...d, status: input.direction === 'RECEIVED' ? 'IN_HAND' : 'ISSUED' });
    await this.advanceBook(user, input);
    await this.store.record(id);
    return id;
  }

  /** Only an in-hand / issued cheque: its voucher is reversed and posted again with the new details. */
  async update(user: SessionUser, meta: RequestMeta, id: string, input: ChequeInput & { rowVersion: number }): Promise<Cheque> {
    const c = await this.current(user, id, input.rowVersion);
    if (!c.actions.includes('edit')) throw stateErr(c, 'edit');
    if (input.direction !== c.direction) throw new ValidationError('A cheque can’t change between received and issued.', { direction: ['Fixed once recorded'] });
    const data = await this.validate(user, input, id);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (c.voucher?.status === 'POSTED') await this.store.reverseEntries(id, c.receivedOn ?? c.docDate, 'Cheque details changed');
      await this.store.save({ ...data, id, rowVersion: input.rowVersion });
      await this.advanceBook(user, input);
      await this.store.record(id);
    });
    return this.get(user, id);
  }

  async deposit(user: SessionUser, meta: RequestMeta, id: string, a: ChequeAction) {
    const c = await this.can(user, id, a.rowVersion, 'deposit');
    const bankAccountId = a.bankAccountId ?? c.bankAccount?.id;
    if (!bankAccountId) throw v({ bankAccountId: 'Choose the bank account it is deposited into' });
    await this.checkBank(user, bankAccountId);
    if (c.isPdc && a.date < c.chequeDate) throw new ConflictError(`This post-dated cheque can be deposited from ${c.chequeDate}.`, undefined, { code: 'CHEQUE_NOT_MATURE' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set(user.tenantId, id, { depositedOn: new Date(a.date), bankAccountId });
      await this.store.lifecycle('chequeDeposit', id);
      if (c.postingMode === 'CLEAR_ON_DEPOSIT') {
        await this.store.set(user.tenantId, id, { clearedOn: new Date(a.date) });
        await this.store.lifecycle('chequeClear', id);
      }
    });
    return this.get(user, id);
  }

  async present(user: SessionUser, meta: RequestMeta, id: string, a: ChequeAction) {
    await this.can(user, id, a.rowVersion, 'present');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set(user.tenantId, id, { presentedOn: new Date(a.date) });
      await this.store.lifecycle('chequePresent', id);
    });
    return this.get(user, id);
  }

  /** Received: deposited → cleared (BRV). Issued: issued / presented → cleared (BPV). */
  async clear(user: SessionUser, meta: RequestMeta, id: string, a: ChequeAction) {
    const c = await this.can(user, id, a.rowVersion, 'clear');
    const from = c.depositedOn ?? c.presentedOn ?? c.docDate;
    if (a.date < from) throw v({ date: `On or after ${from}` });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (c.status === 'ISSUED') {
        await this.store.set(user.tenantId, id, { presentedOn: new Date(a.date) });
        await this.store.lifecycle('chequePresent', id);
      }
      await this.store.set(user.tenantId, id, { clearedOn: new Date(a.date) });
      await this.store.lifecycle('chequeClear', id);
    });
    return this.get(user, id);
  }

  /** Deposited / presented → bounced: the receipt or issue voucher is reversed; charges, their recovery and a credit hold are optional. */
  async bounce(user: SessionUser, meta: RequestMeta, id: string, b: BounceInput) {
    const c = await this.can(user, id, b.rowVersion, 'bounce');
    if (b.creditHold && !c.customer) throw v({ creditHold: 'Only a customer can be put on credit hold' });
    if (b.recoverCharges && !c.customer) throw v({ recoverCharges: 'Charges are recovered from a customer' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.addBounce(user.tenantId, {
        chequeId: id, bounceDate: new Date(b.bounceDate), reason: b.reason, bankCharges: b.bankCharges, recoverCharges: b.recoverCharges,
        notifyOwner: false, creditHold: b.creditHold, resolution: 'OPEN', remarks: b.remarks,
      });
      await this.store.set(user.tenantId, id, { bouncedOn: new Date(b.bounceDate), bounceCount: c.bounceCount + 1 });
      await this.store.lifecycle('chequeBounce', id);
    });
    return this.get(user, id);
  }

  /** Bounced → deposited / presented again: the receipt / issue voucher is posted again on that date. */
  async represent(user: SessionUser, meta: RequestMeta, id: string, a: ChequeAction) {
    const c = await this.can(user, id, a.rowVersion, 're-present');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.record(id, a.date);
      await this.store.set(user.tenantId, id, c.direction === 'RECEIVED' ? { status: 'DEPOSITED', depositedOn: new Date(a.date), ...(a.bankAccountId && { bankAccountId: a.bankAccountId }) } : { status: 'PRESENTED', presentedOn: new Date(a.date) });
      await this.store.resolveBounce(user.tenantId, id, 'REPRESENTED', a.date);
    });
    return this.get(user, id);
  }

  /** Issued → stopped: the issue voucher is reversed. */
  async stop(user: SessionUser, meta: RequestMeta, id: string, a: ChequeAction) {
    await this.can(user, id, a.rowVersion, 'stop');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.reverseEntries(id, a.date, a.remarks ?? 'Payment stopped');
      await this.store.set(user.tenantId, id, { status: 'STOPPED', stoppedOn: new Date(a.date) });
    });
    return this.get(user, id);
  }

  /** Cancelled: whatever is still posted for the cheque is reversed on that date. */
  async cancel(user: SessionUser, meta: RequestMeta, id: string, a: ChequeAction) {
    await this.can(user, id, a.rowVersion, 'cancel');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.reverseEntries(id, a.date, a.remarks ?? 'Cheque cancelled');
      await this.store.lifecycle('chequeCancel', id);
    });
    return this.get(user, id);
  }

  /** In hand / bounced / stopped → replaced by a new cheque (recorded and posted); the old one's postings are reversed. */
  async replace(user: SessionUser, meta: RequestMeta, id: string, input: { cheque: ChequeInput; rowVersion: number }) {
    const c = await this.can(user, id, input.rowVersion, 'replace');
    if (input.cheque.direction !== c.direction) throw v({ direction: 'The replacement goes the same way' });
    const data = await this.validate(user, input.cheque, null);
    const newId = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const created = await this.createIn(user, input.cheque, data);
      await this.store.reverseEntries(id, input.cheque.receivedOn ?? input.cheque.docDate, 'Cheque replaced');
      await this.store.set(user.tenantId, id, { status: 'REPLACED', replacedByChequeId: created });
      await this.store.resolveBounce(user.tenantId, id, 'REPLACED', input.cheque.docDate, created);
      return created;
    });
    return this.get(user, newId);
  }

  // ---------------------------------------------------------------- helpers
  /** Party, bank account, cheque book and duplicate checks; returns the save payload. */
  async validate(user: SessionUser, c: ChequeInput, exceptId: string | null): Promise<Record<string, unknown>> {
    const opts = await this.txns.options(user);
    const e: Record<string, string> = {};
    if (c.customerId && !opts.customers.some((x) => x.id === c.customerId)) e.customerId = 'Choose an active customer';
    if (c.vendorId && !opts.vendors.some((x) => x.id === c.vendorId)) e.vendorId = 'Choose an active vendor';
    if (c.accountId && !opts.accounts.some((x) => x.id === c.accountId)) e.accountId = 'Choose an active postable account';
    if (!opts.branches.some((b) => b.id === c.branchId)) e.branchId = 'Choose an active branch';
    if (c.drawnOnBankId && !opts.banks.some((b) => b.id === c.drawnOnBankId)) e.drawnOnBankId = 'Choose a bank';
    const bank = c.bankAccountId ? opts.bankAccounts.find((b) => b.id === c.bankAccountId) : null;
    if (c.bankAccountId && (!bank || bank.status !== 'ACTIVE')) e.bankAccountId = 'Choose an active bank account';
    const roles = c.direction === 'RECEIVED' ? ['CHEQUES_IN_HAND', ...(c.customerId || c.accountId ? [] : ['AR_CONTROL'])] : ['PDC_PAYABLE', ...(c.vendorId || c.accountId ? [] : ['AP_CONTROL'])];
    const missing = roles.filter((r) => !opts.postingRoles[r]);
    if (missing.length) throw new ValidationError(`Set the default account for ${missing.join(', ')} first (Company Settings › Default accounts).`, undefined, { code: 'POSTING_ROLE_UNMAPPED' });
    if (c.direction === 'ISSUED' && bank) {
      if (c.chequeBookId) {
        const book = await this.store.chequeBook(user.tenantId, c.chequeBookId);
        const no = Number(c.chequeNo);
        if (!book || book.bankAccountId !== bank.id) e.chequeBookId = 'Choose a cheque book of this bank account';
        else if (book.status !== 'ACTIVE') e.chequeBookId = 'This cheque book is not active';
        else if (no < book.firstLeafNo || no > book.lastLeafNo) e.chequeNo = `Leaves ${book.firstLeafNo}–${book.lastLeafNo} in this book`;
      }
      if (!e.chequeNo && (await this.store.issuedLeafUsed(user.tenantId, bank.id, c.chequeNo, exceptId))) {
        throw new ConflictError(`Cheque ${c.chequeNo} is already used for this bank account.`, { chequeNo: ['Already used'] }, { code: 'CHEQUE_LEAF_USED' });
      }
    }
    if (c.direction === 'RECEIVED' && (await this.store.receivedDuplicate(user.tenantId, c.drawnOnBankId, c.chequeNo, c.customerId, exceptId))) {
      throw new ConflictError(`Cheque ${c.chequeNo} from this party and bank is already recorded.`, { chequeNo: ['Already recorded'] }, { code: 'CHEQUE_LEAF_USED' });
    }
    if (Object.keys(e).length) throw v(e);
    const isPdc = c.isPdc || c.chequeDate > (c.receivedOn ?? c.docDate);
    return {
      direction: c.direction, docDate: c.docDate, branchId: c.branchId, chequeNo: c.chequeNo, customerId: c.customerId, vendorId: c.vendorId, accountId: c.accountId,
      partyName: c.partyName, drawnOnBankId: c.direction === 'RECEIVED' ? c.drawnOnBankId : null, bankAccountId: c.bankAccountId, chequeDate: c.chequeDate, dueDate: c.dueDate,
      receivedOn: c.direction === 'RECEIVED' ? (c.receivedOn ?? c.docDate) : null, amount: c.amount, currencyCode: 'PKR', isPdc,
      postingMode: c.postingMode === 'HOLD_PDC' && !isPdc ? 'DEPOSIT' : c.postingMode, chequeBookId: c.direction === 'ISSUED' ? c.chequeBookId : null,
      crossedAcPayee: c.crossedAcPayee, legacyNo: c.legacyNo, remarks: c.remarks, narration: c.narration,
    };
  }

  private async advanceBook(user: SessionUser, c: ChequeInput) {
    if (c.direction !== 'ISSUED' || !c.chequeBookId) return;
    const book = await this.store.chequeBook(user.tenantId, c.chequeBookId);
    if (book && Number(c.chequeNo) >= book.nextLeafNo) await this.store.advanceBook(user.tenantId, book.id, Math.min(Number(c.chequeNo) + 1, book.lastLeafNo + 1));
  }

  private async checkBank(user: SessionUser, bankAccountId: string) {
    const opts = await this.txns.options(user);
    const bank = opts.bankAccounts.find((b) => b.id === bankAccountId);
    if (!bank || bank.status !== 'ACTIVE') throw v({ bankAccountId: 'Choose an active bank account' });
    if (!bank.accountId) throw v({ bankAccountId: 'This bank account has no GL account' });
  }

  private async can(user: SessionUser, id: string, rowVersion: number, action: string) {
    const c = await this.current(user, id, rowVersion);
    if (!chequeActions(c.direction, c.status).includes(action)) throw stateErr(c, action);
    return c;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this cheque. Reload and try again.');
    return c;
  }
}
