import { Injectable } from '@nestjs/common';
import {
  cashAccountErrors,
  expenseCategoryErrors,
  type CashAccount,
  type CashAccountCreate,
  type CashAccountUpdate,
  type CashCategory,
  type CashCategoryCreate,
  type CashCategoryUpdate,
  type ExpenseCategory,
  type ExpenseCategoryCreate,
  type ExpenseCategoryUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../gl-links/application/gl-links.js';
import { CashStore, type CashTable } from './cash-store.js';

const fieldErrors = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));
const NAMES: Record<CashTable, string> = { cashAccounts: 'cash account', cashCategories: 'cash category', expenseCategories: 'expense category' };
const IN_USE: Record<CashTable, [string, string]> = {
  cashAccounts: ['CASH_ACCOUNT_IN_USE', 'This cash account has entries. Deactivate it instead.'],
  cashCategories: ['CASH_CATEGORY_IN_USE', 'This category is used by cash book entries, or is a system category. Deactivate it instead.'],
  expenseCategories: ['EXPENSE_CATEGORY_IN_USE', 'This category is used by claims or petty cash vouchers. Deactivate it instead.'],
};

/** Cash Setup: cash accounts (drawers, counters, petty cash, imprest), cash categories and expense categories. */
@Injectable()
export class CashService {
  constructor(
    private readonly store: CashStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // ------------------------------------------------------------ Cash accounts
  accounts(user: SessionUser) {
    return this.store.accounts(user.tenantId);
  }

  async createAccount(user: SessionUser, meta: RequestMeta, input: CashAccountCreate): Promise<CashAccount> {
    await this.checkAccount(user, input);
    const { gl, ...fields } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const account = await this.gl.resolve(user, gl, { kind: 'cash', name: input.name, currencyCode: 'PKR' });
      if ((await this.store.retiredCodes(user.tenantId, 'cashAccounts')).includes(account.code)) {
        throw new ConflictError(`Code ${account.code} belonged to a deleted cash account and can't be reused.`, { gl: ['Choose another GL account'] }, { code: 'CODE_RETIRED' });
      }
      // The cash account's code is its GL account's code.
      return this.store.saveAccount({ ...fields, code: account.code, accountId: account.id, isActive: true });
    });
    return this.one(await this.store.accounts(user.tenantId), id, 'cashAccounts');
  }

  async updateAccount(user: SessionUser, meta: RequestMeta, id: string, input: CashAccountUpdate): Promise<CashAccount> {
    const a = this.current(await this.store.accounts(user.tenantId), id, input.rowVersion, 'cashAccounts');
    if ((input.imprestAmount !== undefined || input.custodianUserId !== undefined || input.branchId !== undefined || input.kind !== undefined) && (await this.store.hasFund(user.tenantId, id))) {
      throw new ValidationError('This account belongs to a petty cash fund: change its imprest, custodian and branch on the fund', { imprestAmount: ['Managed by the petty cash fund'] });
    }
    await this.checkAccount(user, {
      kind: input.kind ?? a.kind,
      imprestAmount: input.imprestAmount !== undefined ? input.imprestAmount : a.imprestAmount,
      branchId: input.branchId ?? a.branch.id,
      custodianUserId: input.custodianUserId !== undefined ? input.custodianUserId : (a.custodian?.id ?? null),
    });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveAccount({ ...input, id }));
    return this.one(await this.store.accounts(user.tenantId), id, 'cashAccounts');
  }

  private async checkAccount(user: SessionUser, a: { kind: string; imprestAmount: number | null; branchId: string; custodianUserId: string | null }) {
    const errors = cashAccountErrors(a);
    if (Object.keys(errors).length) throw new ValidationError('Check the highlighted fields', fieldErrors(errors));
    if (!(await this.store.activeBranch(user.tenantId, a.branchId))) throw new ValidationError('Choose an active branch', { branchId: ['Unknown or inactive branch'] });
    if (a.custodianUserId && !(await this.store.activeUser(user.tenantId, a.custodianUserId))) {
      throw new ValidationError('Choose an active user as custodian', { custodianUserId: ['Unknown or inactive user'] });
    }
  }

  // ------------------------------------------------------------ Cash categories
  categories(user: SessionUser) {
    return this.store.categories(user.tenantId);
  }

  async createCategory(user: SessionUser, meta: RequestMeta, input: CashCategoryCreate): Promise<CashCategory> {
    await this.checkRetired(user, 'cashCategories', input.code);
    if (input.defaultAccountId) await this.gl.postable(user, input.defaultAccountId, 'defaultAccountId');
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCategory({ ...input, isActive: true }));
    return this.one(await this.store.categories(user.tenantId), id, 'cashCategories');
  }

  async updateCategory(user: SessionUser, meta: RequestMeta, id: string, input: CashCategoryUpdate): Promise<CashCategory> {
    const c = this.current(await this.store.categories(user.tenantId), id, input.rowVersion, 'cashCategories');
    if (c.isSystem && input.code && input.code !== c.code) throw new ValidationError('System categories keep their code', { code: ['System category'] });
    if (input.code && input.code !== c.code) await this.checkRetired(user, 'cashCategories', input.code);
    if (input.defaultAccountId) await this.gl.postable(user, input.defaultAccountId, 'defaultAccountId');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCategory({ ...input, id }));
    return this.one(await this.store.categories(user.tenantId), id, 'cashCategories');
  }

  // ------------------------------------------------------------ Expense categories
  expenseCategories(user: SessionUser) {
    return this.store.expenseCategories(user.tenantId);
  }

  async createExpenseCategory(user: SessionUser, meta: RequestMeta, input: ExpenseCategoryCreate): Promise<ExpenseCategory> {
    await this.checkRetired(user, 'expenseCategories', input.code);
    await this.gl.postable(user, input.accountId, 'accountId', [5]);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveExpenseCategory({ ...input, isActive: true }));
    return this.one(await this.store.expenseCategories(user.tenantId), id, 'expenseCategories');
  }

  async updateExpenseCategory(user: SessionUser, meta: RequestMeta, id: string, input: ExpenseCategoryUpdate): Promise<ExpenseCategory> {
    const c = this.current(await this.store.expenseCategories(user.tenantId), id, input.rowVersion, 'expenseCategories');
    if (input.code && input.code !== c.code) await this.checkRetired(user, 'expenseCategories', input.code);
    const errors = expenseCategoryErrors({
      limitAmount: input.limitAmount !== undefined ? input.limitAmount : c.limitAmount,
      limitPeriod: input.limitPeriod !== undefined ? input.limitPeriod : c.limitPeriod,
    });
    if (Object.keys(errors).length) throw new ValidationError('Check the highlighted fields', fieldErrors(errors));
    if (input.accountId) await this.gl.postable(user, input.accountId, 'accountId', [5]);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveExpenseCategory({ ...input, id }));
    return this.one(await this.store.expenseCategories(user.tenantId), id, 'expenseCategories');
  }

  // ------------------------------------------------------------ Shared: activate / deactivate / delete
  async setActive(user: SessionUser, meta: RequestMeta, table: CashTable, id: string, isActive: boolean, rowVersion: number) {
    this.current(await this.rows(user, table), id, rowVersion, table);
    await this.unitOfWork.run(actorContext(user, meta), () => this.save(table, { id, rowVersion, isActive }));
    return this.one(await this.rows(user, table), id, table);
  }

  async delete(user: SessionUser, meta: RequestMeta, table: CashTable, id: string, rowVersion: number): Promise<void> {
    const row = this.current(await this.rows(user, table), id, rowVersion, table);
    if (('isSystem' in row && row.isSystem) || (await this.store.inUse(table, id))) {
      const [code, message] = IN_USE[table];
      throw new ConflictError(message, undefined, { code });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, table, id, rowVersion));
  }

  private rows(user: SessionUser, table: CashTable): Promise<(CashAccount | CashCategory | ExpenseCategory)[]> {
    if (table === 'cashAccounts') return this.store.accounts(user.tenantId);
    if (table === 'cashCategories') return this.store.categories(user.tenantId);
    return this.store.expenseCategories(user.tenantId);
  }

  private save(table: CashTable, data: Record<string, unknown>) {
    if (table === 'cashAccounts') return this.store.saveAccount(data);
    if (table === 'cashCategories') return this.store.saveCategory(data);
    return this.store.saveExpenseCategory(data);
  }

  private async checkRetired(user: SessionUser, table: CashTable, code: string) {
    if ((await this.store.retiredCodes(user.tenantId, table)).includes(code)) {
      throw new ConflictError(`Code ${code} belonged to a deleted ${NAMES[table]} and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
  }

  private one<T extends { id: string }>(rows: T[], id: string, table: CashTable): T {
    const r = rows.find((x) => x.id === id);
    if (!r) throw new NotFoundError(`${NAMES[table][0]!.toUpperCase()}${NAMES[table].slice(1)} not found`);
    return r;
  }

  private current<T extends { id: string; rowVersion: number }>(rows: T[], id: string, rowVersion: number, table: CashTable): T {
    const r = this.one(rows, id, table);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError(`Someone else changed this ${NAMES[table]}. Reload and try again.`);
    return r;
  }
}
