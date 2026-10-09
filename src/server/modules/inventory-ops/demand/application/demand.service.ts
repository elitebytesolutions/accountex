import { Injectable } from '@nestjs/common';
import { bumpPrice, type DemandInput, type PriceUpdateInput, type PrincipalClaimInput, type SessionUser, type TargetInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PurchaseOrdersService } from '../../../purchasing/orders/application/purchase-orders.service.js';
import { StockOpsStore } from '../../common/application/stock-ops-store.js';
import { StockDemandStore, type DemandQuery } from './stock-demand-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const changed = () => new ConcurrencyError('This record was changed. Reload and try again.');

/**
 * Goods demand (what to buy, generated from reorder levels, converted into a draft PO), principal claims and targets,
 * and bulk price updates (preview → apply → undo, every change in ProductPriceLogs).
 */
@Injectable()
export class DemandService {
  constructor(
    private readonly store: StockDemandStore,
    private readonly ops: StockOpsStore,
    private readonly orders: PurchaseOrdersService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // ---------------------------------------------------------------- goods demand
  listDemands(user: SessionUser, q: DemandQuery) {
    return this.store.listDemands(user.tenantId, q);
  }

  async getDemand(user: SessionUser, id: string) {
    const d = await this.store.getDemand(user.tenantId, id);
    if (!d) throw new NotFoundError('Demand not found');
    return d;
  }

  /** A draft demand for everything the vendor supplies that is below its reorder level (up to the high level). */
  async generate(user: SessionUser, meta: RequestMeta, p: { vendorId: string; manufacturerId: string; notes: string | null }) {
    const needs = await this.store.reorderNeeds(user.tenantId, p.vendorId, p.manufacturerId);
    if (!needs.length) throw new ConflictError('Nothing from this company is below its reorder level for this vendor.', undefined, { code: 'DEMAND_NOTHING_TO_ORDER' });
    const lines = needs.map((n) => ({ itemId: n.itemId, qtyCtn: 0, baseQty: Math.max(1, n.highLevel - n.onHand), bonusQty: 0, rate: n.rate, discountPct: 0 }));
    return this.createDemand(user, meta, { docDate: today(), vendorId: p.vendorId, manufacturerId: p.manufacturerId, notes: p.notes, lines }, 'REORDER');
  }

  async createDemand(user: SessionUser, meta: RequestMeta, input: DemandInput, source: 'MANUAL' | 'REORDER' = 'MANUAL') {
    const data = await this.demandPayload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('goodsDemandAddUpdate', { ...data, source, preparedByUserId: user.id }));
    return this.getDemand(user, id);
  }

