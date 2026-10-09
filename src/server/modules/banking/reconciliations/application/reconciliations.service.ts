import { Injectable } from '@nestjs/common';
import { matchScore, type ReconCreate, type ReconDetail, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { BankTransactionsService } from '../../transactions/application/bank-transactions.service.js';
import { reconSummary } from '../domain/recon-summary.js';
import { ReconStore } from './recon-store.js';

const closedErr = () => new ConflictError('This reconciliation is closed. Reopen it to make changes.', undefined, { code: 'RECON_CLOSED' });
const nextDay = (d: string) => new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10);

/**
 * Month-end bank reconciliation: imported statement lines are matched one-to-one with booked bank transactions; what
 * stays open is unpresented cheques / deposits in transit (book side) or unbooked charges and credits (statement side,
 * booked through adjustment vouchers). It closes only at a zero difference and then locks the matched entries.
 */
@Injectable()
export class ReconciliationsService {
  constructor(
    private readonly store: ReconStore,
    private readonly txns: BankTransactionsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, bankAccountId: string | null) {
    return this.store.list(user.tenantId, bankAccountId);
  }

  async get(user: SessionUser, id: string): Promise<ReconDetail> {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Reconciliation not found');
    const [stmt, book, matches] = await Promise.all([
      this.store.statementRows(user.tenantId, r.bankAccount.id, r.periodTo, id),
      this.store.bookRows(user.tenantId, r.bankAccount.id, r.periodTo, id),
      this.store.matches(user.tenantId, id),
    ]);
    const byLine = new Map(matches.filter((m) => m.status === 'MATCHED').map((m) => [m.statementLineId, m]));
    const byTxn = new Map(matches.filter((m) => m.status === 'MATCHED').map((m) => [m.bankTransactionId, m]));
    const openBook = book.filter((b) => !byTxn.has(b.id));
    return {
      ...r,
      statement: stmt.map((s) => {
        const m = byLine.get(s.id);
        const suggestion = m ? null : openBook.map((b) => ({ b, s: matchScore(s, b) })).filter((x) => x.s >= 80).sort((a, b) => b.s - a.s)[0]?.b.id ?? null;
        return { id: s.id, txnDate: s.txnDate, description: s.description, reference: s.reference, amount: s.amount, status: m ? 'MATCHED' : suggestion ? 'SUGGESTED' : 'UNMATCHED', matchId: m?.id ?? null, suggestedTxnId: suggestion };
      }),
      book: book.map((b) => {
        const m = byTxn.get(b.id);
        return { id: b.id, txnDate: b.txnDate, description: b.description, reference: b.reference, amount: b.amount, voucher: b.voucher, status: m ? 'MATCHED' : b.amount < 0 ? 'UNPRESENTED' : 'UNMATCHED', matchId: m?.id ?? null };
      }),
      matches,
    };
  }

