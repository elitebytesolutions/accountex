import { Injectable } from '@nestjs/common';
import type { CashBook, CashEntryInput, CashLedger, CashLedgerDay, ChequeInput, SessionUser, VoucherInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ChequesService } from '../../../banking/cheques/application/cheques.service.js';
import { VouchersService } from '../../../ledger/vouchers/application/vouchers.service.js';
import { CashBookStore } from './cash-book-store.js';

const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const locked = (d: string) => new ConflictError(`The cash day ${d} is closed. Reopen it before posting to it.`, undefined, { code: 'CASH_DAY_LOCKED' });
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cash Book quick entry: each cash, bank or transfer entry is a voucher (CRV / CPV / BRV / BPV / CON, posted or sent for
 * approval like any voucher) plus a Cash Book row; cheque mode records a Phase 17 cheque. The Cash Ledger reads the
 * cash account's GL lines, grouped by day with the day-close status.
 */
@Injectable()
export class CashBookService {
  constructor(
    private readonly store: CashBookStore,
    private readonly vouchers: VouchersService,
    private readonly cheques: ChequesService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  async book(user: SessionUser, q: { account?: string; from: string; to: string }): Promise<CashBook> {
    const o = await this.store.options(user.tenantId);
    const entries = await this.store.entries(user.tenantId, { cashAccountId: q.account, from: q.from, to: q.to });
    const cashIn = entries.filter((e) => e.kind.endsWith('_IN')).reduce((s, e) => s + e.amount, 0);
    const cashOut = entries.filter((e) => e.kind.endsWith('_OUT')).reduce((s, e) => s + e.amount, 0);
    const byCat = new Map<string, { name: string; amount: number; direction: string }>();
    for (const e of entries) if (e.category) {
      const k = byCat.get(e.category.id) ?? { name: e.category.name, amount: 0, direction: e.kind.endsWith('_IN') ? 'IN' : 'OUT' };
      k.amount += e.amount;
      byCat.set(e.category.id, k);
    }
    const drawers = o.cashAccounts.filter((c) => c.kind !== 'PETTY' && c.kind !== 'IMPREST');
    const main = drawers.sort((a, b) => b.balance - a.balance)[0] ?? null;
    const petty = o.pettyFunds.reduce((s, f) => s + f.cashOnHand, 0);
    return {
      kpis: {
        liquid: r2(o.cashAccounts.reduce((s, c) => s + c.balance, 0) + o.bankAccounts.reduce((s, b) => s + b.balance, 0)),
        mainDrawer: main ? { name: main.name, balance: main.balance } : null, bank: r2(o.bankAccounts.reduce((s, b) => s + b.balance, 0)), bankCount: o.bankAccounts.length,
        petty: r2(petty), pettyImprest: r2(o.pettyFunds.reduce((s, f) => s + f.imprestAmount, 0)),
      },
      entries,
      glance: { cashIn: r2(cashIn), cashOut: r2(cashOut), topCategories: [...byCat.values()].sort((a, b) => b.amount - a.amount).slice(0, 6) },
    };
  }

  /** Records an entry: its voucher (posted, or submitted when a workflow routes it) and the Cash Book row. */
  async create(user: SessionUser, meta: RequestMeta, e: CashEntryInput) {
    const o = await this.store.options(user.tenantId);
    const cash = (id: string | null) => (id ? o.cashAccounts.find((c) => c.id === id) : undefined);
    const bank = (id: string | null) => (id ? o.bankAccounts.find((b) => b.id === id) : undefined);
    const err: Record<string, string> = {};
    for (const [k, id] of [['cashAccountId', e.cashAccountId], ['toCashAccountId', e.toCashAccountId]] as const) if (id && !cash(id)) err[k] = 'Choose an active cash account';
    for (const [k, id] of [['bankAccountId', e.bankAccountId], ['toBankAccountId', e.toBankAccountId]] as const) if (id && !bank(id)?.accountId) err[k] = 'Choose an active bank account';
    const cat = e.categoryId ? o.categories.find((c) => c.id === e.categoryId) : null;
    if (e.categoryId && !cat) err.categoryId = 'Choose an active category';
    const counter = e.accountId ?? cat?.defaultAccountId ?? null;
    if (e.kind !== 'TRANSFER' && !counter) err.accountId = 'This category has no default account; choose the account';
    if (counter && !o.accounts.some((a) => a.id === counter)) err.accountId = 'Choose an active postable account';
    if (Object.keys(err).length) throw v(err);
    // money leaving a cash account can't exceed what it holds
    const from = cash(e.kind === 'CASH_OUT' || e.kind === 'TRANSFER' ? e.cashAccountId : null);
    if (from && e.amount > from.balance) throw new ValidationError(`Only ${from.balance.toLocaleString('en-PK')} is in ${from.name}.`, { amount: ['More than the cash available'] }, { code: 'CASH_INSUFFICIENT' });
    for (const c of [cash(e.cashAccountId), cash(e.toCashAccountId)]) if (c && (await this.store.lockedDay(user.tenantId, c.id, e.entryDate))) throw locked(e.entryDate);
    const branchId = cash(e.cashAccountId)?.branchId ?? bank(e.bankAccountId)?.branchId ?? o.branches[0]!.id;
    const narration = (e.narration ?? (e.kind === 'TRANSFER' ? 'Cash transfer' : `${cat?.name ?? 'Cash'} · ${e.partyName ?? ''}`)).slice(0, 300);
    const row = {
      tenantId: user.tenantId, branchId, entryKind: e.kind, entryDate: new Date(e.entryDate), entryTime: e.entryTime ? new Date(`1970-01-01T${e.entryTime}:00Z`) : null,
      cashAccountId: e.cashAccountId, bankAccountId: e.bankAccountId, toCashAccountId: e.toCashAccountId, toBankAccountId: e.toBankAccountId, categoryId: e.categoryId,
      paymentMode: e.kind === 'TRANSFER' ? null : e.paymentMode, partyName: e.partyName, customerId: e.customerId, vendorId: e.vendorId, employeeId: e.employeeId,
      referenceNo: e.referenceNo, amount: e.amount, narration: e.narration,
    };
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (e.kind === 'CHEQUE_IN' || e.kind === 'CHEQUE_OUT') {
        const input: ChequeInput = {
          direction: e.kind === 'CHEQUE_IN' ? 'RECEIVED' : 'ISSUED', docDate: e.entryDate, branchId, chequeNo: e.chequeNo!, customerId: e.customerId,
          vendorId: e.vendorId, accountId: e.customerId || e.vendorId ? null : counter, partyName: e.partyName!, drawnOnBankId: e.kind === 'CHEQUE_IN' ? e.drawnOnBankId : null,
          bankAccountId: e.bankAccountId, chequeDate: e.chequeDate!, dueDate: null, receivedOn: e.kind === 'CHEQUE_IN' ? e.entryDate : null, amount: e.amount,
          isPdc: e.isPdc, postingMode: e.isPdc ? 'HOLD_PDC' : 'DEPOSIT', chequeBookId: e.kind === 'CHEQUE_OUT' ? e.chequeBookId : null, crossedAcPayee: true,
          legacyNo: null, remarks: e.narration, narration: e.narration,
        };
        const chequeId = await this.cheques.createIn(user, input);
        const c = await this.cheques.get(user, chequeId);
        return this.store.insertEntry({ ...row, chequeId, journalEntryId: c.voucher!.id });
      }
      const voucher = this.voucherFor(e, o, counter, branchId, narration);
      const created = await this.vouchers.createForSource(user, meta, voucher, null);
      return this.store.insertEntry({ ...row, journalEntryId: created.id });
    });
    return this.entry(user, id);
  }

  async entry(user: SessionUser, id: string) {
    const e = await this.store.entry(user.tenantId, id);
    if (!e) throw new NotFoundError('Cash entry not found');
    return e;
  }

  async reverse(user: SessionUser, meta: RequestMeta, id: string, input: { date: string; reason: string; remarks: string | null }) {
    const e = await this.store.entry(user.tenantId, id);
    if (!e) throw new NotFoundError('Cash entry not found');
    if (!e.voucher || e.voucher.status !== 'POSTED') throw new ConflictError('Only a posted entry can be reversed; a pending one is recalled from its voucher.');
    for (const c of [e.cashAccount, e.toCashAccount]) if (c && (await this.store.lockedDay(user.tenantId, c.id, input.date))) throw locked(input.date);
    const voucher = await this.vouchers.get(user, e.voucher.id);
    await this.vouchers.reverse(user, meta, voucher.id, { reversalDate: input.date, reason: input.reason, remarks: input.remarks ?? 'Cash book entry reversed', rowVersion: voucher.rowVersion });
    return this.entry(user, id);
  }

  /** The cash account's GL activity by day, with opening / closing balances and each day's close status. */
  async ledger(user: SessionUser, q: { account: string; from: string; to: string }): Promise<CashLedger> {
    if (q.from > q.to) throw v({ from: 'On or before the end date' });
    const o = await this.store.options(user.tenantId);
    const acc = o.cashAccounts.find((c) => c.id === q.account);
    if (!acc) throw new NotFoundError('Cash account not found');
    const gl = o.accounts.find((a) => a.id === acc.accountId);
    const opening = await this.store.glBalance(user.tenantId, acc.accountId, q.from, true);
    const rows = await this.store.ledgerRows(user.tenantId, acc.accountId, q.from, q.to);
    const closes = await this.store.dayCloses(user.tenantId, acc.id, q.from, q.to);
    let run = opening;
    const days: CashLedgerDay[] = [];
    for (const r of rows) {
      run = r2(run + r.receipt - r.payment);
      r.balance = run;
      let d = days[days.length - 1];
      if (!d || d.date !== r.date) days.push((d = { date: r.date, rows: [], receipts: 0, payments: 0, closing: 0, close: null }));
      d.rows.push(r);
      d.receipts = r2(d.receipts + r.receipt);
      d.payments = r2(d.payments + r.payment);
      d.closing = run;
    }
    for (const d of days) {
      const c = closes.find((x) => x.closeDate === d.date);
      d.close = c ? { id: c.id, status: c.status, varianceAmount: c.varianceAmount } : null;
    }
    const cats = new Map<string, number>();
    for (const r of rows) if (r.category) cats.set(r.category, (cats.get(r.category) ?? 0) + r.receipt + r.payment);
    return {
      account: { id: acc.id, code: acc.code, name: acc.name, glCode: gl?.code ?? '', custodian: await this.store.custodian(user.tenantId, acc.custodianUserId), varianceTolerance: acc.varianceTolerance },
      from: q.from, to: q.to, opening, receipts: r2(rows.reduce((s, r) => s + r.receipt, 0)), payments: r2(rows.reduce((s, r) => s + r.payment, 0)), closing: run,
      count: rows.length, days: days.reverse(), categories: [...cats.entries()].map(([name, amount]) => ({ name, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
    };
  }

  /** The voucher behind a cash / bank / transfer entry. */
  private voucherFor(e: CashEntryInput, o: Awaited<ReturnType<CashBookStore['options']>>, counter: string | null, branchId: string, narration: string): VoucherInput {
    const gl = (cashId: string | null, bankId: string | null) => o.cashAccounts.find((c) => c.id === cashId)?.accountId ?? o.bankAccounts.find((b) => b.id === bankId)?.accountId ?? null;
    const base = {
      docDate: e.entryDate, postingDate: e.entryDate, referenceNo: e.referenceNo, branchId, department: null, narration, remarks: null, tags: [], partyName: e.partyName,
      instrumentType: null as string | null, instrumentNo: null as string | null, instrumentDate: null as string | null, autoReverseOn: null,
    };
    if (e.kind === 'TRANSFER') {
      return { ...base, voucherType: 'CON', cashBankAccountId: null, lines: [
        { accountId: gl(e.toCashAccountId, e.toBankAccountId)!, particulars: narration.slice(0, 200), debit: e.amount, credit: 0, costCentreId: null },
        { accountId: gl(e.cashAccountId, e.bankAccountId)!, particulars: narration.slice(0, 200), debit: 0, credit: e.amount, costCentreId: null },
      ] };
    }
    const type = ({ CASH_IN: 'CRV', CASH_OUT: 'CPV', BANK_IN: 'BRV', BANK_OUT: 'BPV' } as Record<string, VoucherInput['voucherType']>)[e.kind]!;
    const out = type === 'CPV' || type === 'BPV';
    // instrument types depend on the voucher type: IBFT on BPV / BRV only
    const ibft = (type === 'BPV' || type === 'BRV') && (e.paymentMode === 'IBFT' || e.paymentMode === 'RAAST');
    return {
      ...base, voucherType: type, cashBankAccountId: gl(e.cashAccountId, e.bankAccountId),
      instrumentType: ibft ? 'IBFT' : null, instrumentNo: ibft ? e.referenceNo : null, instrumentDate: ibft ? e.entryDate : null,
      lines: [{ accountId: counter!, particulars: (e.partyName ?? narration).slice(0, 200), debit: out ? e.amount : 0, credit: out ? 0 : e.amount, costCentreId: e.costCentreId }],
    };
  }
}
