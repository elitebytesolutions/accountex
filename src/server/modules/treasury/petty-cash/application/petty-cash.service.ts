import { Injectable } from '@nestjs/common';
import { pettyFundErrors, type PettyCashFund, type PettyCashFundCreate, type PettyCashFundUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { CashStore } from '../../cash/application/cash-store.js';
import { GlLinks } from '../../gl-links/application/gl-links.js';
import { PettyFundStore } from './petty-fund-store.js';

const fieldErrors = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));

/**
 * Petty cash funds. A fund drives its petty cash account: created with it (cash account + GL account) or linked to an
 * existing petty / imprest account that has no fund; imprest, custodian and branch are copied onto the account in the
 * same unit of work so the two never disagree.
 */
@Injectable()
export class PettyCashService {
  constructor(
    private readonly store: PettyFundStore,
    private readonly cash: CashStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  custodians(user: SessionUser) {
    return this.store.activeUsers(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: PettyCashFundCreate): Promise<PettyCashFund> {
    await this.checkPeople(user, input.branchId, input.custodianUserId);
    let link: { id: string; rowVersion: number } | null = null;
    if (input.account.mode === 'link') {
      const accountId = input.account.cashAccountId;
      const a = (await this.cash.accounts(user.tenantId)).find((x) => x.id === accountId);
      if (!a || !a.isActive || (a.kind !== 'PETTY' && a.kind !== 'IMPREST')) {
        throw new ValidationError('Choose an active petty cash or imprest account', { account: ['Petty or imprest accounts only'] });
      }
      if (await this.store.accountTaken(user.tenantId, a.id)) {
        throw new ConflictError('This cash account already has a petty cash fund.', { account: ['Already has a fund'] }, { code: 'PETTY_FUND_ACCOUNT_TAKEN' });
      }
      link = { id: a.id, rowVersion: a.rowVersion };
    }
    const sync = { branchId: input.branchId, custodianUserId: input.custodianUserId, imprestAmount: input.imprestAmount };
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      let cashAccountId: string;
      if (link) {
        await this.cash.saveAccount({ id: link.id, rowVersion: link.rowVersion, ...sync });
        cashAccountId = link.id;
      } else {
        const gl = await this.gl.resolve(user, { mode: 'create', parentId: null }, { kind: 'cash', name: input.name, currencyCode: 'PKR' });
        cashAccountId = await this.cash.saveAccount({ name: input.name, kind: 'PETTY', code: gl.code, accountId: gl.id, isActive: true, ...sync });
      }
      const fund = { name: input.name, branchId: input.branchId, custodianUserId: input.custodianUserId, imprestAmount: input.imprestAmount, lowPct: input.lowPct, criticalPct: input.criticalPct };
      return this.store.save({ ...fund, cashAccountId, status: 'HEALTHY', cycleStartedOn: new Date().toISOString().slice(0, 10) });
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: PettyCashFundUpdate): Promise<PettyCashFund> {
    const f = await this.current(user, id, input.rowVersion);
    const errors = pettyFundErrors({ lowPct: input.lowPct ?? f.lowPct, criticalPct: input.criticalPct ?? f.criticalPct });
    if (Object.keys(errors).length) throw new ValidationError('Check the highlighted fields', fieldErrors(errors));
    const branchId = input.branchId ?? f.branch.id, custodianUserId = input.custodianUserId ?? f.custodian?.id ?? null;
    if (input.branchId || input.custodianUserId) await this.checkPeople(user, branchId, custodianUserId);
    const account = (await this.cash.accounts(user.tenantId)).find((a) => a.id === f.cashAccount.id);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ ...input, id });
      if (account && (input.branchId || input.custodianUserId || input.imprestAmount !== undefined)) {
        await this.cash.saveAccount({ id: account.id, rowVersion: account.rowVersion, branchId, custodianUserId, imprestAmount: input.imprestAmount ?? f.imprestAmount });
      }
    });
    return this.get(user, id);
  }

  /** CLOSED stops the fund (its account stays); reopening starts a new cycle. */
  async setClosed(user: SessionUser, meta: RequestMeta, id: string, closed: boolean, rowVersion: number): Promise<PettyCashFund> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.save({ id, rowVersion, status: closed ? 'CLOSED' : 'HEALTHY', ...(!closed && { cycleStartedOn: new Date().toISOString().slice(0, 10) }) }),
    );
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('This fund has vouchers or top-ups. Close it instead.', undefined, { code: 'PETTY_CASH_FUND_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkPeople(user: SessionUser, branchId: string, custodianUserId: string | null) {
    if (!(await this.cash.activeBranch(user.tenantId, branchId))) throw new ValidationError('Choose an active branch', { branchId: ['Unknown or inactive branch'] });
    if (custodianUserId && !(await this.cash.activeUser(user.tenantId, custodianUserId))) {
      throw new ValidationError('The custodian must be an active user', { custodianUserId: ['Unknown or inactive user'] });
    }
  }

  private async get(user: SessionUser, id: string) {
    const f = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!f) throw new NotFoundError('Petty cash fund not found');
    return f;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const f = await this.get(user, id);
    if (f.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this fund. Reload and try again.');
    return f;
  }
}
