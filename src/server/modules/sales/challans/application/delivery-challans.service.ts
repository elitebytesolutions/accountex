import { Injectable } from '@nestjs/common';
import type { ChallanInput, DeliveryChallan, SalesQuery, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { invalid } from '../../common/application/sales-lines.js';
import { SalesStore } from '../../common/application/sales-store.js';

const notEditable = () => new ConflictError('Only a packed challan can be changed or dispatched.', undefined, { code: 'CHALLAN_NOT_EDITABLE' });

/**
 * Delivery challans against a confirmed sales order: packed (editable) → dispatched (stock leaves the warehouse at cost,
 * Dr goods delivered not invoiced / Cr inventory; order delivered quantities and reservations follow) → delivered (POD)
 * → invoiced when its sales invoice posts. Cancelling a dispatched challan reverses stock, journal and the order roll-up.
 */
@Injectable()
export class DeliveryChallansService {
  constructor(private readonly store: SalesStore, private readonly unitOfWork: UnitOfWork) {}

  list(user: SessionUser, q: SalesQuery) {
    return this.store.listChallans(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<DeliveryChallan> {
    const dc = await this.store.getChallan(user.tenantId, id);
    if (!dc) throw new NotFoundError('Delivery challan not found');
    return dc;
  }

  async create(user: SessionUser, meta: RequestMeta, input: ChallanInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('deliveryChallanAddUpdate', data));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ChallanInput & { rowVersion: number }) {
    const dc = await this.current(user, id, input.rowVersion);
    if (dc.status !== 'PACKED') throw notEditable();
    if (dc.salesOrder.id !== input.salesOrderId) throw invalid({ salesOrderId: 'A challan stays on its sales order; create a new challan instead' });
    const data = await this.payload(user, input, dc);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('deliveryChallanAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const dc = await this.current(user, id, rowVersion);
    if (dc.status !== 'PACKED') throw new ConflictError('Only a packed challan can be deleted; cancel a dispatched one instead.', undefined, { code: 'CHALLAN_NOT_EDITABLE' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('challan', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This challan was changed. Reload and try again.');
  }

  async dispatch(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('deliveryChallanDispatch', id));
    return this.get(user, id);
  }

  async deliver(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, receivedBy: string | null) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.run('deliveryChallanDeliver', id);
      if (receivedBy) await this.store.set('challan', user.tenantId, id, { receivedBy });
    });
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const dc = await this.current(user, id, rowVersion);
    if (dc.status === 'CANCELLED') return dc;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('deliveryChallanCancel', id, reason));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  /** Lines from the order's open lines: ordered, previously delivered (other live challans), deliver now ≤ pending. */
  private async payload(user: SessionUser, p: ChallanInput, existing?: DeliveryChallan) {
    const [so, o] = await Promise.all([this.store.getOrder(user.tenantId, p.salesOrderId), this.store.options(user.tenantId)]);
    if (!so) throw invalid({ salesOrderId: 'Choose a sales order' });
    if (!['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(so.status)) throw new ConflictError('Goods can only be delivered against a confirmed, open sales order.', undefined, { code: 'CHALLAN_ORDER_NOT_OPEN' });
    const warehouseId = p.warehouseId ?? so.warehouse?.id ?? null;
    const e: Record<string, string> = {};
    if (!warehouseId || !o.warehouses.some((w) => w.id === warehouseId)) e.warehouseId = 'Choose the warehouse the goods leave from';
    if (p.vehicleId && !o.vans.some((v) => v.id === p.vehicleId)) e.vehicleId = 'Choose an active vehicle';
    const packed = existing ? new Map(existing.lines.map((l) => [l.salesOrderLineId, l])) : new Map();
    const lines = p.lines.filter((l) => Number(l.qty) > 0).map((l, i) => {
      const ol = so.lines.find((x) => x.id === l.salesOrderLineId);
      if (!ol || !ol.item) { e[`lines.${i}.salesOrderLineId`] = 'Not a product line of this order'; return null; }
      const ordered = ol.baseQty + ol.bonusQty;
      const previously = ol.deliveredQty ?? 0;
      const qty = Number(l.qty);
      if (qty > ordered - previously + 0.0005) e[`lines.${i}.qty`] = `Only ${ordered - previously} still to deliver`;
      const mine = packed.get(l.salesOrderLineId);
      return {
        ...(mine && { id: mine.id }), lineNo: i + 1, salesOrderLineId: ol.id, itemId: ol.item.id, batchId: l.batchId ?? null,
        orderedQty: ordered, previouslyDeliveredQty: previously, qtyCtn: 0, qtyLoose: qty, ctnFactor: 1, baseQty: qty,
      };
    });
    if (Object.keys(e).length) throw invalid(e);
    return {
      docDate: p.docDate, salesOrderId: so.id, customerId: so.customer.id, branchId: so.branch?.id ?? null, warehouseId, vehicleId: p.vehicleId ?? null,
      vehicleNo: p.vehicleNo, driverName: p.driverName ?? null, deliverySlot: p.deliverySlot ?? null, remarks: p.remarks ?? null,
      totalQty: lines.reduce((s, l) => s + (l?.baseQty ?? 0), 0), lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const dc = await this.get(user, id);
    if (dc.rowVersion !== rowVersion) throw new ConcurrencyError('This challan was changed. Reload and try again.');
    return dc;
  }
}
