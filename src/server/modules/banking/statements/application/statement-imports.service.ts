import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { matchScore, ruleMatches, type ImportResult, type SessionUser, type StatementImportInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { BankTransactionsService } from '../../transactions/application/bank-transactions.service.js';
import { StatementStore } from './statement-store.js';

const shift = (d: string, days: number) => new Date(Date.parse(d) + days * 86_400_000).toISOString().slice(0, 10);
const locked = () => new ConflictError('This statement line is already categorised, matched or reconciled.', undefined, { code: 'STATEMENT_LINE_LOCKED' });
const CHANNELS: [RegExp, string][] = [[/raast/i, 'RAAST'], [/ibft|ift|1link|funds? transfer/i, 'IBFT'], [/cheque|chq|clearing/i, 'CHEQUE'], [/fed|excise|wht|with.?holding|tax/i, 'TAX'], [/charge|fee|commission|sms/i, 'CHARGES'], [/cash/i, 'CASH'], [/card|pos|atm/i, 'CARD']];

/** Same line → same hash; a repeated identical line in one file gets its occurrence number, so re-importing the file skips all of it. */
function hashes(lines: StatementImportInput['lines']) {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = [l.txnDate, l.amount.toFixed(2), (l.reference ?? '').trim().toLowerCase(), l.description.replace(/\s+/g, ' ').trim().toLowerCase()].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash('sha256').update(`${base}#${n}`).digest('hex');
  });
}

/**
 * Bank statements: CSV lines (parsed and mapped in the browser with the bank account's saved layout) are de-duplicated,
 * matched to posted vouchers already in the bank book, and the rest become uncategorised bank transactions for bank
 * rules or the user to categorise.
 */
@Injectable()
export class StatementImportsService {
  constructor(
    private readonly store: StatementStore,
    private readonly txns: BankTransactionsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, bankAccountId: string | null) {
    return this.store.list(user.tenantId, bankAccountId);
  }

  async get(user: SessionUser, id: string) {
    const i = await this.store.get(user.tenantId, id);
    if (!i) throw new NotFoundError('Statement import not found');
    return i;
  }

