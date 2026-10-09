import { Injectable } from '@nestjs/common';
import type { SessionUser, WholesaleInvoiceRef, WholesaleQuery } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError } from '../../../../core/domain/errors.js';
import { SalesInvoicesService } from '../../../sales/invoices/application/sales-invoices.service.js';
import { WholesaleStore } from '../../common/application/wholesale-store.js';
import { errorInfo, wholesaleInvoice } from '../../common/application/wholesale-invoice.js';

/**
 * Back-orders: shortages from converted bookings wait for stock. A posted goods receipt line with free quantity is
 * allocated across waiting lines (oldest first / price-tier priority / pro-rata); allocated quantities are invoiced, one
 * WHOLESALE invoice per shop (from the receipt's warehouse and batch); the pending rest can be cancelled with a reason.
 */
@Injectable()
export class BackOrdersService {
  constructor(private readonly store: WholesaleStore, private readonly invoices: SalesInvoicesService, private readonly unitOfWork: UnitOfWork) {}

  list(user: SessionUser, q: WholesaleQuery) {
    return this.store.listBackOrders(user.tenantId, q);
  }

  incoming(user: SessionUser) {
    return this.store.incoming(user.tenantId);
  }

  async allocate(user: SessionUser, meta: RequestMeta, grnLineId: string, policy: string, ids: string[] | null) {
    const qty = await this.unitOfWork.run(actorContext(user, meta), () => this.store.allocate(grnLineId, policy, ids?.length ? ids : null));
    return { allocated: qty };
  }

  /** One invoice per shop for the allocated quantities of the selected lines. */
  async convert(user: SessionUser, meta: RequestMeta, ids: string[]) {
    const lines = (await this.store.getBackOrders(user.tenantId, ids)).filter((b) => b.allocatedQty > 0);
    if (!lines.length) throw new ConflictError('Allocate arriving stock to these back-orders before invoicing them.', undefined, { code: 'BACKORDER_NOTHING_ALLOCATED' });
    const o = await this.store.options(user.tenantId, user.id, true);
    const src = await this.store.allocationSource(user.tenantId, lines.map((l) => l.id));
    const invoices: WholesaleInvoiceRef[] = [];
    const failed: { customer: string; code: string | null; message: string }[] = [];
    const groups = new Map<string, typeof lines>();
    for (const l of lines) groups.set(`${l.customer.id}|${src.get(l.id)?.warehouseId ?? ''}`, [...(groups.get(`${l.customer.id}|${src.get(l.id)?.warehouseId ?? ''}`) ?? []), l]);
    for (const group of groups.values()) {
      const first = group[0]!;
      const s = src.get(first.id);
      try {
        await this.unitOfWork.run(actorContext(user, meta), async () => {
          const shop = o.shops.find((x) => x.customerId === first.customer.id);
          const invId = await this.invoices.saveAndPost(user, meta, wholesaleInvoice(o, {
            customerId: first.customer.id, docDate: new Date().toISOString().slice(0, 10), warehouseId: s!.warehouseId, branchId: s?.branchId ?? null,
            routeId: first.route?.id ?? null, priceTier: shop?.priceTier ?? 'RETAILER', remarks: 'Back-order delivery',
          }, group.map((l) => ({ itemId: l.item.id, qtyCtn: 0, qtyLoose: l.allocatedQty, rate: l.unitRate, taxRate: l.taxRate, batchId: src.get(l.id)?.batchId ?? null }))), true);
          for (const l of group) await this.store.backOrderInvoiced(l.id, invId);
          const inv = await this.invoices.get(user, invId);
          invoices.push({ id: invId, docNo: inv.docNo, netAmount: inv.netAmount, customer: first.customer.name });
        });
      } catch (e) {
        const { code, message } = errorInfo(e);
        failed.push({ customer: first.customer.name, code, message });
      }
    }
    return { invoices, failed };
  }

  async cancel(user: SessionUser, meta: RequestMeta, ids: string[], reason: string, note: string | null) {
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const id of ids) await this.store.cancelBackOrder(id, reason, note);
    });
    return { cancelled: ids.length };
  }
}
