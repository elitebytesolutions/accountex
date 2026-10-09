import { Injectable } from '@nestjs/common';
import type { CustomerReceiptInput, ReceivablesQuery, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ReceivablesStore } from '../../common/application/receivables-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const changed = () => new ConcurrencyError('This receipt was changed. Reload and try again.');

/**
 * Customer receipts: recorded and posted in one step (Dr cash / bank / Cheques in hand, WHT receivable, bank
 * charges; Cr the receivable) and allocated to open invoices (given amounts, or oldest first). A cheque receipt
 * puts the cheque in the register as IN_HAND; clearing it there moves the money to the bank, a bounce marks the
 * receipt BOUNCED and re-opens its invoices. Allocations can be changed until the receipt is void / bounced.
 */
@Injectable()
export class CustomerReceiptsService {
  constructor(
    private readonly store: ReceivablesStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: ReceivablesQuery) {
    return this.store.listReceipts(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const r = await this.store.getReceipt(user.tenantId, id);
    if (!r) throw new NotFoundError('Receipt not found');
    return r;
  }

  async openItems(user: SessionUser, customerId: string) {
    const o = await this.store.openItems(user.tenantId, customerId);
    if (!o) throw new NotFoundError('Customer not found');
    return o;
  }

  async create(user: SessionUser, meta: RequestMeta, input: CustomerReceiptInput) {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.createIn(user, input));
    return this.get(user, id);
  }

  /** Records, posts and allocates a receipt inside the caller's unit of work (the POS uses it for each tender). */
  async createIn(user: SessionUser, input: CustomerReceiptInput, extra: { posShiftId?: string; salesOrderId?: string } = {}) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.customers.some((c) => c.id === input.customerId)) e.customerId = 'Choose an active customer';
    if (!o.lookups.receiptMethods.some((m) => m.code === input.method)) e.method = 'Choose how it was received';
    if (input.cashAccountId && !o.cashAccounts.some((c) => c.id === input.cashAccountId)) e.cashAccountId = 'Choose an active cash account';
    if (input.bankAccountId && !o.bankAccounts.some((b) => b.id === input.bankAccountId)) e.bankAccountId = 'Choose an active bank account';
    if (Object.keys(e).length) throw v(e);
    const settled = r2(Number(input.amountReceived) + Number(input.whtAmount ?? 0) + Number(input.bankCharges ?? 0));
    const allocations = await this.plan(user, input.customerId, settled, (input.allocations ?? []).map((a) => ({ invoiceId: a.invoiceId, amount: Number(a.amount) })), !!input.autoAllocate);
    const id = await this.store.save('customerReceiptAddUpdate', {
      docDate: input.docDate, customerId: input.customerId, branchId: input.branchId ?? null, method: input.method,
      bankAccountId: input.method === 'CASH' ? null : input.bankAccountId ?? null, cashAccountId: input.method === 'CASH' ? input.cashAccountId : null,
      reference: input.method === 'CHEQUE' ? (input.reference ?? '').replace(/\D/g, '') : input.reference ?? null,
      amountReceived: Number(input.amountReceived), whtAmount: Number(input.whtAmount ?? 0), whtSection: input.whtSection ?? null,
      whtCertificateStatus: Number(input.whtAmount ?? 0) > 0 ? 'NOT_YET_RECEIVED' : 'NOT_APPLICABLE', bankCharges: Number(input.bankCharges ?? 0),
      memo: input.memo ?? null, emailReceipt: false, posShiftId: extra.posShiftId ?? null, salesOrderId: extra.salesOrderId ?? null,
    });
    await this.store.run('customerReceiptPost', id);
    if (allocations.length) await this.store.setAllocations(user.tenantId, id, input.customerId, allocations);
    return id;
  }

  async allocate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, rows: { invoiceId: string; amount: number }[]) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw changed();
    if (r.status === 'VOID' || r.status === 'BOUNCED') throw new ConflictError('A void or bounced receipt can’t be allocated.', undefined, { code: 'RECEIPT_NOT_ALLOCATABLE' });
    const current = new Map(r.allocations.filter((a) => a.invoice).map((a) => [a.invoice!.id, a.amount]));
    const plan = await this.plan(user, r.customer.id, r.settledAmount, rows, false, current);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setAllocations(user.tenantId, id, r.customer.id, plan));
    return this.get(user, id);
  }

  async void(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw changed();
    if (r.status === 'VOID') return r;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (r.status !== 'BOUNCED') await this.store.setAllocations(user.tenantId, id, r.customer.id, []);
      await this.store.run('customerReceiptVoid', id, reason);
    });
    return this.get(user, id);
  }

  /**
   * Checks given allocations against the customer's open invoices (adding back what this receipt already holds on
   * them) and the receipt total; with none given and auto on, settles oldest-due first.
   */
  private async plan(user: SessionUser, customerId: string, settled: number, rows: { invoiceId: string; amount: number }[], auto: boolean, held = new Map<string, number>()) {
    const open = await this.store.openItems(user.tenantId, customerId);
    const owed = new Map((open?.invoices ?? []).map((i) => [i.id, i.balanceAmount]));
    for (const [id, amt] of held) owed.set(id, r2((owed.get(id) ?? 0) + amt));
    if (!rows.length && auto) {
      let left = settled;
      const out: { invoiceId: string; amount: number; isAutoFifo: boolean }[] = [];
      for (const i of open?.invoices ?? []) {
        if (left <= 0) break;
        const a = r2(Math.min(left, i.balanceAmount));
        if (a > 0) out.push({ invoiceId: i.id, amount: a, isAutoFifo: true });
        left = r2(left - a);
      }
      return out;
    }
    const e: Record<string, string> = {};
    rows.forEach((x, i) => {
      if (!owed.has(x.invoiceId)) e[`allocations.${i}.invoiceId`] = 'Choose an open invoice of this customer';
      else if (x.amount > owed.get(x.invoiceId)!) e[`allocations.${i}.amount`] = `The invoice only owes ${owed.get(x.invoiceId)}`;
    });
    if (new Set(rows.map((x) => x.invoiceId)).size !== rows.length) e.allocations = 'Each invoice once';
    const total = r2(rows.reduce((s, x) => s + Number(x.amount), 0));
    if (total > settled) e.allocations = `Allocations (${total}) are more than the receipt settles (${settled})`;
    if (Object.keys(e).length) {
      const over = Object.values(e).some((m) => m.startsWith('Allocations (') || m.startsWith('The invoice only owes'));
      if (over) throw new ConflictError(Object.values(e)[0]!, undefined, { code: total > settled ? 'ALLOCATION_EXCEEDS_RECEIPT' : 'ALLOCATION_EXCEEDS_BALANCE' });
      throw v(e);
    }
    return rows.map((x) => ({ invoiceId: x.invoiceId, amount: Number(x.amount), isAutoFifo: false }));
  }
}
