import { Injectable } from '@nestjs/common';
import type { CountInput, SessionUser, StockCount } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { StockOpsStore, type OpsQuery } from '../../common/application/stock-ops-store.js';

const COUNTING = ['COUNTING', 'VARIANCE_REVIEW'];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * Stock counts: scope (warehouse, classes, ABC-A only) → freeze (snapshot of book quantities) → enter counts (blind:
 * counters don't see the book quantity) → approve by someone else (database stockCountApprove posts the variance as
 * COUNT movements, shortage / excess against stock loss / gain). Cancel reverses an approved count.
 */
@Injectable()
export class StockCountsService {
  constructor(
    private readonly store: StockOpsStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: OpsQuery) {
    return this.store.listCounts(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<StockCount> {
    const c = await this.store.getCount(user.tenantId, id);
    if (!c) throw new NotFoundError('Stock count not found');
    // blind count: counters don't see the book quantity until it is reviewed
    if (c.isBlind && c.status === 'COUNTING' && !user.permissions.includes('cnt:approve')) {
      return { ...c, lines: c.lines.map((l) => ({ ...l, expectedQty: null, varianceQty: null, varianceValue: null })) };
    }
    return c;
  }

  async create(user: SessionUser, meta: RequestMeta, input: CountInput) {
    const o = await this.store.options(user.tenantId);
    if (!o.warehouses.some((x) => x.id === input.warehouseId)) throw v({ warehouseId: 'Choose an active warehouse' });
    if (input.scopeClassIds.some((c) => !o.classes.some((x) => x.id === c))) throw v({ scopeClassIds: 'Choose existing classes' });
    const label = [input.scopeClassIds.length ? o.classes.filter((c) => input.scopeClassIds.includes(c.id)).map((c) => c.name).join(', ') : 'All classes', input.abcAOnly ? 'A items only' : null].filter(Boolean).join(' · ');
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('stockCountAddUpdate', {
      name: input.name, docDate: input.docDate, warehouseId: input.warehouseId, scopeClassIds: input.scopeClassIds, scopeLabel: label, abcAOnly: input.abcAOnly, isBlind: input.isBlind, ownerUserId: user.id,
    }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.current(user, id, rowVersion);
    if (c.status !== 'DRAFT') throw new ConflictError('Only a count that isn’t frozen can be deleted; cancel it instead.', undefined, { code: 'STOCK_DOC_NOT_EDITABLE' });
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('count', user.tenantId, id, rowVersion)))) throw new ConcurrencyError('This count was changed. Reload and try again.');
  }

  /** Snapshots the book quantity of every item / batch in scope; counting starts. */
  async freeze(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.current(user, id, rowVersion);
    if (c.status !== 'DRAFT') throw new ConflictError('This count is already frozen.', undefined, { code: 'STOCK_DOC_NOT_EDITABLE' });
    const [o, stock, row] = await Promise.all([this.store.options(user.tenantId), this.store.onHand(user.tenantId, c.warehouse.id), this.store.getCount(user.tenantId, id)]);
    const scope = { classIds: await this.store.countScope(user.tenantId, id) };
    const inScope = stock.filter((s) => {
      const p = o.products.find((x) => x.id === s.itemId);
      return p && (!scope.classIds.length || (p.productClassId && scope.classIds.includes(p.productClassId))) && (!row!.abcAOnly || p.abcClass === 'A');
    });
    if (!inScope.length) throw new ConflictError('Nothing in stock matches this count’s scope.');
    const lines = inScope.map((s, i) => ({ lineNo: i + 1, itemId: s.itemId, batchId: s.batchId, expectedQty: s.qtyOnHand, unitCost: s.unitCost, wasUncounted: false }));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save('stockCountAddUpdate', { id, rowVersion, lines });
      await this.store.set('count', user.tenantId, id, { status: 'COUNTING', frozenAt: new Date(), lineCount: lines.length, countedCount: 0 });
    });
    return this.get(user, id);
  }

  /** Counted quantities (null = not counted yet) with a variance reason. */
  async enter(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; lines: { id: string; countedQty: number | null; reason: string | null }[] }) {
    const c = await this.store.getCount(user.tenantId, id);
    if (!c) throw new NotFoundError('Stock count not found');
    if (c.rowVersion !== p.rowVersion) throw new ConcurrencyError('This count was changed. Reload and try again.');
    if (!COUNTING.includes(c.status)) throw new ConflictError(c.status === 'DRAFT' ? 'Freeze the count before entering counts.' : 'This count is closed.', undefined, { code: c.status === 'DRAFT' ? 'COUNT_NOT_FROZEN' : 'STOCK_DOC_NOT_EDITABLE' });
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    p.lines.forEach((l, i) => {
      if (!c.lines.some((x) => x.id === l.id)) e[`lines.${i}.id`] = 'Not a line of this count';
      if (l.reason && !o.countReasons.some((x) => x.code === l.reason)) e[`lines.${i}.reason`] = 'Choose a reason';
    });
    if (Object.keys(e).length) throw v(e);
    const now = new Date().toISOString();
    const merged = c.lines.map((l) => {
      const n = p.lines.find((x) => x.id === l.id);
      const counted = n ? n.countedQty : l.countedQty;
      return { id: l.id, countedQty: counted, reason: n ? n.reason : l.reason, ...(n && { countedAt: now, countedByUserId: user.id }), expected: l.expectedQty ?? 0, cost: l.unitCost };
    });
    const variance = merged.filter((l) => l.countedQty !== null).map((l) => r2((l.countedQty! - l.expected) * l.cost));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.setCountLines(user.tenantId, id, merged.map(({ expected, cost, ...l }) => { void expected; void cost; return l; }));
      await this.store.set('count', user.tenantId, id, {
        countedCount: merged.filter((l) => l.countedQty !== null).length,
        shortageValue: -r2(variance.filter((x) => x < 0).reduce((s, x) => s + x, 0)), excessValue: r2(variance.filter((x) => x > 0).reduce((s, x) => s + x, 0)),
        status: merged.every((l) => l.countedQty !== null) ? 'VARIANCE_REVIEW' : 'COUNTING',
      });
    });
    return this.get(user, id);
  }

  /** Posts the variance; the preparer can't approve their own count (APPROVAL_SELF). */
  async approve(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, comment: string | null) {
    const c = await this.current(user, id, rowVersion);
    if (!COUNTING.includes(c.status)) throw new ConflictError(c.status === 'DRAFT' ? 'Freeze and count before approving.' : 'This count is closed.', undefined, { code: c.status === 'DRAFT' ? 'COUNT_NOT_FROZEN' : 'STOCK_DOC_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set('count', user.tenantId, id, { approverUserId: user.id });
      await this.store.run('stockCountApprove', id, comment);
    });
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const c = await this.current(user, id, rowVersion);
    if (c.status === 'CANCELLED') return c;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('stockCountCancel', id, reason));
    return this.get(user, id);
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.store.getCount(user.tenantId, id);
    if (!c) throw new NotFoundError('Stock count not found');
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('This count was changed. Reload and try again.');
    return c;
  }
}
