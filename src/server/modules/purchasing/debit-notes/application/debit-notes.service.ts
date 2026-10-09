import { Injectable } from '@nestjs/common';
import { debitNoteLineAmounts, type DebitNote, type DebitNoteInput, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PayablesStore } from '../../common/application/payables-store.js';
import { PurchasingStore, type ListQuery } from '../../common/application/purchasing-store.js';

const LIVE_BILL = ['POSTED', 'PARTIALLY_PAID', 'PAID'];
const OPEN_BILL = ['POSTED', 'PARTIALLY_PAID'];
const STOCK_REASONS = ['PURCHASE_RETURN', 'QUALITY_REJECTION'];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft debit note can be changed; an open one can be applied or refunded.', undefined, { code: 'DEBIT_NOTE_NOT_EDITABLE' });
const tooMuch = (msg: string, field = 'amount') => new ValidationError(msg, { [field]: [msg] }, { code: 'ALLOCATION_EXCEEDS_BALANCE' });

/**
 * Debit notes: claims on a vendor against a bill (price variance, short supply, quality rejection, goods returned).
 * Posting (database debitNotePost) reverses the bill line's account (or stock at book value / average cost) and input
 * tax, and debits the payable; ADJUST_AGAINST_BILL applies it to the bill, REQUEST_REFUND waits for the vendor's refund.
 * An open balance can be applied to another bill of the vendor. Notes raised by purchase returns are read-only here.
 */
