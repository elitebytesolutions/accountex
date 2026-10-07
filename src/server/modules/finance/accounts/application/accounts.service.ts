import { Injectable } from '@nestjs/common';
import {
  accountClassOf,
  accountKindOf,
  accountLevel,
  isChildCode,
  type Account,
  type AccountBulkStatus,
  type AccountCreate,
  type AccountTemplate,
  type AccountUpdate,
  type Ledger,
  type LedgerView,
  type LedgerViewSave,
  type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { AccountStore } from './account-store.js';

/** Chart of Accounts: structure fixed after creation (database guard), names and attributes editable. */
@Injectable()
export class AccountsService {
  constructor(
    private readonly store: AccountStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser): Promise<Account[]> {
    return this.store.list(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<Account> {
    const a = await this.store.get(user.tenantId, id);
    if (!a) throw new NotFoundError('Account not found');
    return a;
  }

  retiredCodes(user: SessionUser): Promise<string[]> {
    return this.store.retiredCodes(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: AccountCreate): Promise<Account> {
    const parent = await this.get(user, input.parentId);
    if ((await this.store.retiredCodes(user.tenantId)).includes(input.code)) {
      throw new ConflictError(`Code ${input.code} belonged to a deleted account and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
    if (!isChildCode(input.code, parent.code)) {
      throw new ValidationError(`Code ${input.code} does not belong under ${parent.code}`, { code: [`Use a code in ${parent.code}'s range`] }, { code: 'ACCOUNT_CODE_INVALID' });
    }
    const level = accountLevel(input.code);
    const accountClass = accountClassOf(input.code);
    const kind = accountKindOf(level);
    if (kind === 'POSTABLE') {
      if (!input.subType) throw new ValidationError('Choose a sub-type', { subType: ['Required for postable accounts'] });
      if (!(await this.store.subTypeFits(input.subType, accountClass))) throw new ValidationError('Sub-type does not fit this class', { subType: ['Not valid for this class'] });
    }
    await this.checkBranches(user, input.branchIds, kind);
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.create({ ...input, level, accountClass, kind, subType: kind === 'POSTABLE' ? input.subType : null, branchIds: kind === 'POSTABLE' ? input.branchIds : [] }),
    );
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: AccountUpdate): Promise<Account> {
    const a = await this.current(user, id, input.rowVersion);
    const { rowVersion, branchIds, ...changes } = input;
    if (changes.subType !== undefined) {
      if (a.kind !== 'POSTABLE') changes.subType = null;
      else if (!changes.subType || !(await this.store.subTypeFits(changes.subType, a.accountClass))) {
        throw new ValidationError('Sub-type does not fit this class', { subType: ['Not valid for this class'] });
      }
    }
    if (branchIds) await this.checkBranches(user, branchIds, a.kind);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.update(user.tenantId, id, rowVersion, changes, a.kind === 'POSTABLE' ? branchIds : undefined));
    return this.get(user, id);
  }

  async setStatus(user: SessionUser, meta: RequestMeta, input: AccountBulkStatus): Promise<{ updated: number }> {
    const updated = await this.unitOfWork.run(actorContext(user, meta), () => this.store.setStatus(user.tenantId, input.ids, input.status));
    return { updated };
  }

  /** Soft delete; the database refuses accounts with sub-accounts or postings. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  templates(): Promise<AccountTemplate[]> {
    return this.store.templates();
  }

  /** One transaction: every account and default mapping is attributed to the user applying it. */
  async applyTemplate(user: SessionUser, meta: RequestMeta, templateId: string): Promise<{ created: number }> {
    const created = await this.unitOfWork.run(actorContext(user, meta), () => this.store.applyTemplate(templateId));
    return { created };
  }

  async ledger(user: SessionUser, id: string, from: string, to: string): Promise<Ledger> {
    if (to < from) throw new ValidationError('The end date is before the start date', { to: ['End after start'] });
    return this.store.ledger(user.tenantId, await this.get(user, id), from, to);
  }

  ledgerViews(user: SessionUser): Promise<LedgerView[]> {
    return this.store.ledgerViews(user.tenantId, user.id);
  }

  async saveLedgerView(user: SessionUser, meta: RequestMeta, input: LedgerViewSave, id?: string, rowVersion?: number): Promise<LedgerView> {
    if (id) await this.ownView(user, id, rowVersion);
    const savedId = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.saveLedgerView(id ? { ...input, id, rowVersion } : { ...input, userId: user.id }),
    );
    return (await this.store.ledgerView(user.tenantId, savedId, user.id))!;
  }

  async deleteLedgerView(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.ownView(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteLedgerView(user.tenantId, id));
  }

  /** Shared views can be opened by everyone but changed only by their owner. */
  private async ownView(user: SessionUser, id: string, rowVersion?: number) {
    const v = await this.store.ledgerView(user.tenantId, id, user.id);
    if (!v) throw new NotFoundError('Saved view not found');
    if (!v.isMine) throw new ForbiddenError('Only the owner can change a saved view');
    if (rowVersion !== undefined && v.rowVersion !== rowVersion) throw new ConcurrencyError('This view changed. Reload and try again.');
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const a = await this.get(user, id);
    if (a.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this account. Reload and try again.');
    return a;
  }

  private async checkBranches(user: SessionUser, ids: string[], kind: string) {
    if (!ids.length) return;
    if (kind !== 'POSTABLE') throw new ValidationError('Only postable accounts can be limited to branches', { branchIds: ['Postable accounts only'] });
    if ((await this.store.activeBranchIds(user.tenantId, ids)).length !== new Set(ids).size) {
      throw new ValidationError('Choose active branches', { branchIds: ['Unknown or inactive branch'] });
    }
  }
}
