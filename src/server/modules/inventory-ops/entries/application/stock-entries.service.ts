import { Injectable } from '@nestjs/common';
import type { SessionUser, StockEntry, StockEntryInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { StockOpsStore, type OpsQuery } from '../../common/application/stock-ops-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>, code?: string) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])), code ? { code } : undefined);
const notEditable = () => new ConflictError('Only a draft can be changed. Cancel a posted document instead.', undefined, { code: 'STOCK_DOC_NOT_EDITABLE' });

/**
 * Manual stock in / out with a movement reason. Posting (database stockInOutEntryPost) moves the stock (new batches for
 * stock in, earliest-expiry first for stock out) and posts inventory against the reason's account. Cancel reverses.
 */
@Injectable()
export class StockEntriesService {
  constructor(
    private readonly store: StockOpsStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: OpsQuery) {
    return this.store.listEntries(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<StockEntry> {
    const e = await this.store.getEntry(user.tenantId, id);
    if (!e) throw new NotFoundError('Stock entry not found');
    return e;
  }

  async create(user: SessionUser, meta: RequestMeta, input: StockEntryInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('stockInOutEntryAddUpdate', { ...data, enteredByUserId: user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: StockEntryInput & { rowVersion: number }) {
    const e = await this.current(user, id, input.rowVersion);
    if (e.status !== 'DRAFT') throw notEditable();
    const data = await this.payload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('stockInOutEntryAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const e = await this.current(user, id, rowVersion);
    if (e.status !== 'DRAFT') throw notEditable();
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('entry', user.tenantId, id, rowVersion)))) throw new ConcurrencyError('This entry was changed. Reload and try again.');
  }

  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const e = await this.current(user, id, rowVersion);
    if (e.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('stockInOutEntryPost', id));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const e = await this.current(user, id, rowVersion);
    if (e.status === 'CANCELLED') return e;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('stockInOutEntryCancel', id, reason));
    return this.get(user, id);
  }

  private async payload(user: SessionUser, p: StockEntryInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    const wh = o.warehouses.find((x) => x.id === p.warehouseId);
    if (!wh) e.warehouseId = 'Choose an active warehouse';
    if (p.binId && !wh?.bins.some((b) => b.id === p.binId)) e.binId = 'Not a bin of this warehouse';
    const reason = o.reasons.find((x) => x.id === p.reasonId);
    if (!reason || reason.direction !== p.mode) e.reasonId = `Choose a stock-${p.mode === 'IN' ? 'in' : 'out'} reason`;
    let batchMissing = false;
    const lines = p.lines.map((l, i) => {
      const item = o.products.find((x) => x.id === l.itemId);
      if (!item) e[`lines.${i}.itemId`] = 'Choose an active product';
      else if (p.mode === 'IN' && item.trackExpiry && !l.batchId && (!l.newBatchNo || !l.newExpiryDate)) { e[`lines.${i}.newBatchNo`] = 'Enter the batch no. and expiry'; batchMissing = true; }
      const unitCost = p.mode === 'IN' ? (l.unitCost || item?.avgCost || 0) : item?.avgCost ?? 0;
      return { lineNo: i + 1, itemId: l.itemId, batchId: l.batchId, newBatchNo: p.mode === 'IN' ? l.newBatchNo : null, newExpiryDate: p.mode === 'IN' ? l.newExpiryDate : null, qty: l.qty, unitCost };
    });
    if (Object.keys(e).length) throw v(e, batchMissing && Object.keys(e).length === 1 ? 'BATCH_REQUIRED' : undefined);
    return {
      mode: p.mode, docDate: p.docDate, warehouseId: p.warehouseId, binId: p.binId, reasonId: p.reasonId, manualRef: p.manualRef, requestedByName: p.requestedByName, notes: p.notes,
      totalItems: new Set(lines.map((l) => l.itemId)).size, totalQty: lines.reduce((s, l) => s + l.qty, 0), totalValue: r2(lines.reduce((s, l) => s + l.qty * l.unitCost, 0)),
      lines,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const e = await this.get(user, id);
    if (e.rowVersion !== rowVersion) throw new ConcurrencyError('This entry was changed. Reload and try again.');
    return e;
  }
}
