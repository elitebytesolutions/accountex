import { Injectable } from '@nestjs/common';
import type { PosSaleInput, PosSaleResult, PosSession, PosShiftOpenInput, ReceivablesQuery, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../../../../core/domain/errors.js';
import { salesLines } from '../../../sales/common/application/sales-lines.js';
import { SalesStore } from '../../../sales/common/application/sales-store.js';
import { ReceivablesStore } from '../../common/application/receivables-store.js';
import { CustomerReceiptsService } from '../../receipts/application/customer-receipts.service.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notOpen = () => new ConflictError('Open a shift before selling.', undefined, { code: 'POS_SHIFT_NOT_OPEN' });
const WALLETS = ['JAZZCASH', 'EASYPAISA'];

/**
 * Point of sale. A cashier opens a shift on a counter (one open shift per counter and per cashier) with a cash
 * float. A sale is a POS invoice posted with its payments in one transaction: each tender other than CREDIT is a
 * customer receipt (cash into the shift's drawer account, card / wallet into their clearing accounts) allocated to
 * the bill; CREDIT stays on the customer's account. Bills can be held (a draft) and resumed. Closing counts the
 * drawer by denomination; the difference to the expected cash posts to cash over / short and gives the Z-report.
 */
@Injectable()
export class PosService {
  constructor(
    private readonly store: ReceivablesStore,
    private readonly sales: SalesStore,
    private readonly receipts: CustomerReceiptsService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async session(user: SessionUser): Promise<PosSession> {
    const [shift, o] = await Promise.all([this.store.openShift(user.tenantId, user.id), this.store.options(user.tenantId)]);
    return { shift, held: shift ? await this.store.heldSales(user.tenantId, shift.id) : [], walkInCustomerId: o.customers.find((c) => /walk.?in/i.test(c.name))?.id ?? null };
  }

  listShifts(user: SessionUser, q: ReceivablesQuery) {
    return this.store.listShifts(user.tenantId, q);
  }

  async report(user: SessionUser, id: string) {
    const r = await this.store.shiftReport(user.tenantId, id);
    if (!r) throw new NotFoundError('Shift not found');
    return r;
  }

  async open(user: SessionUser, meta: RequestMeta, p: PosShiftOpenInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.branches.some((b) => b.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (!o.warehouses.some((w) => w.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (!o.cashAccounts.some((c) => c.id === p.cashAccountId)) e.cashAccountId = 'Choose an active cash account';
    if (Object.keys(e).length) throw v(e);
    if (await this.store.counterTaken(user.tenantId, p.branchId, p.counterName, user.id)) {
      throw new ConflictError('A shift is already open for this counter or for you. Close it first.', undefined, { code: 'POS_SHIFT_ALREADY_OPEN' });
    }
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('posShiftAddUpdate', {
      branchId: p.branchId, warehouseId: p.warehouseId, counterName: p.counterName.trim(), cashierUserId: user.id, cashAccountId: p.cashAccountId, openingFloat: Number(p.openingFloat ?? 0),
    }));
    return (await this.store.getShift(user.tenantId, id))!;
  }

  async close(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; denominations: { denomination: number; noteCount: number }[]; remarks?: string | null }) {
    const s = await this.shift(user, id);
    if (s.rowVersion !== p.rowVersion) throw new ConcurrencyError('This shift was changed. Reload and try again.');
    if (s.status !== 'OPEN') throw notOpen();
    const counted = r2(p.denominations.reduce((t, d) => t + Number(d.denomination) * Number(d.noteCount), 0));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const z = await this.store.nextNo('ZR', today(), s.branch.id);
      await this.store.save('posShiftAddUpdate', {
        id, rowVersion: p.rowVersion, countedCash: counted, closedAt: new Date().toISOString(), zReportNo: z, remarks: p.remarks ?? null,
        denominations: p.denominations.filter((d) => Number(d.noteCount) > 0).map((d) => ({ denomination: Number(d.denomination), noteCount: Number(d.noteCount) })),
      });
      await this.store.run('posShiftClose', id);
    });
    return this.report(user, id);
  }

  async sale(user: SessionUser, meta: RequestMeta, p: PosSaleInput): Promise<PosSaleResult | { held: true; invoice: { id: string; docNo: string; netAmount: number; status: string } }> {
    const s = await this.shift(user, p.shiftId);
    if (s.status !== 'OPEN') throw notOpen();
    const o = await this.sales.options(user.tenantId);
    const c = o.customers.find((x) => x.id === p.customerId);
    const e: Record<string, string> = {};
    if (!c) e.customerId = 'Choose an active customer';
    const { lines, totals } = salesLines(o, p.lines.map((l) => {
      const item = o.products.find((x) => x.id === l.itemId);
      return { itemId: l.itemId, qtyCtn: 0, qtyLoose: Number(l.qty), bonusQty: 0, rate: Number(l.rate), discountPct: Number(l.discountPct ?? 0), taxCodeId: item?.taxCodeId ?? null, taxRate: item?.gstRate ?? 0 };
    }), e);
    if (Object.keys(e).length) throw v(e);
    const held = p.heldInvoiceId ? await this.sales.getInvoice(user.tenantId, p.heldInvoiceId) : null;
    if (p.heldInvoiceId && (!held || held.status !== 'DRAFT' || held.channel !== 'POS')) throw new ConflictError('This held bill is no longer open.', undefined, { code: 'INVOICE_NOT_EDITABLE' });
    const net = totals.netAmount;
    const pays = (p.payments ?? []).map((x) => ({ ...x, amount: r2(Number(x.amount)) }));
    if (!p.hold) {
      const paid = r2(pays.reduce((t, x) => t + x.amount, 0));
      if (paid !== net) throw new ValidationError(`The payments (${paid}) must add up to the bill total (${net}).`, { payments: ['The payments must add up to the bill total'] }, { code: 'POS_PAYMENT_MISMATCH' });
      const tenders = new Set(['CASH', 'CARD', 'CREDIT', ...WALLETS]);
      if (pays.some((x) => !tenders.has(x.tender))) throw v({ payments: 'Choose cash, card, wallet or credit' });
    }
    const data = {
      channel: 'POS', docDate: today(), customerId: c!.id, branchId: s.branch.id, warehouseId: s.warehouse.id, posShiftId: s.id, salesRepUserId: user.id,
      priceListId: c!.priceListId, paymentTerms: 'DUE_ON_RECEIPT', dueDate: today(), saleType: 'RETAIL',
      buyerName: c!.name, buyerAddress: c!.address, buyerNtn: c!.ntn, buyerStrn: c!.strn, buyerCnic: c!.cnic, buyerCity: c!.city, contactPhone: c!.phone, contactEmail: c!.email,
      submitToFbr: true, grossAmount: totals.grossAmount, discountAmount: totals.discountAmount, taxableAmount: totals.taxableAmount, taxAmount: totals.taxAmount, netAmount: net, lines,
    };

    const invoiceId = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = held
        ? await this.sales.save('salesInvoiceAddUpdate', { ...data, id: held.id, rowVersion: held.rowVersion })
        : await this.sales.save('salesInvoiceAddUpdate', data);
      if (p.hold) return id;
      await this.sales.run('salesInvoicePost', id);
      const add = { cash: 0, card: 0, wallet: 0, credit: 0 };
      for (const x of pays) {
        let receiptId: string | null = null;
        if (x.tender !== 'CREDIT') {
          receiptId = await this.receipts.createIn(user, {
            docDate: today(), customerId: c!.id, branchId: s.branch.id, method: x.tender, cashAccountId: x.tender === 'CASH' ? s.cashAccount?.id ?? null : null,
            reference: x.reference ?? null, amountReceived: x.amount, memo: `POS ${s.counterName}`, allocations: [{ invoiceId: id, amount: x.amount }],
          }, { posShiftId: s.id });
        }
        const tendered = x.tender === 'CASH' && x.tenderedAmount ? Number(x.tenderedAmount) : null;
        await this.store.addPosPayment(user.tenantId, {
          posShiftId: s.id, invoiceId: id, tender: x.tender, amount: x.amount, tenderedAmount: tendered,
          changeAmount: tendered ? Math.max(0, r2(tendered - x.amount)) : 0, reference: x.reference ?? null, receiptId,
        });
        if (x.tender === 'CASH') add.cash += x.amount;
        else if (x.tender === 'CARD') add.card += x.amount;
        else if (x.tender === 'CREDIT') add.credit += x.amount;
        else add.wallet += x.amount;
      }
      await this.store.set('shift', user.tenantId, s.id, {
        cashSales: r2(s.cashSales + add.cash), cardSales: r2(s.cardSales + add.card), walletSales: r2(s.walletSales + add.wallet),
        creditSales: r2(s.creditSales + add.credit), billsCount: s.billsCount + 1,
      });
      return id;
    });
    const inv = (await this.sales.getInvoice(user.tenantId, invoiceId))!;
    const out = { id: inv.id, docNo: inv.docNo, netAmount: inv.netAmount, status: inv.status };
    if (p.hold) return { held: true, invoice: out };
    const cash = pays.find((x) => x.tender === 'CASH');
    const change = cash?.tenderedAmount ? Math.max(0, r2(Number(cash.tenderedAmount) - cash.amount)) : 0;
    return { invoice: out, change, shift: (await this.store.getShift(user.tenantId, s.id))! };
  }

  /** Discards a held bill (deletes the draft). */
  async discard(user: SessionUser, meta: RequestMeta, invoiceId: string) {
    const inv = await this.sales.getInvoice(user.tenantId, invoiceId);
    if (!inv || inv.channel !== 'POS' || inv.status !== 'DRAFT') throw new ConflictError('This held bill is no longer open.', undefined, { code: 'INVOICE_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.sales.deleteDraft('invoice', user.tenantId, invoiceId, inv.rowVersion));
  }

  /** The shift, for its cashier (or a supervisor holding pos:approve). */
  private async shift(user: SessionUser, id: string) {
    const s = await this.store.getShift(user.tenantId, id);
    if (!s) throw new NotFoundError('Shift not found');
    if (s.cashier?.id !== user.id && !user.permissions.includes('pos:approve')) throw new PermissionDeniedError('This shift belongs to another cashier.');
    return s;
  }
}