@Injectable()
export class DebitNotesService {
  constructor(
    private readonly store: PayablesStore,
    private readonly purchasing: PurchasingStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: ListQuery) {
    return this.store.listDebitNotes(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<DebitNote> {
    const d = await this.store.getDebitNote(user.tenantId, id);
    if (!d) throw new NotFoundError('Debit note not found');
    return d;
  }

  async create(user: SessionUser, meta: RequestMeta, input: DebitNoteInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('debitNoteAddUpdate', data));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: DebitNoteInput & { rowVersion: number }) {
    const d = await this.current(user, id, input.rowVersion);
    if (d.status !== 'DRAFT' || d.purchaseReturn) throw notEditable();
    const data = await this.payload(user, { ...input, lines: input.lines.map((l) => ({ ...l, id: null })) });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('debitNoteAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const d = await this.current(user, id, rowVersion);
    if (d.status !== 'DRAFT' || d.purchaseReturn) throw notEditable();
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('debitNote', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This debit note was changed. Reload and try again.');
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const d = await this.current(user, id, rowVersion);
    if (d.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      // postedAt while still a draft (the note's lock frees only the settlement columns once it is open)
      await this.store.set('debitNote', user.tenantId, id, { postedAt: new Date() });
      await this.store.run('debitNotePost', id);
    });
    return this.get(user, id);
  }

  async void(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const d = await this.current(user, id, rowVersion);
    if (d.status === 'VOID') return d;
    if (d.purchaseReturn) throw new ConflictError(`This debit note settles purchase return ${d.purchaseReturn.docNo}; cancel the return instead.`, undefined, { code: 'DEBIT_NOTE_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('debitNoteVoid', id, reason));
    return this.get(user, id);
  }

  /** The vendor refunded (part of) an open note: BRV / CRV Dr bank or cash, Cr payable. */
  async refund(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; date: string; amount: number; cashAccountId: string | null; bankAccountId: string | null }) {
    const d = await this.current(user, id, p.rowVersion);
    if (d.status !== 'OPEN') throw notEditable();
    if (p.amount > d.balanceAmount + 0.001) throw tooMuch(`At most the open balance ${d.balanceAmount.toLocaleString('en-PK')}`);
    const o = await this.purchasing.options(user.tenantId);
    if (p.cashAccountId && !o.cashAccounts.some((x) => x.id === p.cashAccountId)) throw v({ cashAccountId: 'Choose an active cash account' });
    if (p.bankAccountId && !o.bankAccounts.some((x) => x.id === p.bankAccountId)) throw v({ bankAccountId: 'Choose an active bank account' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.refundDebitNote(id, p.date, p.cashAccountId, p.bankAccountId, p.amount));
    return this.get(user, id);
  }

  /** Applies (part of) an open note to another open bill of the same vendor. */
  async apply(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; billId: string; amount: number }) {
    const d = await this.current(user, id, p.rowVersion);
    if (d.status !== 'OPEN') throw notEditable();
    const bill = await this.purchasing.getBill(user.tenantId, p.billId);
    if (!bill || bill.vendor.id !== d.vendor.id) throw v({ billId: 'Choose an open bill of this vendor' });
    if (!OPEN_BILL.includes(bill.status)) throw v({ billId: `Bill ${bill.docNo} has nothing open` });
    if (p.amount > d.balanceAmount + 0.001) throw tooMuch(`At most the note’s open balance ${d.balanceAmount.toLocaleString('en-PK')}`);
    if (p.amount > bill.balanceAmount + 0.001) throw tooMuch(`At most the bill’s balance ${bill.balanceAmount.toLocaleString('en-PK')}`);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.allocate(user.tenantId, { debitNoteId: id }, new Date().toISOString().slice(0, 10), [{ billId: p.billId, amount: r2(p.amount) }]));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private async payload(user: SessionUser, p: DebitNoteInput) {
    const o = await this.purchasing.options(user.tenantId);
    const bill = await this.purchasing.getBill(user.tenantId, p.billId);
    if (!bill) throw v({ billId: 'Bill not found' });
    if (!LIVE_BILL.includes(bill.status)) throw v({ billId: `Bill ${bill.docNo} isn’t posted` });
    const e: Record<string, string> = {};
    const stock = STOCK_REASONS.includes(p.reason) && p.lines.some((l) => (l.itemId || bill.lines.find((b) => b.id === l.billLineId)?.item) && l.returnQty > 0);
    const warehouseId = p.warehouseId ?? bill.warehouse?.id ?? null;
    if (stock && !warehouseId) e.warehouseId = 'Choose the warehouse the goods leave from';
    if (warehouseId && !o.warehouses.some((x) => x.id === warehouseId)) e.warehouseId = 'Choose an active warehouse';
    const lines = p.lines.map((l, i) => {
      const bl = l.billLineId ? bill.lines.find((b) => b.id === l.billLineId) : null;
      if (l.billLineId && !bl) e[`lines.${i}.billLineId`] = 'Not a line of this bill';
      if (l.taxCodeId && !o.taxCodes.some((x) => x.id === l.taxCodeId)) e[`lines.${i}.taxCodeId`] = 'Choose an active tax code';
      const itemId = l.itemId ?? bl?.item?.id ?? null;
      if (!itemId && !bl?.account) e[`lines.${i}.billLineId`] = 'Pick the bill line the claim is on';
      const a = debitNoteLineAmounts(l);
      return {
        lineNo: i + 1, billLineId: l.billLineId, itemId, description: l.description ?? bl?.description ?? null, billedQty: l.billedQty ?? (bl ? bl.baseQty + bl.bonusQty : null),
        returnQty: l.returnQty, rate: l.rate, taxCodeId: l.taxCodeId, taxRate: l.taxRate, ...a,
      };
    });
    if (Object.keys(e).length) throw v(e);
    const net = r2(lines.reduce((s, l) => s + l.netAmount, 0));
    const tax = r2(lines.reduce((s, l) => s + l.taxAmount, 0));
    const total = r2(net + tax);
    if (total > bill.netPayableAmount + 0.001) throw new ConflictError(`The debit note (${total.toLocaleString('en-PK')}) is more than bill ${bill.docNo} (${bill.netPayableAmount.toLocaleString('en-PK')}).`, undefined, { code: 'DEBIT_NOTE_EXCEEDS_BILL' });
    if (p.whtAmount > total) throw v({ whtAmount: 'More than the note' });
    return {
      docDate: p.docDate, vendorId: bill.vendor.id, branchId: bill.branch.id, billId: bill.id, reason: p.reason, reasonNote: p.reasonNote, warehouseId,
      settlement: p.settlement, netAmount: net, taxAmount: tax, totalAmount: total, whtAmount: p.whtAmount, remarks: p.remarks, lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const d = await this.get(user, id);
    if (d.rowVersion !== rowVersion) throw new ConcurrencyError('This debit note was changed. Reload and try again.');
    return d;
  }
}
