import { Injectable } from '@nestjs/common';
import { tierRate, type BulkRun, type BulkRunInput, type BulkShopPreview, type SessionUser, type WholesaleOptions, type WholesaleQuery } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { SalesStore } from '../../../sales/common/application/sales-store.js';
import { SalesInvoicesService } from '../../../sales/invoices/application/sales-invoices.service.js';
import { WholesaleStore } from '../../common/application/wholesale-store.js';
import { errorInfo, tierFactor, wholesaleInvoice } from '../../common/application/wholesale-invoice.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Bulk invoicing a route: a draft run holds shop × product cells (cartons, tier rate, GST). Preview checks each shop's
 * credit and the warehouse stock; Generate saves and posts one WHOLESALE invoice per shop, each in its own transaction —
 * a shop over its limit (or short of stock, or failing otherwise) is skipped and recorded with the reason.
 */
@Injectable()
export class BulkInvoiceRunsService {
  constructor(
    private readonly store: WholesaleStore,
    private readonly sales: SalesStore,
    private readonly invoices: SalesInvoicesService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: WholesaleQuery) {
    return this.store.listRuns(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<BulkRun> {
    const r = await this.store.getRun(user.tenantId, id);
    if (!r) throw new NotFoundError('Bulk invoice run not found');
    return r;
  }

  async create(user: SessionUser, meta: RequestMeta, input: BulkRunInput) {
    const o = await this.store.options(user.tenantId, user.id, true);
    const route = o.routes.find((r) => r.id === input.routeId);
    const e: Record<string, string> = {};
    if (!route) e.routeId = 'Choose an active route';
    const warehouseId = input.warehouseId ?? route?.warehouseId ?? null;
    if (!warehouseId || !o.warehouses.some((w) => w.id === warehouseId)) e.warehouseId = 'Choose the warehouse the goods leave from';
    const cells = input.cells.map((c, i) => {
      const shop = o.shops.find((s) => s.customerId === c.customerId);
      const p = o.products.find((x) => x.id === c.itemId);
      if (!shop || shop.routeId !== input.routeId) e[`cells.${i}.customerId`] = 'This shop isn’t on the route';
      if (!p) { e[`cells.${i}.itemId`] = 'Choose an active product'; return null; }
      const rate = tierRate(p, tierFactor(o, shop?.priceTier ?? 'RETAILER'));
      const qty = Number(c.qtyCtn);
      return { customerId: c.customerId, itemId: c.itemId, qtyCtn: qty, unitsPerCtn: p.ctn, rate, taxRate: p.taxRate, amount: r2(qty * p.ctn * rate * (1 + p.taxRate / 100)) };
    });
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
    const cs = cells.filter((c): c is NonNullable<typeof c> => !!c);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('bulkInvoiceRunAddUpdate', {
      branchId: route!.branchId, routeId: input.routeId, docDate: input.docDate, warehouseId, mode: input.mode ?? 'MATRIX',
      shopsSelected: new Set(cs.map((c) => c.customerId)).size, totalCtn: cs.reduce((s, c) => s + c.qtyCtn, 0), totalValue: r2(cs.reduce((s, c) => s + c.amount, 0)), cells: cs,
    }));
    return this.get(user, id);
  }

  /** Per shop: lines, cartons, amount, credit headroom and stock shortage (the warehouse's stock shared in shop order). */
  async preview(user: SessionUser, id: string): Promise<BulkRun> {
    const run = await this.get(user, id);
    const o = await this.store.options(user.tenantId, user.id, true);
    return { ...run, preview: await this.plan(user, run, o) };
  }

  async generate(user: SessionUser, meta: RequestMeta, id: string) {
    const run = await this.get(user, id);
    if (run.status !== 'DRAFT') throw new ConflictError('This bulk invoice run was already generated.', undefined, { code: 'BULK_RUN_NOT_DRAFT' });
    const o = await this.store.options(user.tenantId, user.id, true);
    const plan = await this.plan(user, run, o);
    const done: { customerId: string; invoiceId: string; docNo: string; amount: number }[] = [];
    const skipped: { customerId: string; reasonCode: string; reason: string; billAmount: number; outstandingAmount: number | null; creditLimit: number | null; overByAmount: number | null }[] = [];
    for (const s of plan) {
      if (s.willSkip === 'OVER_CREDIT_LIMIT') {
        skipped.push({ customerId: s.customerId, reasonCode: 'OVER_CREDIT_LIMIT', reason: `Over credit limit by Rs ${s.overBy.toLocaleString('en-PK')}`, billAmount: s.amount, outstandingAmount: s.balance, creditLimit: s.creditLimit, overByAmount: s.overBy });
        continue;
      }
      const cells = run.cells.filter((c) => c.customerId === s.customerId);
      const shop = o.shops.find((x) => x.customerId === s.customerId);
      try {
        const invId = await this.invoices.saveAndPost(user, meta, wholesaleInvoice(o, {
          customerId: s.customerId, docDate: run.docDate, warehouseId: run.warehouse!.id, routeId: run.route.id, priceTier: shop?.priceTier ?? 'RETAILER', remarks: 'Bulk invoicing',
        }, cells.map((c) => ({ itemId: c.itemId, qtyCtn: c.qtyCtn, qtyLoose: 0, rate: c.rate, taxRate: o.products.find((p) => p.id === c.itemId)?.taxRate ?? 0 }))), true);
        const inv = await this.invoices.get(user, invId);
        done.push({ customerId: s.customerId, invoiceId: invId, docNo: inv.docNo, amount: inv.netAmount });
      } catch (e) {
        const { code, message } = errorInfo(e);
        const overBy = code === 'CREDIT_LIMIT_EXCEEDED' ? Math.max(s.overBy, 0.01) : null;
        skipped.push({
          customerId: s.customerId, reasonCode: code === 'STOCK_INSUFFICIENT' ? 'OUT_OF_STOCK' : overBy ? 'OVER_CREDIT_LIMIT' : 'OTHER', reason: message.slice(0, 300),
          billAmount: s.amount, outstandingAmount: s.balance, creditLimit: s.creditLimit, overByAmount: overBy,
        });
      }
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.completeRun(user.tenantId, id, user.id, done, skipped, plan.filter((p) => p.overBy > 0).length));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private async plan(user: SessionUser, run: BulkRun, o: WholesaleOptions): Promise<BulkShopPreview[]> {
    const stock = run.warehouse ? await this.store.stock(user.tenantId, run.warehouse.id) : {};
    const left = { ...stock };
    const shops = [...new Set(run.cells.map((c) => c.customerId))]
      .map((id) => o.shops.find((s) => s.customerId === id) ?? { customerId: id, name: '?', creditLimit: 0 })
      .sort((a, b) => a.name.localeCompare(b.name));
    const out: BulkShopPreview[] = [];
    for (const shop of shops) {
      const cells = run.cells.filter((c) => c.customerId === shop.customerId);
      const amount = r2(cells.reduce((s, c) => s + c.amount, 0));
      const credit = await this.sales.credit(user.tenantId, shop.customerId);
      const limit = credit?.effectiveLimit ?? 0;
      const balance = credit?.balance ?? 0;
      const overBy = credit && (credit.status === 'ON_HOLD' || (credit.blockOverLimit && limit > 0)) ? r2(Math.max(0, balance + amount - limit)) || (credit.status === 'ON_HOLD' ? 0.01 : 0) : 0;
      const short: BulkShopPreview['short'] = [];
      for (const c of cells) {
        const p = o.products.find((x) => x.id === c.itemId);
        const need = c.qtyCtn * (p?.ctn ?? 1);
        const have = Math.max(0, left[c.itemId] ?? 0);
        if (have < need) short.push({ sku: p?.sku ?? '?', need, have });
        if (!overBy) left[c.itemId] = have - need;
      }
      out.push({
        customerId: shop.customerId, name: shop.name, lines: cells.length, ctn: cells.reduce((s, c) => s + c.qtyCtn, 0), amount, creditLimit: limit, balance, overBy,
        short, willSkip: overBy > 0 ? 'OVER_CREDIT_LIMIT' : short.length ? 'OUT_OF_STOCK' : null,
      });
    }
    return out;
  }
}
