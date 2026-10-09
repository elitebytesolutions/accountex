import { Injectable } from '@nestjs/common';
import { allocateLandedCost, type LandedCost, type LcInput, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PurchasingStore, type ListQuery } from '../../common/application/purchasing-store.js';

const OPEN = ['IN_TRANSIT', 'CLEARED'];
/** Non-capitalised charges of these types are claimed to a posting role's account unless another is chosen. */
const ROLE_CLAIMS: Record<string, string> = { IMPORT_SALES_TAX: 'IMPORT_INPUT_ST', INCOME_TAX_148: 'ADVANCE_TAX_148' };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('A posted or cancelled shipment can’t be changed.');

/**
 * Landed cost: an import shipment's charges (duties, freight, clearing…) spread over the items of its import GRN by
 * value, quantity or weight. Posting (database landedCostShipmentPost) capitalises the charges into stock (average
 * cost; the share of units already sold goes to COGS), books claimable taxes, and clears GRNI for the FOB value.
 */
@Injectable()
export class LandedCostService {
  constructor(
    private readonly store: PurchasingStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: ListQuery) {
    return this.store.listLandedCosts(user.tenantId, q);
  }

  importGrns(user: SessionUser) {
    return this.store.importGrns(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<LandedCost> {
    const s = await this.store.getLandedCost(user.tenantId, id);
    if (!s) throw new NotFoundError('Shipment not found');
    return s;
  }

  async create(user: SessionUser, meta: RequestMeta, input: LcInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = await this.store.save('landedCostShipmentAddUpdate', data);
      if (input.cleared) await this.store.set('landedCost', user.tenantId, id, { status: 'CLEARED' });
      return id;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: LcInput & { rowVersion: number }) {
    const s = await this.current(user, id, input.rowVersion);
    if (!OPEN.includes(s.status)) throw notEditable();
    const keep = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
    const items = keep(s.items);
    const charges = keep(s.charges);
    const data = await this.payload(user, {
      ...input,
      items: input.items.map((i) => (i.id && items.has(i.id) ? i : { ...i, id: null })),
      charges: input.charges.map((c) => (c.id && charges.has(c.id) ? c : { ...c, id: null })),
    });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save('landedCostShipmentAddUpdate', { ...data, id, rowVersion: input.rowVersion });
      await this.store.set('landedCost', user.tenantId, id, { status: input.cleared ? 'CLEARED' : 'IN_TRANSIT' });
    });
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const s = await this.current(user, id, rowVersion);
    if (!OPEN.includes(s.status)) throw notEditable();
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('landedCost', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This shipment was changed. Reload and try again.');
  }

  /** Re-runs the allocation on another basis (value / qty / weight). */
  async allocate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, basis: 'VALUE' | 'QTY' | 'WEIGHT') {
    const s = await this.current(user, id, rowVersion);
    if (!OPEN.includes(s.status)) throw notEditable();
    return this.update(user, meta, id, { ...this.input(s), allocationBasis: basis, rowVersion });
  }

  /** 409 LANDED_COST_GRN_NOT_POSTED / LANDED_COST_UNALLOCATED from the database. */
  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const s = await this.current(user, id, rowVersion);
    if (!OPEN.includes(s.status)) throw notEditable();
    if (!s.items.length) throw new ConflictError('Add the received items before posting.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('landedCostShipmentPost', id));
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const s = await this.current(user, id, rowVersion);
    if (s.status === 'CANCELLED') return s;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('landedCostShipmentCancel', id, reason));
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private input(s: LandedCost): LcInput {
    return {
      docDate: s.docDate, vendorId: s.vendor.id, branchId: s.branch.id, grnId: s.grn?.id ?? null, originCountry: s.originCountry, portOfLoading: s.portOfLoading, portOfDischarge: s.portOfDischarge,
      shipmentMode: s.shipmentMode as LcInput['shipmentMode'], containerInfo: s.containerInfo, billOfLadingNo: s.billOfLadingNo, gdNo: s.gdNo, lcRef: s.lcRef, bankAccountId: s.bankAccount?.id ?? null,
      currencyCode: s.currencyCode, fxRate: s.fxRate, eta: s.eta, clearedOn: s.clearedOn, allocationBasis: s.allocationBasis as LcInput['allocationBasis'], cleared: s.status === 'CLEARED', remarks: s.remarks,
      items: s.items.map((i) => ({ id: i.id, grnLineId: i.grnLineId, itemId: i.item.id, qty: i.qty, weightKg: i.weightKg, fobUnitFcy: i.fobUnitFcy })),
      charges: s.charges.map((c) => ({
        id: c.id, chargeType: c.chargeType, description: c.description, payeeVendorId: c.payeeVendor?.id ?? null, payeeName: c.payeeName, ratePct: c.ratePct, amount: c.amount,
        isCapitalised: c.isCapitalised, isClaimable: c.isClaimable, claimAccountId: c.claimAccount?.id ?? null,
      })),
    };
  }

