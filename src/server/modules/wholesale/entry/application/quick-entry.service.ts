import { Injectable } from '@nestjs/common';
import type { SessionUser, WholesaleBillInput, WholesaleInvoiceRef, WholesaleOptions } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { SalesInvoicesService } from '../../../sales/invoices/application/sales-invoices.service.js';
import { WholesaleStore } from '../../common/application/wholesale-store.js';
import { wholesaleInvoice, wsAmounts, type WsLine } from '../../common/application/wholesale-invoice.js';

/**
 * Quick Wholesale Entry: Save posts a WHOLESALE invoice (WS number; credit control, stock issue and journal in the
 * database). Hold parks the bill (Distribution.HeldBills); recall hands it back to the screen and closes it; discard
 * drops it. Saving a recalled bill needs nothing more: it was closed when recalled.
 */
@Injectable()
export class QuickEntryService {
  constructor(private readonly store: WholesaleStore, private readonly invoices: SalesInvoicesService, private readonly unitOfWork: UnitOfWork) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId, user.id, user.permissions.includes('booking:approve'));
  }

  stock(user: SessionUser, warehouseId: string) {
    return this.store.stock(user.tenantId, warehouseId);
  }

  /** Posts the bill as a wholesale invoice. */
  async save(user: SessionUser, meta: RequestMeta, input: WholesaleBillInput): Promise<WholesaleInvoiceRef> {
    const o = await this.options(user);
    this.validate(o, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.heldBillId) {
        const h = await this.store.getHeld(user.tenantId, input.heldBillId);
        if (h?.status === 'HELD') await this.store.closeHeld(input.heldBillId, 'RECALLED');
      }
      return this.invoices.saveAndPost(user, meta, wholesaleInvoice(o, { ...input, branchId: input.branchId ?? null }, input.lines.map((l) => this.line(l))), true);
    });
    const inv = await this.invoices.get(user, id);
    return { id, docNo: inv.docNo, netAmount: inv.netAmount, customer: inv.customer.name };
  }

  heldBills(user: SessionUser) {
    return this.store.listHeld(user.tenantId);
  }

  async hold(user: SessionUser, meta: RequestMeta, input: WholesaleBillInput & { holdReason?: string }) {
    const o = await this.options(user);
    this.validate(o, input);
    const lines = input.lines.map((raw, i) => {
      const l = this.line(raw);
      const a = wsAmounts(o, l);
      return {
        lineNo: i + 1, itemId: l.itemId, unitsPerCtn: a.ctn, qtyCtn: l.qtyCtn, qtyLoose: l.qtyLoose, bonusQty: l.bonusQty ?? 0, schemeId: raw.schemeId ?? null, rate: l.rate,
        isManualRate: raw.isManualRate ?? false, discountPct: l.discountPct ?? 0, taxRate: l.taxRate, grossAmount: a.grossAmount, discountAmount: a.discountAmount, taxAmount: a.taxAmount, netAmount: a.netAmount,
      };
    });
    const sum = (k: 'grossAmount' | 'discountAmount' | 'taxAmount' | 'netAmount') => Math.round(lines.reduce((s, l) => s + l[k], 0) * 100) / 100;
    const schemeAmount = Math.round(lines.reduce((s, l) => s + l.bonusQty * l.rate, 0) * 100) / 100;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.heldBillId) {
        const h = await this.store.getHeld(user.tenantId, input.heldBillId);
        if (h?.status === 'HELD') await this.store.closeHeld(input.heldBillId, 'DISCARDED');
      }
      return this.store.save('heldBillAddUpdate', {
        docDate: input.docDate, customerId: input.customerId, routeId: input.routeId ?? null, salesmanEmployeeId: input.salesmanEmployeeId ?? null, warehouseId: input.warehouseId,
        branchId: input.branchId ?? null, priceTier: input.priceTier, rateEntryMode: 'PCS', holdReason: input.holdReason ?? 'MANUAL', lineCount: lines.length,
        totalCtn: lines.reduce((s, l) => s + l.qtyCtn, 0), totalLoose: lines.reduce((s, l) => s + l.qtyLoose, 0),
        grossAmount: sum('grossAmount'), discountAmount: sum('discountAmount'), taxAmount: sum('taxAmount'), netAmount: sum('netAmount'), schemeAmount,
        heldByUserId: user.id, remarks: input.remarks ?? null, lines,
      });
    });
    return this.held(user, id);
  }

  async held(user: SessionUser, id: string) {
    const h = await this.store.getHeld(user.tenantId, id);
    if (!h) throw new NotFoundError('Held bill not found');
    return h;
  }

  /** Recall: the bill comes back to the entry screen and leaves the held list. */
  async recall(user: SessionUser, meta: RequestMeta, id: string) {
    const h = await this.held(user, id);
    if (h.status !== 'HELD') throw new ConflictError('This held bill was already recalled or discarded.', undefined, { code: 'HELD_BILL_NOT_OPEN' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.closeHeld(id, 'RECALLED'));
    return this.held(user, id);
  }

  async discard(user: SessionUser, meta: RequestMeta, id: string) {
    await this.held(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.closeHeld(id, 'DISCARDED'));
  }

  // ---------------------------------------------------------------- helpers
  private line(l: WholesaleBillInput['lines'][number]): WsLine {
    return { itemId: l.itemId, qtyCtn: Number(l.qtyCtn ?? 0), qtyLoose: Number(l.qtyLoose ?? 0), bonusQty: Number(l.bonusQty ?? 0), rate: Number(l.rate), discountPct: Number(l.discountPct ?? 0), taxRate: Number(l.taxRate ?? 0) };
  }

  private validate(o: WholesaleOptions, p: WholesaleBillInput) {
    const e: Record<string, string> = {};
    if (!o.warehouses.some((w) => w.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (!o.tiers.some((t) => t.code === p.priceTier)) e.priceTier = 'Choose a price tier';
    if (p.routeId && !o.routes.some((r) => r.id === p.routeId)) e.routeId = 'Choose an active route';
    p.lines.forEach((l, i) => { if (!o.products.some((x) => x.id === l.itemId)) e[`lines.${i}.itemId`] = 'Choose an active product'; });
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
  }
}
