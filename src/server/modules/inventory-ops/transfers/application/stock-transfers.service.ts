import { Injectable } from '@nestjs/common';
import type { SessionUser, StockTransfer, TransferInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { StockOpsStore, type OpsQuery } from '../../common/application/stock-ops-store.js';

const IN_TRANSIT = ['POSTED', 'DISPATCHED', 'IN_TRANSIT'];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft transfer can be changed. Cancel a dispatched one instead.', undefined, { code: 'STOCK_DOC_NOT_EDITABLE' });

/**
 * Stock transfers between warehouses, in two steps. Dispatch (database stockTransferPost) takes the stock out of the
 * sending warehouse into stock in transit; receipt (stockTransferReceive) brings in what arrived; short or excess
 * quantities go to stock loss / gain. Cancel reverses both.
 */
@Injectable()
export class StockTransfersService {
  constructor(
    private readonly store: StockOpsStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: OpsQuery) {
    return this.store.listTransfers(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<StockTransfer> {
    const t = await this.store.getTransfer(user.tenantId, id);
    if (!t) throw new NotFoundError('Transfer not found');
    return t;
  }

  async create(user: SessionUser, meta: RequestMeta, input: TransferInput) {
    const { header, lines } = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = await this.store.save('stockTransferAddUpdate', { ...header, preparedByUserId: user.id });
      await this.store.setTransferLines(user.tenantId, id, input.fromWarehouseId, input.toWarehouseId, lines);
      return id;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: TransferInput & { rowVersion: number }) {
    const t = await this.current(user, id, input.rowVersion);
    if (t.status !== 'DRAFT') throw notEditable();
    const { header, lines } = await this.payload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save('stockTransferAddUpdate', { ...header, id, rowVersion: input.rowVersion });
      await this.store.setTransferLines(user.tenantId, id, input.fromWarehouseId, input.toWarehouseId, lines);
    });
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const t = await this.current(user, id, rowVersion);
    if (t.status !== 'DRAFT') throw notEditable();
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('transfer', user.tenantId, id, rowVersion)))) throw new ConcurrencyError('This transfer was changed. Reload and try again.');
  }

  /** Stock leaves the sending warehouse (409 STOCK_INSUFFICIENT from the database when it isn't there). */
  async dispatch(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const t = await this.current(user, id, rowVersion);
    if (t.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set('transfer', user.tenantId, id, { dispatchedAt: new Date() });
      await this.store.run('stockTransferPost', id);
    });
    return this.get(user, id);
  }

  /** Records what arrived per line (default: everything sent) and brings it into the receiving warehouse. */
  async receive(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; note: string | null; lines: { transferLineId: string; receivedQty: number; note: string | null }[] }) {
    const t = await this.current(user, id, p.rowVersion);
    if (!IN_TRANSIT.includes(t.status)) throw new ConflictError('Only a dispatched transfer can be received.', undefined, { code: 'TRANSFER_NOT_DISPATCHED' });
    const bad = p.lines.find((l) => !t.lines.some((x) => x.id === l.transferLineId));
    if (bad) throw v({ lines: 'Not a line of this transfer' });
    const receiptLines = t.lines.map((l) => {
      const r = p.lines.find((x) => x.transferLineId === l.id);
      return { transferLineId: l.id, sentQty: l.baseQty, receivedQty: r ? r.receivedQty : l.baseQty, note: r?.note ?? null, receivedAt: new Date().toISOString(), receivedByUserId: user.id };
    });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.saveReceipt(user.tenantId, id, receiptLines);
      // receivedAt first: a RECEIVED transfer needs it (stockTransferReceivedChk)
      await this.store.set('transfer', user.tenantId, id, { receivedAt: new Date(), receivedByUserId: user.id, receiptNote: p.note });
      await this.store.run('stockTransferReceive', id);
    });
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const t = await this.current(user, id, rowVersion);
    if (t.status === 'CANCELLED') return t;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('stockTransferCancel', id, reason));
    return this.get(user, id);
  }

  private async payload(user: SessionUser, p: TransferInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    const from = o.warehouses.find((x) => x.id === p.fromWarehouseId);
    const to = o.warehouses.find((x) => x.id === p.toWarehouseId);
    if (!from) e.fromWarehouseId = 'Choose an active warehouse';
    if (!to) e.toWarehouseId = 'Choose an active warehouse';
    const lines = p.lines.map((l, i) => {
      const item = o.products.find((x) => x.id === l.itemId);
      if (!item) e[`lines.${i}.itemId`] = 'Choose an active product';
      if (l.fromBinId && !from?.bins.some((b) => b.id === l.fromBinId)) e[`lines.${i}.fromBinId`] = 'Not a bin of the sending warehouse';
      if (l.toBinId && !to?.bins.some((b) => b.id === l.toBinId)) e[`lines.${i}.toBinId`] = 'Not a bin of the receiving warehouse';
      return { itemId: l.itemId, batchId: l.batchId, fromBinId: l.fromBinId, toBinId: l.toBinId, ctnSize: item?.ctn || 1, qtyCtn: l.qtyCtn, qtyLoose: l.qtyLoose, unitCost: item?.avgCost ?? 0 };
    });
    if (Object.keys(e).length) throw v(e);
    const qty = (l: (typeof lines)[number]) => l.qtyCtn * l.ctnSize + l.qtyLoose;
    return {
      header: {
        docDate: p.docDate, transferAt: new Date().toISOString(), fromWarehouseId: p.fromWarehouseId, toWarehouseId: p.toWarehouseId, carrier: p.carrier, driverName: p.driverName,
        vehicleNo: p.vehicleNo, etaAt: p.etaAt, remarks: p.remarks, totalItems: new Set(lines.map((l) => l.itemId)).size, totalQty: lines.reduce((s, l) => s + qty(l), 0),
        totalValue: r2(lines.reduce((s, l) => s + qty(l) * l.unitCost, 0)),
      },
      lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.get(user, id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('This transfer was changed. Reload and try again.');
    return t;
  }
}