  async updateDemand(user: SessionUser, meta: RequestMeta, id: string, input: DemandInput & { rowVersion: number }) {
    const d = await this.getDemand(user, id);
    if (d.rowVersion !== input.rowVersion) throw changed();
    if (!['DRAFT', 'SAVED'].includes(d.status)) throw new ConflictError('This demand is already ordered.', undefined, { code: 'DEMAND_ALREADY_ORDERED' });
    const data = await this.demandPayload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('goodsDemandAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.getDemand(user, id);
  }

  async removeDemand(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('demand', user.tenantId, id, rowVersion)))) throw new ConflictError('Only an open demand can be deleted.', undefined, { code: 'DEMAND_ALREADY_ORDERED' });
  }

  async cancelDemand(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const d = await this.getDemand(user, id);
    if (d.rowVersion !== rowVersion) throw changed();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('goodsDemandCancel', id, reason));
    return this.getDemand(user, id);
  }

  /** Creates a draft purchase order for the demand's vendor (normal PO approval applies) and marks the demand ordered. */
  async convertToPo(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; branchId: string; warehouseId: string | null; expectedDate: string | null }) {
    const d = await this.getDemand(user, id);
    if (d.rowVersion !== p.rowVersion) throw changed();
    if (!['DRAFT', 'SAVED'].includes(d.status)) throw new ConflictError('This demand is already ordered or cancelled.', undefined, { code: 'DEMAND_ALREADY_ORDERED' });
    if (!d.vendor) throw v({ vendorId: 'The demand has no vendor' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      const po = await this.orders.create(user, meta, {
        docDate: today(), vendorId: d.vendor!.id, branchId: p.branchId, warehouseId: p.warehouseId, expectedDate: p.expectedDate, paymentTerms: 'NET_30', creditDays: 30,
        costCentreId: null, departmentId: null, projectId: null, buyerUserId: user.id, remarks: `From demand ${d.docNo}`,
        lines: d.lines.map((l) => ({ id: null, itemId: l.item.id, description: null, accountId: null, qtyCtn: 0, qtyLoose: l.baseQty, bonusQty: l.bonusQty, rate: l.rate, discountPct: l.discountPct, taxCodeId: null, taxRate: 0, costCentreId: null, remarks: null })),
      });
      // the PO link first: an ORDERED demand needs it (demandOrderedChk)
      await this.store.set('demand', user.tenantId, id, { purchaseOrderId: po.id, orderedAt: new Date() });
      await this.store.run('goodsDemandOrder', id);
    });
    return this.getDemand(user, id);
  }

  private async demandPayload(user: SessionUser, p: DemandInput) {
    const [o, d] = await Promise.all([this.ops.options(user.tenantId), this.store.options(user.tenantId)]);
    const e: Record<string, string> = {};
    if (!d.vendors.some((x) => x.id === p.vendorId)) e.vendorId = 'Choose an active vendor';
    if (!d.companies.some((x) => x.id === p.manufacturerId)) e.manufacturerId = 'Choose an active company';
    const lines = p.lines.map((l, i) => {
      const item = o.products.find((x) => x.id === l.itemId);
      if (!item) e[`lines.${i}.itemId`] = 'Choose an active product';
      return { lineNo: i + 1, itemId: l.itemId, manufacturerId: p.manufacturerId, ctnSize: item?.ctn || 1, qtyCtn: l.qtyCtn, baseQty: l.baseQty, bonusQty: l.bonusQty, rate: l.rate, discountPct: l.discountPct };
    });
    if (Object.keys(e).length) throw v(e);
    const gross = r2(lines.reduce((s, l) => s + l.baseQty * l.rate, 0));
    const disc = r2(lines.reduce((s, l) => s + r2((l.baseQty * l.rate * l.discountPct) / 100), 0));
    return {
      docDate: p.docDate, manufacturerId: p.manufacturerId, vendorId: p.vendorId, notes: p.notes, totalItems: lines.length, totalQty: lines.reduce((s, l) => s + l.baseQty, 0),
      totalBonus: lines.reduce((s, l) => s + l.bonusQty, 0), grossAmount: gross, discountAmount: disc, netAmount: r2(gross - disc), lines,
    };
  }

  // ---------------------------------------------------------------- principal claims
  listClaims(user: SessionUser, q: DemandQuery) {
    return this.store.listClaims(user.tenantId, q);
  }

  async getClaim(user: SessionUser, id: string) {
    const c = await this.store.getClaim(user.tenantId, id);
    if (!c) throw new NotFoundError('Claim not found');
    return c;
  }

  async createClaim(user: SessionUser, meta: RequestMeta, input: PrincipalClaimInput) {
    await this.checkClaim(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => this.store.save('principalClaimAddUpdate', { ...input, claimNo: await this.store.nextNo('CLM', input.claimDate) }));
    return this.getClaim(user, id);
  }

  async updateClaim(user: SessionUser, meta: RequestMeta, id: string, input: PrincipalClaimInput & { rowVersion: number }) {
    const c = await this.getClaim(user, id);
    if (c.rowVersion !== input.rowVersion) throw changed();
    if (c.status !== 'PENDING') throw new ConflictError('Only a pending claim can be changed.', undefined, { code: 'PRINCIPAL_CLAIM_NOT_EDITABLE' });
    await this.checkClaim(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('principalClaimAddUpdate', { ...input, id }));
    return this.getClaim(user, id);
  }

  async removeClaim(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('claim', user.tenantId, id, rowVersion)))) throw new ConflictError('Only a pending claim can be deleted.', undefined, { code: 'PRINCIPAL_CLAIM_NOT_EDITABLE' });
  }

  async submitClaim(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const c = await this.getClaim(user, id);
    if (c.rowVersion !== rowVersion) throw changed();
    if (c.status !== 'PENDING') throw new ConflictError('Only a pending claim can be submitted.', undefined, { code: 'PRINCIPAL_CLAIM_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.set('claim', user.tenantId, id, { status: 'SUBMITTED', submittedAt: new Date() }));
    return this.getClaim(user, id);
  }

  /** Settled (amount received / credited, optional debit-note link) or rejected by the principal. */
  async settleClaim(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; settledDate: string; settledAmount: number; debitNoteId: string | null; rejected: boolean; remarks: string | null }) {
    const c = await this.getClaim(user, id);
    if (c.rowVersion !== p.rowVersion) throw changed();
    if (c.status !== 'SUBMITTED') throw new ConflictError('Only a submitted claim can be settled.', undefined, { code: 'PRINCIPAL_CLAIM_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.set('claim', user.tenantId, id, {
      status: p.rejected ? 'REJECTED' : 'SETTLED', settledDate: new Date(p.settledDate), settledAmount: p.rejected ? 0 : p.settledAmount, debitNoteId: p.debitNoteId, ...(p.remarks && { remarks: p.remarks }),
    }));
    return this.getClaim(user, id);
  }

  async cancelClaim(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const c = await this.getClaim(user, id);
    if (c.rowVersion !== rowVersion) throw changed();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('principalClaimCancel', id, reason));
    return this.getClaim(user, id);
  }

  private async checkClaim(user: SessionUser, p: PrincipalClaimInput) {
    const [o, d] = await Promise.all([this.ops.options(user.tenantId), this.store.options(user.tenantId)]);
    const e: Record<string, string> = {};
    if (!d.companies.some((x) => x.id === p.manufacturerId)) e.manufacturerId = 'Choose an active company';
    if (p.itemId && !o.products.some((x) => x.id === p.itemId)) e.itemId = 'Choose an active product';
    if (Object.keys(e).length) throw v(e);
  }

  // ---------------------------------------------------------------- principal targets
  listTargets(user: SessionUser) {
    return this.store.listTargets(user.tenantId);
  }

  async saveTarget(user: SessionUser, meta: RequestMeta, input: TargetInput & { rowVersion?: number }, id: string | null) {
    const d = await this.store.options(user.tenantId);
    if (!d.companies.some((x) => x.id === input.manufacturerId)) throw v({ manufacturerId: 'Choose an active company' });
    const saved = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('principalTargetAddUpdate', { ...input, ...(id && { id }) }));
    return (await this.store.getTarget(user.tenantId, saved))!;
  }

  async removeTarget(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('target', user.tenantId, id, rowVersion)))) throw changed();
  }

  // ---------------------------------------------------------------- bulk price updates
  listPriceUpdates(user: SessionUser, q: DemandQuery) {
    return this.store.listPriceUpdates(user.tenantId, q);
  }

  async getPriceUpdate(user: SessionUser, id: string) {
    const u = await this.store.getPriceUpdate(user.tenantId, id);
    if (!u) throw new NotFoundError('Price update not found');
    return u;
  }

  /** A draft with its preview lines (old → new per product and price field). */
  async createPriceUpdate(user: SessionUser, meta: RequestMeta, p: PriceUpdateInput) {
    const scope = await this.store.priceScope(user.tenantId, p);
    if (!scope.length) throw new ConflictError('No products match this scope.');
    const fields = p.priceField === 'BOTH' ? ['PRICE', 'WPRICE'] : [p.priceField];
    const col = { PRICE: 'price', WPRICE: 'wprice', COST: 'cost' } as const;
    const lines = scope.flatMap((s) => fields.flatMap((f) => {
      const old = s[col[f as keyof typeof col]];
      if (old === null || old === undefined) return [];
      return [{ itemId: s.id, priceField: f, oldValue: old, newValue: bumpPrice(old, p.changePct, p.roundTo) }];
    }));
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('bulkPriceUpdateAddUpdate', {
      applyTo: p.applyTo, manufacturerId: p.applyTo === 'COMPANY' ? p.manufacturerId : null, productClassId: p.applyTo === 'CLASS' ? p.productClassId : null,
      priceField: p.priceField, changePct: p.changePct, roundTo: p.roundTo, itemCount: scope.length, lines,
    }));
    return this.getPriceUpdate(user, id);
  }

  async applyPriceUpdate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const u = await this.getPriceUpdate(user, id);
    if (u.rowVersion !== rowVersion) throw changed();
    if (u.status !== 'DRAFT') throw new ConflictError('Only a draft price update can be applied.', undefined, { code: 'PRICE_UPDATE_NOT_DRAFT' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.applyPrices(user.tenantId, id, user.id, 'BULK_UPDATE', u.lines.map((l) => ({ itemId: l.item.id, field: l.priceField, oldValue: l.oldValue, newValue: l.newValue })));
      await this.store.set('priceUpdate', user.tenantId, id, { status: 'APPLIED', appliedAt: new Date(), appliedByUserId: user.id });
    });
    return this.getPriceUpdate(user, id);
  }

  async undoPriceUpdate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const u = await this.getPriceUpdate(user, id);
    if (u.rowVersion !== rowVersion) throw changed();
    if (u.status !== 'APPLIED') throw new ConflictError('Only an applied price update can be undone.', undefined, { code: 'PRICE_UPDATE_NOT_DRAFT' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.applyPrices(user.tenantId, id, user.id, 'UNDO', u.lines.map((l) => ({ itemId: l.item.id, field: l.priceField, oldValue: l.newValue, newValue: l.oldValue })));
      await this.store.set('priceUpdate', user.tenantId, id, { status: 'UNDONE', undoneAt: new Date() });
    });
    return this.getPriceUpdate(user, id);
  }

  async removePriceUpdate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('priceUpdate', user.tenantId, id, rowVersion)))) throw new ConflictError('Only a draft price update can be deleted.', undefined, { code: 'PRICE_UPDATE_NOT_DRAFT' });
  }
}