  private async payload(user: SessionUser, p: LcInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.vendors.some((x) => x.id === p.vendorId)) e.vendorId = 'Choose an active supplier';
    if (!o.branches.some((x) => x.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (p.bankAccountId && !o.bankAccounts.some((x) => x.id === p.bankAccountId)) e.bankAccountId = 'Choose an active bank account';
    const grn = p.grnId ? await this.store.getGrn(user.tenantId, p.grnId) : null;
    if (p.grnId && !grn) e.grnId = 'Goods receipt not found';
    else if (grn && (!grn.isImport || grn.status !== 'POSTED')) e.grnId = `${grn.docNo} isn’t a posted import goods receipt`;
    p.items.forEach((i, n) => {
      if (!o.products.some((x) => x.id === i.itemId)) e[`items.${n}.itemId`] = 'Choose an active product';
      if (i.grnLineId && !grn?.lines.some((l) => l.id === i.grnLineId && l.item.id === i.itemId)) e[`items.${n}.grnLineId`] = 'Not a line of the linked goods receipt';
    });
    p.charges.forEach((c, n) => {
      if (!o.chargeTypes.some((x) => x.code === c.chargeType)) e[`charges.${n}.chargeType`] = 'Choose the charge';
      if (c.payeeVendorId && !o.vendors.some((x) => x.id === c.payeeVendorId)) e[`charges.${n}.payeeVendorId`] = 'Choose an active vendor';
      if (c.claimAccountId && !o.accounts.some((x) => x.id === c.claimAccountId)) e[`charges.${n}.claimAccountId`] = 'Choose a postable account';
      if (!c.isCapitalised && !c.claimAccountId && !ROLE_CLAIMS[c.chargeType]) e[`charges.${n}.claimAccountId`] = 'Not in cost: choose the account it is claimed / expensed to';
    });
    if (Object.keys(e).length) throw v(e);
    const charges = await Promise.all(p.charges.map(async (c) => ({
      ...c, claimAccountId: c.isCapitalised ? c.claimAccountId : c.claimAccountId ?? (await this.store.roleAccount(user.tenantId, ROLE_CLAIMS[c.chargeType]!)),
    })));
    const missing = charges.findIndex((c) => !c.isCapitalised && !c.claimAccountId);
    if (missing >= 0) throw v({ [`charges.${missing}.claimAccountId`]: `No default account for ${ROLE_CLAIMS[charges[missing]!.chargeType]}; choose the claim account` });
    const items = p.items.map((i) => ({ ...i, fobAmount: r2(i.qty * i.fobUnitFcy * p.fxRate) }));
    const capitalised = r2(charges.filter((c) => c.isCapitalised).reduce((s, c) => s + c.amount, 0));
    const claimable = r2(charges.filter((c) => !c.isCapitalised).reduce((s, c) => s + c.amount, 0));
    const alloc = allocateLandedCost(items, p.allocationBasis, items.length ? capitalised : 0);
    const fob = r2(items.reduce((s, i) => s + i.fobAmount, 0));
    return {
      docDate: p.docDate, vendorId: p.vendorId, branchId: p.branchId, grnId: p.grnId, originCountry: p.originCountry, portOfLoading: p.portOfLoading, portOfDischarge: p.portOfDischarge,
      shipmentMode: p.shipmentMode, containerInfo: p.containerInfo, billOfLadingNo: p.billOfLadingNo, gdNo: p.gdNo, lcRef: p.lcRef, bankAccountId: p.bankAccountId, currencyCode: p.currencyCode,
      fxRate: p.fxRate, eta: p.eta, clearedOn: p.clearedOn, allocationBasis: p.allocationBasis, remarks: p.remarks,
      fobAmount: fob, capitalisedAmount: capitalised, claimableAmount: claimable, landedValueAmount: r2(fob + capitalised),
      items: items.map((i, n) => ({ ...(i.id && { id: i.id }), lineNo: n + 1, grnLineId: i.grnLineId, itemId: i.itemId, qty: i.qty, weightKg: i.weightKg, fobUnitFcy: i.fobUnitFcy, fobAmount: i.fobAmount, sharePct: alloc[n]!.sharePct, allocatedAmount: alloc[n]!.allocatedAmount })),
      charges: charges.map((c, n) => ({ ...(c.id && { id: c.id }), lineNo: n + 1, chargeType: c.chargeType, description: c.description, payeeVendorId: c.payeeVendorId, payeeName: c.payeeName, ratePct: c.ratePct, amount: c.amount, isCapitalised: c.isCapitalised, isClaimable: !c.isCapitalised && c.isClaimable, claimAccountId: c.claimAccountId })),
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('This shipment was changed. Reload and try again.');
    return s;
  }
}