  async create(user: SessionUser, meta: RequestMeta, input: ReconCreate): Promise<ReconDetail> {
    const opts = await this.txns.options(user);
    const bank = opts.bankAccounts.find((b) => b.id === input.bankAccountId);
    if (!bank) throw new ValidationError('Choose a bank account', { bankAccountId: ['Choose a bank account'] });
    if (await this.store.openFor(user.tenantId, bank.id)) throw new ConflictError('This bank account already has a reconciliation in progress.', undefined, { code: 'RECON_OPEN_EXISTS' });
    const periodFrom = bank.reconciledTo ? nextDay(bank.reconciledTo) : ((await this.store.firstActivity(user.tenantId, bank.id)) ?? `${input.periodTo.slice(0, 7)}-01`);
    if (input.periodTo < periodFrom) throw new ValidationError(`The period must end on or after ${periodFrom}`, { periodTo: [`On or after ${periodFrom}`] });
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const newId = await this.store.save({
        bankAccountId: bank.id, periodFrom: periodFrom < input.periodTo ? periodFrom : input.periodTo, periodTo: input.periodTo, statementBalance: input.statementBalance,
        bookBalance: 0, unpresentedCheques: 0, depositsInTransit: 0, unbookedCredits: 0, unbookedDebits: 0, status: 'IN_PROGRESS', remarks: input.remarks,
      });
      await this.autoMatchIn(user, newId);
      await this.refresh(user, newId);
      return newId;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: { statementBalance: number; remarks: string | null; rowVersion: number }) {
    const r = await this.editable(user, id, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ id, rowVersion: r.rowVersion, statementBalance: input.statementBalance, remarks: input.remarks });
      await this.refresh(user, id);
    });
    return this.get(user, id);
  }

  async match(user: SessionUser, meta: RequestMeta, id: string, input: { statementLineId: string; bankTransactionId: string; rowVersion: number }) {
    await this.editable(user, id, input.rowVersion);
    const d = await this.get(user, id);
    const s = d.statement.find((x) => x.id === input.statementLineId);
    const b = d.book.find((x) => x.id === input.bankTransactionId);
    if (!s || !b) throw new NotFoundError('Statement line or book entry not in this reconciliation');
    if (s.matchId || b.matchId) throw new ConflictError('Already matched. Unmatch it first.');
    if (Math.round(s.amount * 100) !== Math.round(b.amount * 100)) throw new ValidationError('The statement line and the book entry have different amounts.', undefined, { code: 'RECON_AMOUNT_MISMATCH' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.linkLine(user.tenantId, s.id, b.id);
      await this.store.addMatch(user.tenantId, { reconciliationId: id, statementLineId: s.id, bankTransactionId: b.id, statementAmount: s.amount, bookAmount: b.amount, matchMethod: 'MANUAL', confidence: null, userId: user.id });
      await this.refresh(user, id);
    });
    return this.get(user, id);
  }

  async unmatch(user: SessionUser, meta: RequestMeta, id: string, input: { matchId: string; rowVersion: number }) {
    await this.editable(user, id, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const m = await this.store.removeMatch(user.tenantId, input.matchId);
      if (!m) throw new NotFoundError('Match not found');
      const lines = await this.store.statementRows(user.tenantId, (await this.store.get(user.tenantId, id))!.bankAccount.id, (await this.store.get(user.tenantId, id))!.periodTo, id);
      const line = lines.find((l) => l.id === m.statementLineId);
      // a line booked by its own voucher keeps that link; a line linked to someone else's entry is opened again
      if (line && m.bankTransactionId && !(line.bankTransactionId === m.bankTransactionId && line.status === 'CATEGORISED')) await this.store.unlinkLine(user.tenantId, line.id, m.bankTransactionId);
      await this.refresh(user, id);
    });
    return this.get(user, id);
  }

  async autoMatch(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.editable(user, id, rowVersion);
    const n = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const count = await this.autoMatchIn(user, id);
      await this.refresh(user, id);
      return count;
    });
    return { matched: n, reconciliation: await this.get(user, id) };
  }

  /** Books unbooked statement lines (charges, profit…) as BPV / BRV vouchers; once posted they match automatically. */
  async adjustments(user: SessionUser, meta: RequestMeta, id: string, input: { statementLineIds: string[]; accountId: string | null; rowVersion: number }) {
    await this.editable(user, id, input.rowVersion);
    const d = await this.get(user, id);
    const opts = await this.txns.options(user);
    const lines = await this.store.statementRows(user.tenantId, d.bankAccount.id, d.periodTo, id);
    let booked = 0;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const lid of input.statementLineIds) {
        const l = lines.find((x) => x.id === lid);
        if (!l || l.status !== 'UNMATCHED' || !l.bankTransactionId || l.txnHasVoucher) throw new ConflictError('Only open statement lines that are not in the books can be adjusted.', undefined, { code: 'STATEMENT_LINE_LOCKED' });
        const role = l.amount < 0 ? 'BANK_CHARGES' : 'PROFIT_ON_DEPOSIT';
        const accountId = input.accountId ?? opts.postingRoles[role]?.id;
        if (!accountId) throw new ValidationError('A default account needed for this posting is not set (Company Settings › Default accounts).', undefined, { code: 'POSTING_ROLE_UNMAPPED' });
        const t = await this.txns.get(user, l.bankTransactionId);
        await this.txns.categorise(user, meta, t.id, { accountId, costCentreId: null, category: l.amount < 0 ? 'BANK_CHARGES' : 'PROFIT_ON_DEPOSIT', narration: null, rowVersion: t.rowVersion });
        booked++;
      }
      await this.autoMatchIn(user, id);
      await this.refresh(user, id);
    });
    return { booked, reconciliation: await this.get(user, id) };
  }

  async complete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.editable(user, id, rowVersion);
    // one transaction: a difference rolls the recalculation back too
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.refresh(user, id);
      const d = await this.get(user, id);
      if (Math.round(d.difference * 100) !== 0) {
        throw new ConflictError(`The reconciliation can only be finished at a zero difference (now ${d.difference.toFixed(2)}).`, undefined, { code: 'RECON_NOT_BALANCED' });
      }
      await this.store.close(user.tenantId, id, user.id);
      await this.store.setStatus(user.tenantId, id, 'CLOSED', user.id);
    });
    return this.get(user, id);
  }

  /** Reopens the latest closed reconciliation of the account (the bank account's reconciled-to date steps back). */
  async reopen(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Reconciliation not found');
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this reconciliation. Reload and try again.');
    if (r.status !== 'CLOSED') throw new ConflictError('Only a closed reconciliation can be reopened.');
    const closed = await this.store.closedFor(user.tenantId, r.bankAccount.id);
    if (closed[0]?.id !== id) throw new ConflictError('Only the latest closed reconciliation of this account can be reopened.');
    if (await this.store.openFor(user.tenantId, r.bankAccount.id)) throw new ConflictError('This bank account already has a reconciliation in progress.', undefined, { code: 'RECON_OPEN_EXISTS' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.reopen(user.tenantId, id);
      await this.store.setStatus(user.tenantId, id, 'REOPENED', null);
      await this.store.setReconciledTo(user.tenantId, r.bankAccount.id, closed[1] ?? null);
    });
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  /** Already-linked pairs first (lines matched at import or booked by their own voucher), then best scores ≥ 90, one-to-one. */
  private async autoMatchIn(user: SessionUser, id: string) {
    const d = await this.get(user, id);
    const lines = await this.store.statementRows(user.tenantId, d.bankAccount.id, d.periodTo, id);
    const open = new Set(d.book.filter((b) => !b.matchId).map((b) => b.id));
    let n = 0;
    for (const l of lines) {
      const row = d.statement.find((s) => s.id === l.id)!;
      if (row.matchId || !l.bankTransactionId || !open.has(l.bankTransactionId)) continue;
      const b = d.book.find((x) => x.id === l.bankTransactionId)!;
      if (Math.round(b.amount * 100) !== Math.round(l.amount * 100)) continue;
      await this.store.addMatch(user.tenantId, { reconciliationId: id, statementLineId: l.id, bankTransactionId: b.id, statementAmount: l.amount, bookAmount: b.amount, matchMethod: l.status === 'CATEGORISED' ? 'RULE' : 'AUTO', confidence: 100, userId: user.id });
      open.delete(b.id);
      row.matchId = 'x';
      n++;
    }
    const free = d.statement.filter((s) => !s.matchId && !lines.find((l) => l.id === s.id)?.txnHasVoucher);
    const scored = free.flatMap((s) => d.book.filter((b) => open.has(b.id)).map((b) => ({ s, b, score: matchScore(s, b) }))).filter((x) => x.score >= 90).sort((a, b) => b.score - a.score);
    const usedLines = new Set<string>();
    for (const x of scored) {
      if (usedLines.has(x.s.id) || !open.has(x.b.id)) continue;
      usedLines.add(x.s.id);
      open.delete(x.b.id);
      await this.store.linkLine(user.tenantId, x.s.id, x.b.id);
      await this.store.addMatch(user.tenantId, { reconciliationId: id, statementLineId: x.s.id, bankTransactionId: x.b.id, statementAmount: x.s.amount, bookAmount: x.b.amount, matchMethod: 'AUTO', confidence: x.score, userId: user.id });
      n++;
    }
    return n;
  }

  /** Recomputes the book balance and the open items, and stores them on the reconciliation. */
  private async refresh(user: SessionUser, id: string) {
    const d = await this.get(user, id);
    const book = await this.store.bookBalance(user.tenantId, d.bankAccount.id, d.periodTo);
    const s = reconSummary(d.statementBalance, book, d.statement.map((x) => ({ id: x.id, amount: x.amount, matched: !!x.matchId })), d.book.map((x) => ({ id: x.id, amount: x.amount, matched: !!x.matchId })));
    const fresh = (await this.store.get(user.tenantId, id))!;
    await this.store.save({
      id, rowVersion: fresh.rowVersion, bookBalance: s.bookBalance, unpresentedCheques: s.unpresentedCheques, depositsInTransit: s.depositsInTransit,
      unbookedCredits: s.unbookedCredits, unbookedDebits: s.unbookedDebits,
    });
  }

  private async editable(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.store.get(user.tenantId, id);
    if (!r) throw new NotFoundError('Reconciliation not found');
    if (r.status === 'CLOSED') throw closedErr();
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this reconciliation. Reload and try again.');
    return r;
  }
}
