import { Injectable } from '@nestjs/common';
import type { OpeningBatch, OpeningInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { VoucherStore } from '../../vouchers/application/voucher-store.js';
import { OpeningStore } from './opening-store.js';

const posted = () => new ConflictError('Opening balances for this year are already posted. Correct them with a journal voucher.', undefined, { code: 'OPENING_BALANCE_POSTED' });
const changed = () => new ConcurrencyError('Someone else changed these opening balances. Reload and try again.');

/** Opening balances: one batch per fiscal year, entered as a trial balance and posted as one OB voucher. */
@Injectable()
export class OpeningBalancesService {
  constructor(
    private readonly store: OpeningStore,
    private readonly vouchers: VoucherStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async get(user: SessionUser, fiscalYearId: string): Promise<OpeningBatch> {
    const b = await this.store.forYear(user.tenantId, fiscalYearId);
    if (!b) throw new NotFoundError('Fiscal year not found');
    return b;
  }

  async save(user: SessionUser, meta: RequestMeta, input: OpeningInput): Promise<OpeningBatch> {
    const cur = await this.get(user, input.fiscalYearId);
    if (cur.status !== 'DRAFT') throw posted();
    if (cur.id && cur.rowVersion !== input.rowVersion) throw changed();
    const opts = await this.vouchers.options(user.tenantId);
    const postable = new Set(opts.accounts.map((a) => a.id));
    const e: Record<string, string[]> = {};
    const seen = new Set<string>();
    input.lines.forEach((l, i) => {
      if (!postable.has(l.accountId)) e[`lines.${i}.accountId`] = ['Choose an active postable account'];
      else if (seen.has(l.accountId)) e[`lines.${i}.accountId`] = ['This account is already listed'];
      if (l.debit > 0 && l.credit > 0) e[`lines.${i}.debit`] = ['Enter a debit or a credit, not both'];
      seen.add(l.accountId);
    });
    if (input.suspenseAccountId && !postable.has(input.suspenseAccountId)) e.suspenseAccountId = ['Choose an active postable account'];
    if (!opts.branches.some((b) => b.id === input.branchId)) e.branchId = ['Choose an active branch'];
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]![0]!, e);
    const known = new Set(cur.lines.map((l) => l.id));
    const lines = input.lines.filter((l) => l.debit > 0 || l.credit > 0);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      ...(cur.id && { id: cur.id, rowVersion: input.rowVersion }),
      fiscalYearId: input.fiscalYearId, asAtDate: cur.asAtDate, branchId: input.branchId, suspenseAccountId: input.suspenseAccountId, remarks: input.remarks,
      lines: lines.map((l) => ({ ...(l.id && known.has(l.id) && { id: l.id }), accountId: l.accountId, debit: l.debit, credit: l.credit, remarks: l.remarks })),
    }));
    return (await this.store.get(user.tenantId, id))!;
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<OpeningBatch> {
    const b = await this.store.get(user.tenantId, id);
    if (!b) throw new NotFoundError('Opening balances not found');
    if (b.status !== 'DRAFT') throw posted();
    if (b.rowVersion !== rowVersion) throw changed();
    if (!b.lines.length) throw new ValidationError('Enter at least one opening balance.');
    if (Math.round(b.difference * 100) !== 0 && !b.suspenseAccount) {
      throw new ValidationError(`Out of balance by ${Math.abs(b.difference).toFixed(2)}. Choose a suspense account for the difference.`, { suspenseAccountId: ['Required while out of balance'] });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.post(id));
    return (await this.store.get(user.tenantId, id))!;
  }
}
