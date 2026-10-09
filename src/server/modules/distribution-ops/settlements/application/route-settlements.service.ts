import { Injectable } from '@nestjs/common';
import type { DistributionQuery, RouteSettlementSave, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { CustomerReceiptsService } from '../../../receivables-ops/receipts/application/customer-receipts.service.js';
import { SalesReturnsService } from '../../../receivables-ops/returns/application/sales-returns.service.js';
import { DistributionOpsStore, type SettlementDetail } from '../../common/application/distribution-ops-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('This settlement can no longer be changed.', undefined, { code: 'SETTLEMENT_NOT_EDITABLE' });
const changed = () => new ConcurrencyError('This settlement was changed. Reload and try again.');
/** Route return reason → sales return reason and what happens to the goods. */
const RETURN_MAP: Record<string, { reason: string; disposition: string }> = {
  DAMAGED_IN_TRANSIT: { reason: 'DAMAGED', disposition: 'QUARANTINE' },
  EXPIRED: { reason: 'EXPIRED', disposition: 'QUARANTINE' },
  SHOP_REFUSED: { reason: 'CUSTOMER_REQUEST', disposition: 'RESTOCK' },
  WRONG_ITEM: { reason: 'WRONG_ITEM', disposition: 'RESTOCK' },
  EXCESS_SUPPLIED: { reason: 'CUSTOMER_REQUEST', disposition: 'RESTOCK' },
};

/**
 * Route settlement of a dispatched run: per invoice the cash and cheques collected and the goods returned; the
 * rest stays on the customer's account (credit). The cash is counted by denomination. Posting (settle:approve)
 * records a sales return per invoice with returns (restocked into the run's warehouse, credit note applied), a cash
 * receipt and one cheque receipt per cheque (Cheques in hand) allocated to the invoice, then books the cash short
 * (salesman receivable) / over and marks the run SETTLED; not-delivered invoices leave the run for a later one.
 */
@Injectable()
export class RouteSettlementsService {
  constructor(
    private readonly store: DistributionOpsStore,
    private readonly receipts: CustomerReceiptsService,
    private readonly returns: SalesReturnsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: DistributionQuery) {
    return this.store.listSettlements(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const s = await this.store.getSettlement(user.tenantId, id);
    if (!s) throw new NotFoundError('Route settlement not found');
    return s;
  }

  async save(user: SessionUser, meta: RequestMeta, id: string, p: RouteSettlementSave) {
    const s = await this.get(user, id);
    if (s.rowVersion !== p.rowVersion) throw changed();
    if (s.status !== 'OPEN') throw notEditable();
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.cashAccounts.some((c) => c.id === p.cashAccountId)) e.cashAccountId = 'Choose an active cash account';
    const reasons = new Set(o.lookups.returnReasons.map((x) => x.code));
    const detail: SettlementDetail = { lines: [], cashCounts: (p.denominations ?? []).filter((d) => Number(d.noteCount) > 0).map((d) => ({ denomination: Number(d.denomination), noteCount: Number(d.noteCount) })) };
    for (const [i, l] of p.lines.entries()) {
      const line = s.lines.find((x) => x.invoice.id === l.invoiceId);
      if (!line) { e[`lines.${i}.invoiceId`] = 'This invoice is not on the run'; continue; }
      const cheques = (l.cheques ?? []).map((c) => ({ chequeNo: c.chequeNo, bankId: c.bankId ?? null, bankName: c.bankName, chequeDate: c.chequeDate, amount: r2(Number(c.amount)) }));
      const rets = (l.returns ?? []).map((x, k) => {
        const il = line.invoiceLines.find((y) => y.id === x.invoiceLineId);
        if (!il) e[`lines.${i}.returns.${k}.invoiceLineId`] = 'Not a line of this invoice';
        else if (Number(x.qty) > il.qty) e[`lines.${i}.returns.${k}.qty`] = `At most ${il.qty}`;
        if (!reasons.has(x.reason)) e[`lines.${i}.returns.${k}.reason`] = 'Choose a reason';
        return { invoiceLineId: x.invoiceLineId, itemId: il?.item.id ?? '', batchId: null, suppliedQty: il?.qty ?? 0, returnQty: Number(x.qty), unitPrice: il?.netRate ?? 0, unitCost: 0, reason: x.reason };
      });
      const cash = r2(Number(l.cashAmount ?? 0));
      const chq = r2(cheques.reduce((t, c) => t + c.amount, 0));
      const ret = r2(rets.reduce((t, x) => t + x.returnQty * x.unitPrice, 0));
      const state = l.deliveryState ?? 'FULL';
      if (state === 'NONE' && cash + chq + ret > 0) e[`lines.${i}.deliveryState`] = 'A not-delivered invoice takes no cash, cheque or return';
      const credit = state === 'NONE' ? 0 : r2(line.balanceAmount - cash - chq - ret);
      if (credit < 0) e[`lines.${i}.cashAmount`] = `Cash, cheques and returns (${r2(cash + chq + ret)}) are more than ${line.invoice.docNo} owes (${line.balanceAmount})`;
      detail.lines.push({ id: line.id, invoiceId: l.invoiceId, deliveryState: state, nonDeliveryReason: state === 'FULL' ? null : l.nonDeliveryReason ?? null, cashAmount: cash, chequeAmount: chq, returnAmount: ret, creditAmount: Math.max(credit, 0), cheques, returns: rets });
    }
    if (Object.keys(e).length) {
      const mismatch = Object.values(e).find((m) => m.includes('are more than'));
      if (mismatch) throw new ValidationError(mismatch, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])), { code: 'SETTLEMENT_LINE_MISMATCH' });
      throw v(e);
    }
    const sum = (k: 'cashAmount' | 'chequeAmount' | 'returnAmount' | 'creditAmount') => r2(detail.lines.reduce((t, l) => t + l[k], 0));
    const counted = r2(detail.cashCounts.reduce((t, c) => t + c.denomination * c.noteCount, 0));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.writeSettlement(user.tenantId, id, detail);
      await this.store.set('settlement', user.tenantId, id, {
        docDate: new Date(`${p.docDate}T00:00:00Z`), cashAccountId: p.cashAccountId, salesmanEmployeeId: p.salesmanEmployeeId ?? s.salesman?.id ?? null, remarks: p.remarks ?? null,
        cashExpected: sum('cashAmount'), cashCounted: counted, chequeTotal: sum('chequeAmount'), returnTotal: sum('returnAmount'), creditTotal: sum('creditAmount'),
      });
    });
    return this.get(user, id);
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw changed();
    if (s.status !== 'OPEN') throw notEditable();
    if (!s.cashAccount) throw v({ cashAccountId: 'Save the settlement with its cash account first' });
    const sheet = await this.store.getLoadSheet(user.tenantId, s.loadSheet.id);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const l of s.lines) {
        if (l.deliveryState === 'NONE') continue;
        let receiptId: string | null = null;
        let returnId: string | null = null;
        if (l.returns.length) {
          returnId = await this.returns.createAndPostIn(user, {
            returnType: 'AGAINST_INVOICE', docDate: s.docDate, customerId: l.customer.id, invoiceId: l.invoice.id, warehouseId: sheet!.sourceWarehouse.id,
            remarks: `Route settlement ${s.docNo}`,
            lines: l.returns.map((x) => ({ invoiceLineId: x.invoiceLineId, itemId: x.item.id, qty: x.returnQty, rate: x.unitPrice, ...RETURN_MAP[x.reason] ?? { reason: 'CUSTOMER_REQUEST', disposition: 'RESTOCK' } })),
          });
        }
        if (l.cashAmount > 0) {
          receiptId = await this.receipts.createIn(user, {
            docDate: s.docDate, customerId: l.customer.id, method: 'CASH', cashAccountId: s.cashAccount!.id, reference: s.docNo, amountReceived: l.cashAmount,
            memo: `Route settlement ${s.docNo}`, allocations: [{ invoiceId: l.invoice.id, amount: l.cashAmount }],
          });
        }
        for (const c of l.cheques) {
          const rid = await this.receipts.createIn(user, {
            docDate: s.docDate, customerId: l.customer.id, method: 'CHEQUE', reference: c.chequeNo, amountReceived: c.amount,
            memo: `Route settlement ${s.docNo} · ${c.bankName}`, allocations: [{ invoiceId: l.invoice.id, amount: c.amount }],
          });
          receiptId = receiptId ?? rid;
          const rc = await this.receipts.get(user, rid);
          if (rc.cheque) await this.store.setSettlementCheque(user.tenantId, l.id, c.chequeNo, rc.cheque.id);
        }
        if (receiptId || returnId) await this.store.setSettlementLine(user.tenantId, l.id, { receiptId, salesReturnId: returnId });
      }
      await this.store.run('routeSettlementPost', id);
    });
    return this.get(user, id);
  }
}
