import { Injectable } from '@nestjs/common';
import {
  bankAccountErrors,
  type Bank,
  type BankAccount,
  type BankAccountCreate,
  type BankAccountUpdate,
  type BankCreate,
  type BankUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../gl-links/application/gl-links.js';
import { BankStore } from './bank-store.js';

const fieldErrors = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));
const stale = (what: string) => new ConcurrencyError(`Someone else changed this ${what}. Reload and try again.`);

/** Banks and the company's bank accounts (each tied to one postable GL account). */
@Injectable()
export class BanksService {
  constructor(
    private readonly store: BankStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // ------------------------------------------------------------ Banks
  banks(user: SessionUser) {
    return this.store.banks(user.tenantId);
  }

  async createBank(user: SessionUser, meta: RequestMeta, input: BankCreate): Promise<Bank> {
    if ((await this.store.retiredBankCodes(user.tenantId)).includes(input.code)) {
      throw new ConflictError(`Code ${input.code} belonged to a deleted bank and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBank({ ...input, isActive: true }));
    return this.bank(user, id);
  }

  async updateBank(user: SessionUser, meta: RequestMeta, id: string, input: BankUpdate): Promise<Bank> {
    const b = await this.currentBank(user, id, input.rowVersion);
    if (input.code && input.code !== b.code && (await this.store.retiredBankCodes(user.tenantId)).includes(input.code)) {
      throw new ConflictError(`Code ${input.code} belonged to a deleted bank and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBank({ ...input, id }));
    return this.bank(user, id);
  }

  async setBankActive(user: SessionUser, meta: RequestMeta, id: string, isActive: boolean, rowVersion: number): Promise<Bank> {
    await this.currentBank(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveBank({ id, rowVersion, isActive }));
    return this.bank(user, id);
  }

  async deleteBank(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.currentBank(user, id, rowVersion);
    if (await this.store.bankInUse(id)) throw new ConflictError('This bank has accounts or cheques. Deactivate it instead.', undefined, { code: 'BANK_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteBank(user.tenantId, id, rowVersion));
  }

  private async bank(user: SessionUser, id: string) {
    const b = (await this.store.banks(user.tenantId)).find((x) => x.id === id);
    if (!b) throw new NotFoundError('Bank not found');
    return b;
  }

  private async currentBank(user: SessionUser, id: string, rowVersion: number) {
    const b = await this.bank(user, id);
    if (b.rowVersion !== rowVersion) throw stale('bank');
    return b;
  }

  // ------------------------------------------------------------ Bank accounts
  accounts(user: SessionUser) {
    return this.store.accounts(user.tenantId);
  }

  async account(user: SessionUser, id: string): Promise<BankAccount> {
    const a = (await this.store.accounts(user.tenantId)).find((x) => x.id === id);
    if (!a) throw new NotFoundError('Bank account not found');
    return a;
  }

  async createAccount(user: SessionUser, meta: RequestMeta, input: BankAccountCreate): Promise<BankAccount> {
    const bank = (await this.store.banks(user.tenantId)).find((b) => b.id === input.bankId && b.isActive);
    if (!bank) throw new ValidationError('Choose an active bank', { bankId: ['Choose an active bank'] });
    await this.checkAccount(user, input, null);
    const { gl, ...fields } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const account = await this.gl.resolve(user, gl, { kind: 'bank', name: `${bank.shortName ?? bank.name} — ${input.accountNo.replace(/\D/g, '').slice(-4)}`, currencyCode: input.currencyCode });
      return this.store.saveAccount({ ...fields, accountId: account.id, status: 'ACTIVE' });
    });
    return this.account(user, id);
  }

  async updateAccount(user: SessionUser, meta: RequestMeta, id: string, input: BankAccountUpdate): Promise<BankAccount> {
    const a = await this.currentAccount(user, id, input.rowVersion);
    await this.checkAccount(user, {
      branchId: input.branchId ?? a.branch.id,
      accountType: input.accountType ?? a.accountType,
      currencyCode: input.currencyCode ?? a.currencyCode,
      creditLimit: input.creditLimit !== undefined ? input.creditLimit : a.creditLimit,
      purpose: input.purpose ?? a.purpose,
    }, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveAccount({ ...input, id }));
    return this.account(user, id);
  }

  /** Active ⇄ Dormant ⇄ Closed (closing needs no active cheque book). */
  async setAccountStatus(user: SessionUser, meta: RequestMeta, id: string, action: 'dormant' | 'activate' | 'close', rowVersion: number, closedOn?: string): Promise<BankAccount> {
    const a = await this.currentAccount(user, id, rowVersion);
    if (action === 'close' && a.activeBook) {
      throw new ConflictError('Cancel or finish the active cheque book before closing this bank account.', undefined, { code: 'BANK_ACCOUNT_HAS_ACTIVE_BOOK' });
    }
    const status = action === 'dormant' ? 'DORMANT' : action === 'close' ? 'CLOSED' : 'ACTIVE';
    const day = action === 'close' ? (closedOn ?? new Date().toISOString().slice(0, 10)) : null;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveAccount({ id, rowVersion, status, closedOn: day }));
    return this.account(user, id);
  }

  async deleteAccount(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.currentAccount(user, id, rowVersion);
    if (await this.store.accountInUse(id)) {
      throw new ConflictError('This bank account has cheque books or transactions. Mark it dormant or close it instead.', undefined, { code: 'BANK_ACCOUNT_IN_USE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteAccount(user.tenantId, id, rowVersion));
  }

  private async checkAccount(user: SessionUser, a: { branchId: string; accountType: string; currencyCode: string; creditLimit: number | null; purpose: string }, selfId: string | null) {
    const errors = bankAccountErrors(a);
    if (Object.keys(errors).length) throw new ValidationError('Check the highlighted fields', fieldErrors(errors));
    if (!(await this.store.activeBranch(user.tenantId, a.branchId))) throw new ValidationError('Choose an active branch', { branchId: ['Unknown or inactive branch'] });
    if (!(await this.store.activeCurrency(a.currencyCode))) throw new ValidationError('Choose an active currency', { currencyCode: ['Unknown or inactive currency'] });
    if (a.purpose === 'PRIMARY' && (await this.store.accounts(user.tenantId)).some((x) => x.purpose === 'PRIMARY' && x.id !== selfId)) {
      throw new ConflictError('Another bank account is already the primary account.', { purpose: ['Another account is primary'] }, { code: 'PRIMARY_BANK_EXISTS' });
    }
  }

  private async currentAccount(user: SessionUser, id: string, rowVersion: number) {
    const a = await this.account(user, id);
    if (a.rowVersion !== rowVersion) throw stale('bank account');
    return a;
  }
}
