import { Injectable } from '@nestjs/common';
import type { Grn, GrnInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PurchasingStore, type ListQuery } from '../../common/application/purchasing-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft goods receipt can be changed. Cancel a posted one instead.', undefined, { code: 'GRN_NOT_EDITABLE' });

/**
 * Goods received notes: receive accepted / rejected quantities against an approved PO (or without one) into a
 * warehouse. Posting (database goodsReceivedNotePost) moves stock in, resolves batches and posts Dr inventory / Cr GRNI
 * (imports wait for landed cost); cancelling reverses both while nothing is billed.
 */
@Injectable()
export class GrnsService {
  constructor(
    private readonly store: PurchasingStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: ListQuery) {
    return this.store.listGrns(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<Grn> {
    const g = await this.store.getGrn(user.tenantId, id);
    if (!g) throw new NotFoundError('Goods receipt not found');
    return g;
  }

  async create(user: SessionUser, meta: RequestMeta, input: GrnInput) {
    const data = await this.payload(user, input, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('goodsReceivedNoteAddUpdate', data));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: GrnInput & { rowVersion: number }) {
    const g = await this.current(user, id, input.rowVersion);
    if (g.status !== 'DRAFT') throw notEditable();
    const known = new Set(g.lines.map((l) => l.id));
    const data = await this.payload(user, { ...input, lines: input.lines.map((l) => (l.id && known.has(l.id) ? l : { ...l, id: null })) }, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('goodsReceivedNoteAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const g = await this.current(user, id, rowVersion);
    if (g.status !== 'DRAFT') throw notEditable();
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('grn', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This goods receipt was changed. Reload and try again.');
  }

  /** Stock in + Dr inventory / Cr GRNI; 409 OVER_RECEIPT, GRN_PO_NOT_OPEN, 400 BATCH_REQUIRED from the database. */
  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const g = await this.current(user, id, rowVersion);
    if (g.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('goodsReceivedNotePost', id));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const g = await this.current(user, id, rowVersion);
    if (g.status === 'CANCELLED') return g;
    if (g.lines.some((l) => l.billedQty > 0)) throw new ConflictError('This goods receipt is already billed; void the bill first.', undefined, { code: 'GRN_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('goodsReceivedNoteCancel', id, reason));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private async payload(user: SessionUser, p: GrnInput, selfId: string | null) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    const wh = o.warehouses.find((x) => x.id === p.warehouseId);
    if (!wh) e.warehouseId = 'Choose an active warehouse';
    if (!o.vendors.some((x) => x.id === p.vendorId)) e.vendorId = 'Choose an active vendor';
    const po = p.purchaseOrderId ? await this.store.getOrder(user.tenantId, p.purchaseOrderId) : null;
    if (p.purchaseOrderId && !po) e.purchaseOrderId = 'Purchase order not found';
    if (Object.keys(e).length) throw v(e);
    if (po) {
      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) throw new ConflictError(`Purchase order ${po.docNo} is ${po.status.toLowerCase().replace('_', ' ')}; goods can only be received against an approved, open order.`, undefined, { code: 'GRN_PO_NOT_OPEN' });
      if (po.vendor.id !== p.vendorId) throw v({ vendorId: `Purchase order ${po.docNo} is from ${po.vendor.name}` });
    }
    const branchId = po?.branch.id ?? wh?.branchId ?? p.branchId;
    if (!branchId) throw v({ branchId: 'Choose the branch receiving the goods' });

    const lines = p.lines.map((l, i) => {
      const item = o.products.find((x) => x.id === l.itemId);
      if (!item) e[`lines.${i}.itemId`] = 'Choose an active product';
      if (l.rejectedQty > 0 && !o.rejectReasons.some((x) => x.code === l.rejectReason)) e[`lines.${i}.rejectReason`] = 'Choose why it was rejected';
      let orderedQty = l.orderedQty;
      let prevReceivedQty = l.prevReceivedQty;
      let unitCost = l.unitCost;
      if (l.purchaseOrderLineId) {
        const pl = po?.lines.find((x) => x.id === l.purchaseOrderLineId);
        if (!pl) e[`lines.${i}.purchaseOrderLineId`] = 'Not a line of this purchase order';
        else {
          if (pl.item?.id !== l.itemId) e[`lines.${i}.itemId`] = 'Not the product ordered on this line';
          orderedQty = pl.baseQty + pl.bonusQty;
          prevReceivedQty = pl.receivedQty;
          unitCost = orderedQty > 0 ? r4(pl.netAmount / orderedQty) : 0;
          if (l.acceptedQty > pl.openQty + 0.0001) {
            throw new ConflictError(`Line ${i + 1}: ${l.acceptedQty} accepted but only ${pl.openQty} is still open on ${po!.docNo}.`, { [`lines.${i}.acceptedQty`]: ['More than is still open on the order'] }, { code: 'OVER_RECEIPT' });
          }
        }
      }
      return {
        ...(l.id && { id: l.id }), lineNo: i + 1, purchaseOrderLineId: l.purchaseOrderLineId, itemId: l.itemId, orderedQty, prevReceivedQty,
        receivedQty: r4(l.acceptedQty + l.rejectedQty), acceptedQty: l.acceptedQty, rejectedQty: l.rejectedQty, rejectReason: l.rejectedQty > 0 ? l.rejectReason : null,
        batchNo: l.batchNo, expiryDate: l.expiryDate, unitCost, acceptedAmount: r2(l.acceptedQty * unitCost), rejectedAmount: r2(l.rejectedQty * unitCost),
      };
    });
    if (Object.keys(e).length) throw v(e);
    void selfId;
    return {
      docDate: p.docDate, purchaseOrderId: p.purchaseOrderId, vendorId: p.vendorId, branchId, warehouseId: p.warehouseId, vendorRef: p.vendorRef, qcNote: p.qcNote,
      qcStatus: lines.some((l) => l.rejectedQty > 0) ? 'PARTIAL_REJECT' : 'PASSED', isImport: p.isImport, remarks: p.remarks,
      receivedQty: r4(lines.reduce((s, l) => s + l.receivedQty, 0)), acceptedAmount: r2(lines.reduce((s, l) => s + l.acceptedAmount, 0)), rejectedAmount: r2(lines.reduce((s, l) => s + l.rejectedAmount, 0)),
      lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const g = await this.get(user, id);
    if (g.rowVersion !== rowVersion) throw new ConcurrencyError('This goods receipt was changed. Reload and try again.');
    return g;
  }
}
