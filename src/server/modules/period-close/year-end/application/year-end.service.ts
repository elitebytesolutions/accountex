import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PeriodCloseStore } from '../../common/application/period-close-store.js';

/**
 * Year-end close wizard: the checklist (blockers: open periods, draft / pending vouchers, unposted adjustments;
 * warnings: drafts in sales, purchases, POS, distribution), adjustments posted as JVs on the year's last day, the
 * closing-entries preview, a dry run (figures stored, nothing posted) and the final close (close:approve): the
 * database posts the closing JE — income and expenses into retained earnings — and locks every period. Cancelling
 * a final close reverses it and leaves the periods closed.
 */
@Injectable()
export class YearEndService {
  constructor(
    private readonly store: PeriodCloseStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async get(user: SessionUser, fiscalYearId: string) {
    if (!(await this.store.year(user.tenantId, fiscalYearId))) throw new NotFoundError('Fiscal year not found');
    return this.store.yearEnd(user.tenantId, fiscalYearId, await this.store.checklist(user.tenantId, fiscalYearId));
  }

  async addAdjustment(user: SessionUser, meta: RequestMeta, fiscalYearId: string, p: { description: string; debitAccountId: string; creditAccountId: string; amount: number }) {
    const y = await this.open(user, fiscalYearId);
    if (!(await this.store.accountsExist(user.tenantId, [p.debitAccountId, p.creditAccountId]))) throw new ValidationError('Choose postable accounts', { debitAccountId: ['Choose postable accounts'] });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const draft = await this.draft(user, y.id, y.endDate);
      await this.store.addAdjustment(user.tenantId, draft, { description: p.description, debitAccountId: p.debitAccountId, creditAccountId: p.creditAccountId, amount: Number(p.amount) });
    });
    return this.get(user, fiscalYearId);
  }

  /** Posts a proposed adjustment as a JV dated the year's last day (that period must be open). */
  async postAdjustment(user: SessionUser, meta: RequestMeta, fiscalYearId: string, id: string) {
    const y = await this.open(user, fiscalYearId);
    const a = await this.store.adjustment(user.tenantId, id);
    if (!a) throw new NotFoundError('Adjustment not found');
    if (a.status === 'POSTED') throw new ConflictError('This adjustment is already posted.', undefined, { code: 'YEAR_END_NOT_DRAFT' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const je = await this.store.journal(
        { voucherType: 'SYSTEM', docDate: y.endDate, postingDate: y.endDate, narration: `Year-end adjustment ${y.code}: ${a.description}`, sourceDocType: 'YE', sourceDocId: a.yearEndCloseId, sourceDocNo: `YE ${y.code}` },
        [{ accountId: a.debitAccountId, debit: a.amount, particulars: a.description }, { accountId: a.creditAccountId, credit: a.amount, particulars: a.description }],
      );
      await this.store.setAdjustment(user.tenantId, id, { status: 'POSTED', journalEntryId: je });
    });
    return this.get(user, fiscalYearId);
  }

  async removeAdjustment(user: SessionUser, meta: RequestMeta, fiscalYearId: string, id: string) {
    await this.open(user, fiscalYearId);
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteAdjustment(user.tenantId, id)))) {
      throw new ConflictError('A posted adjustment can’t be removed; reverse its voucher instead.', undefined, { code: 'YEAR_END_NOT_DRAFT' });
    }
    return this.get(user, fiscalYearId);
  }

  /** Dry run: the checklist and figures are stored (DRY_RUN, COMPLETED); nothing posts. */
  async dryRun(user: SessionUser, meta: RequestMeta, fiscalYearId: string) {
    const y = await this.open(user, fiscalYearId);
    const ye = await this.get(user, fiscalYearId);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('yearEndCloseAddUpdate', {
      ...this.run(ye, y.endDate, user.id), runMode: 'DRY_RUN', status: 'COMPLETED', runAt: new Date().toISOString(),
    }));
    return this.get(user, fiscalYearId);
  }

  /** Final close: no blockers (warnings acknowledged); posts the closing JE, locks the periods, closes the year. */
  async close(user: SessionUser, meta: RequestMeta, fiscalYearId: string, acknowledgeWarnings: boolean) {
    const y = await this.open(user, fiscalYearId);
    const ye = await this.get(user, fiscalYearId);
    const blockers = ye.checklist.filter((c) => c.state === 'block');
    if (blockers.length) throw new ConflictError(`Fix before closing: ${blockers.map((b) => b.detail).join('; ')}`, undefined, { code: 'YEAR_END_PERIODS_OPEN' });
    const warnings = ye.checklist.filter((c) => c.state === 'warn');
    if (warnings.length && !acknowledgeWarnings) throw new ValidationError(`Acknowledge the warnings first: ${warnings.map((w) => w.detail).join('; ')}`, { acknowledgeWarnings: ['Acknowledge the warnings'] });
    if (!ye.figures.retainedEarningsAccount) throw new ConflictError('Map the RETAINED_EARNINGS default account first (Company Settings › Default accounts).', undefined, { code: 'POSTING_ROLE_UNMAPPED' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = await this.draft(user, y.id, y.endDate);
      await this.store.save('yearEndCloseAddUpdate', { id, ...this.run(ye, y.endDate, user.id), warningsAcknowledged: warnings.length });
      await this.store.run('yearEndClosePost', id);
    });
    return this.get(user, fiscalYearId);
  }

  async cancel(user: SessionUser, meta: RequestMeta, runId: string, rowVersion: number, reason: string) {
    const r = await this.store.runOf(user.tenantId, runId);
    if (!r) throw new NotFoundError('Year-end run not found');
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('This run was changed. Reload and try again.');
    if (r.status === 'CANCELLED') throw new ConflictError('This run is already cancelled.', undefined, { code: 'YEAR_END_NOT_DRAFT' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('yearEndCloseCancel', runId, reason));
    return this.get(user, r.fiscalYearId);
  }

  private run(ye: Awaited<ReturnType<YearEndService['get']>>, asAt: string, userId: string) {
    return {
      fiscalYearId: ye.fiscalYear.id, asAtDate: asAt, checksTotal: ye.checklist.length, checksPassed: ye.checklist.filter((c) => c.state === 'ok').length,
      checksWarning: ye.checklist.filter((c) => c.state === 'warn').length, checklist: ye.checklist, retainedEarningsAccountId: ye.figures.retainedEarningsAccount?.id ?? null,
      retainedOpening: ye.figures.retainedOpening, netProfit: ye.figures.netProfit, retainedClosing: ye.figures.retainedClosing, runByUserId: userId,
    };
  }

  /** The year's DRAFT final-close record (holds the adjustments), created on first use. */
  private async draft(user: SessionUser, fiscalYearId: string, endDate: string) {
    const d = await this.store.draftFinal(user.tenantId, fiscalYearId);
    if (d) return d.id;
    const ye = await this.store.yearEnd(user.tenantId, fiscalYearId, []);
    if (!ye.figures.retainedEarningsAccount) throw new ConflictError('Map the RETAINED_EARNINGS default account first (Company Settings › Default accounts).', undefined, { code: 'POSTING_ROLE_UNMAPPED' });
    return this.store.save('yearEndCloseAddUpdate', {
      fiscalYearId, runMode: 'FINAL', asAtDate: endDate, status: 'DRAFT', checksTotal: 0, checksPassed: 0, checksWarning: 0, checklist: [], retainedEarningsAccountId: ye.figures.retainedEarningsAccount.id,
    });
  }

  private async open(user: SessionUser, fiscalYearId: string) {
    const y = await this.store.year(user.tenantId, fiscalYearId);
    if (!y) throw new NotFoundError('Fiscal year not found');
    if (y.status === 'CLOSED') throw new ConflictError(`Fiscal year ${y.code} is already closed.`, undefined, { code: 'YEAR_END_ALREADY_CLOSED' });
    return y;
  }
}