  async import(user: SessionUser, meta: RequestMeta, input: StatementImportInput): Promise<ImportResult> {
    const opts = await this.txns.options(user);
    const bank = opts.bankAccounts.find((b) => b.id === input.bankAccountId);
    if (!bank) throw new ValidationError('Choose a bank account', { bankAccountId: ['Choose a bank account'] });
    if (!bank.accountId) throw new ValidationError('This bank account has no GL account.');
    const h = hashes(input.lines);
    const all = input.lines.map((l, i) => ({ ...l, hash: h[i]! }));
    const existing = await this.store.existingHashes(user.tenantId, bank.id, all.map((l) => l.hash));
    const fresh = all.filter((l) => !existing.has(l.hash));
    if (!fresh.length) throw new ValidationError('Every line of this file was imported before.', undefined, { code: 'STATEMENT_EMPTY' });
    const dates = fresh.map((l) => l.txnDate).sort();
    const first = fresh[0]!, last = fresh[fresh.length - 1]!;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const importId = await this.store.save({
        bankAccountId: bank.id, fileName: input.fileName, format: 'BANK_CSV', layout: 'CSV column mapping', periodFrom: dates[0], periodTo: dates[dates.length - 1],
        openingBalance: first.runningBalance !== null ? Math.round((first.runningBalance - first.amount) * 100) / 100 : null, closingBalance: last.runningBalance,
        lineCount: fresh.length, duplicateCount: all.length - fresh.length, matchedCount: 0, status: 'PARSED', importedAt: new Date().toISOString(), importedByUserId: user.id,
        lines: fresh.map((l, i) => ({
          lineNo: i + 1, bankAccountId: bank.id, txnDate: l.txnDate, valueDate: l.valueDate, description: l.description, reference: l.reference, amount: l.amount,
          runningBalance: l.runningBalance, channel: CHANNELS.find(([re]) => re.test(`${l.description} ${l.reference ?? ''}`))?.[1] ?? 'OTHER', dedupeHash: l.hash, status: 'UNMATCHED',
        })),
      });
      // lines already in the books (a cleared cheque, a posted BPV): matched one-to-one, best score first
      const saved = (await this.store.get(user.tenantId, importId))!.lines!;
      const book = await this.store.unmatchedBook(user.tenantId, bank.id, shift(dates[0]!, -7), shift(dates[dates.length - 1]!, 7));
      const used = new Set<string>();
      const pairs: { lineId: string; txnId: string; confidence: number }[] = [];
      const scored = saved.flatMap((l) => book.map((b) => ({ l, b, s: matchScore(l, b) }))).filter((x) => x.s >= 80).sort((a, b) => b.s - a.s);
      for (const x of scored) {
        if (used.has(x.l.id) || used.has(x.b.id)) continue;
        used.add(x.l.id).add(x.b.id);
        pairs.push({ lineId: x.l.id, txnId: x.b.id, confidence: x.s });
      }
      await this.store.link(user.tenantId, pairs);
      await this.store.createUncategorised(user.tenantId, importId);
      await this.store.saveLayout(user.tenantId, bank.id, input.layout);
      await this.store.updateCounts(user.tenantId, importId);
      return importId;
    });
    return { import: await this.get(user, id), imported: fresh.length, duplicates: all.length - fresh.length };
  }

  /** Runs the enabled bank rules (by priority, first match wins) over the import's open lines. Auto-post rules raise the voucher. */
  async applyRules(user: SessionUser, meta: RequestMeta, id: string) {
    const imp = await this.get(user, id);
    const rules = await this.store.rules(user.tenantId, imp.bankAccount.id);
    const hits = new Map<string, number>();
    let categorised = 0, suggested = 0, failed = 0;
    for (const l of imp.lines!) {
      if (l.status !== 'UNMATCHED' || !l.bankTransactionId || l.voucher) continue;
      const rule = rules.find((r) => ruleMatches(r, { description: l.description, reference: l.reference ?? '', amount: l.amount }));
      if (!rule) continue;
      hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1);
      if (rule.autoPost) {
        try {
          const t = await this.txns.get(user, l.bankTransactionId);
          await this.txns.categorise(user, meta, t.id, { accountId: rule.accountId, costCentreId: rule.costCentreId, category: null, narration: null, rowVersion: t.rowVersion }, rule.id);
          categorised++;
        } catch {
          failed++;
        }
      } else {
        await this.unitOfWork.run(actorContext(user, meta), () => this.store.suggest(user.tenantId, l.id, { categoryAccountId: rule.accountId, costCentreId: rule.costCentreId, bankRuleId: rule.id }));
        suggested++;
      }
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.ruleHits(user.tenantId, hits);
      await this.store.updateCounts(user.tenantId, id);
    });
    const after = await this.get(user, id);
    return { import: after, categorised, suggested, failed, left: after.lines!.filter((l) => l.status === 'UNMATCHED' && !l.voucher).length };
  }

  async categoriseLine(user: SessionUser, meta: RequestMeta, lineId: string, input: { accountId: string; costCentreId: string | null; category: string | null; narration: string | null; rowVersion: number }) {
    const l = await this.line(user, lineId, input.rowVersion);
    if (l.status !== 'UNMATCHED' || !l.bankTransactionId) throw locked();
    const t = await this.txns.get(user, l.bankTransactionId);
    await this.txns.categorise(user, meta, t.id, { ...input, category: input.category as never, rowVersion: t.rowVersion }, l.bankRule?.id ?? null);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.updateCounts(user.tenantId, l.statementImportId));
    return this.store.line(user.tenantId, lineId);
  }

  async ignore(user: SessionUser, meta: RequestMeta, lineId: string, rowVersion: number) {
    const l = await this.line(user, lineId, rowVersion);
    if (l.status !== 'UNMATCHED' || l.voucher) throw locked();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.ignore(user.tenantId, lineId));
    return this.store.line(user.tenantId, lineId);
  }

  async restore(user: SessionUser, meta: RequestMeta, lineId: string, rowVersion: number) {
    const l = await this.line(user, lineId, rowVersion);
    if (l.status !== 'IGNORED') throw new ConflictError('Only an ignored line can be restored.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.restore(user.tenantId, lineId));
    return this.store.line(user.tenantId, lineId);
  }

  /** Only an import none of whose lines were categorised or matched can be removed. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const imp = await this.get(user, id);
    if (imp.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this import. Reload and try again.');
    if (imp.lines!.some((l) => l.status === 'MATCHED' || l.status === 'CATEGORISED' || l.voucher)) {
      throw new ConflictError('Lines of this statement are already categorised or matched; ignore the rest instead.', undefined, { code: 'STATEMENT_LINE_LOCKED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteImport(user.tenantId, id));
  }

  private async line(user: SessionUser, id: string, rowVersion: number) {
    const l = await this.store.line(user.tenantId, id);
    if (!l) throw new NotFoundError('Statement line not found');
    if (l.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this line. Reload and try again.');
    return l;
  }
}
