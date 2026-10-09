import { Injectable, type OnModuleInit } from '@nestjs/common';
import { baseQtyOf, docTotals, dueDateFor, lineAmounts, threeWayMatch, type BillInput, type PurchaseOptions, type SessionUser, type VendorBill } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, PermissionDeniedError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService, type DocumentFacts } from '../../../approvals/application/approvals.service.js';
import { PurchasingStore, type BillBase, type ListQuery } from '../../common/application/purchasing-store.js';

const notEditable = () => new ConflictError('Only a draft bill can be changed. Void a posted bill instead.', undefined, { code: 'BILL_NOT_EDITABLE' });
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * Vendor bills (STANDARD) and the counter purchase voucher (COUNTER). Bills are matched three ways to their PO and GRN,
 * go through the approval engine when a "Vendor bill" workflow applies (otherwise bill:approve approves directly, or
 * bill:post posts a draft), and post through the database's vendorBillPost: GRNI cleared at GRN cost with the price
 * variance revaluing average cost, stock in for lines without a GRN, input tax, advance tax 236G, WHT 153, Cr payable,
 * and for the purchase voucher the pay-now leg (cash / bank, or an issued cheque). Posted bills are only voided.
 */
@Injectable()
export class VendorBillsService implements OnModuleInit {
  constructor(
    private readonly store: PurchasingStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['BILL'],
      workflowSubject: 'VENDOR_BILL',
      link: (id) => `/purchases/bills/${id}`,
      lines: async (tenantId, id) => ((await this.store.getBill(tenantId, id))?.lines ?? []).map((l) => ({
        account: l.item ? `${l.item.sku} ${l.item.name}` : l.account ? `${l.account.code} ${l.account.name}` : l.description ?? 'Line', particulars: l.description, debit: l.totalAmount, credit: 0,
      })),
      onApproved: async (tenantId, id, approverUserId, autoPost) => {
        await this.store.run('vendorBillApprove', id, null);
        if (autoPost) await this.store.run('vendorBillPost', id);
      },
      onReturned: async (tenantId, id) => { await this.store.set('bill', tenantId, id, { status: 'DRAFT' }); },
    });
  }

  list(user: SessionUser, q: ListQuery) {
    return this.store.listBills(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<VendorBill> {
    const b = await this.store.getBill(user.tenantId, id);
    if (!b) throw new NotFoundError('Bill not found');
    const approval = await this.approvals.forEntity(user, 'BILL', id);
    const routing = b.status === 'DRAFT' && b.channel === 'STANDARD' ? await this.approvals.preview(user.tenantId, 'VENDOR_BILL', b.netPayableAmount, this.facts(b), b.createdBy?.id ?? user.id) : null;
    return { ...b, approval, routing, approvalId: approval?.status === 'PENDING' ? approval.id : null, canAct: !!approval?.canAct };
  }

  /** The bill for bill:view, or for the approver who can act on its current step. */
  async view(user: SessionUser, id: string): Promise<VendorBill> {
    const b = await this.get(user, id);
    if (!user.permissions.includes('bill:view') && !b.canAct) throw new PermissionDeniedError('You do not have permission to do this.');
    return b;
  }

  async create(user: SessionUser, meta: RequestMeta, input: BillInput) {
    const data = await this.payload(user, input, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('vendorBillAddUpdate', { ...data, purchaserUserId: input.purchaserUserId ?? user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: BillInput & { rowVersion: number }) {
    const b = await this.current(user, id, input.rowVersion);
    if (b.status !== 'DRAFT') throw notEditable();
    const known = new Set(b.lines.map((l) => l.id));
    const data = await this.payload(user, { ...input, channel: b.channel as BillInput['channel'], lines: input.lines.map((l) => (l.id && known.has(l.id) ? l : { ...l, id: null })) }, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('vendorBillAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const b = await this.current(user, id, rowVersion);
    if (b.status !== 'DRAFT' || b.submittedAt) throw new ConflictError('Only a bill that was never submitted can be deleted; void it instead.', undefined, { code: 'BILL_NOT_EDITABLE' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('bill', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This bill was changed. Reload and try again.');
  }

  /** A draft bill for the unbilled quantities of a posted GRN, priced from its purchase order. */
  async fromGrn(user: SessionUser, meta: RequestMeta, grnId: string, p: { vendorInvoiceNo: string; docDate: string }) {
    const g = await this.store.getGrn(user.tenantId, grnId);
    if (!g) throw new NotFoundError('Goods receipt not found');
    if (g.status !== 'POSTED') throw new ConflictError('Only a posted goods receipt can be billed.');
    const po = g.purchaseOrder ? await this.store.getOrder(user.tenantId, g.purchaseOrder.id) : null;
    const lines = g.lines.filter((l) => l.acceptedQty - l.billedQty > 0).map((l) => {
      const pl = po?.lines.find((x) => x.id === l.purchaseOrderLineId) ?? null;
      const open = l.acceptedQty - l.billedQty;
      // bonus units arrive free: the PO's bonus share of the received quantity is billed as bonus
      const bonus = pl && pl.bonusQty > 0 ? Math.round((open * pl.bonusQty * 1000) / (pl.baseQty + pl.bonusQty)) / 1000 : 0;
      return {
        id: null, itemId: l.item.id, description: null, accountId: null, purchaseOrderLineId: l.purchaseOrderLineId, grnLineId: l.id, upc: null, qtyCtn: 0, qtyLoose: open - bonus, bonusQty: bonus,
        breakageQty: 0, rate: pl?.rate ?? l.unitCost, salePrice: null, updateItemSalePrice: false, discountPct: pl?.discountPct ?? 0, taxCodeId: pl?.taxCode?.id ?? null, taxRate: pl?.taxRate ?? 0,
        whtSection: null, whtRate: 0, batchNo: null, expiryDate: null, costCentreId: pl?.costCentre?.id ?? null, projectId: null,
      };
    });
    if (!lines.length) throw new ConflictError('Everything on this goods receipt is already billed.');
    return this.create(user, meta, {
      channel: 'STANDARD', docDate: p.docDate, dueDate: null, vendorId: g.vendor.id, branchId: g.branch.id, warehouseId: g.warehouse.id, purchaseOrderId: g.purchaseOrder?.id ?? null, grnId: g.id,
      vendorInvoiceNo: p.vendorInvoiceNo, payableAccountId: null, purchaserUserId: null, costCentreId: po?.costCentre?.id ?? null, projectId: po?.project?.id ?? null, dealOnSupply: null,
      retailPriceDiscountPct: 0, advanceTaxAmount: 0, payMode: 'CREDIT', cashAccountId: null, bankAccountId: null, chequeNo: null, paidNowAmount: 0, isDisputed: false, disputeNote: null, remarks: null,
      lines,
    });
  }

  /** Sends the bill to its approval workflow; with none, 409 APPROVAL_NO_WORKFLOW (approve or post it directly). */
  async submit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const b = await this.current(user, id, rowVersion);
    if (b.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set('bill', user.tenantId, id, { status: 'AWAITING_APPROVAL', submittedAt: new Date() });
      const req = await this.approvals.submit(user, { entityType: 'BILL', entityId: id, docLabel: b.docNo, title: `${b.vendor.name} · ${b.vendorInvoiceNo}`, amount: b.netPayableAmount, branchId: b.branch.id, facts: this.facts(b) });
      if (!req) throw new ConflictError('No approval workflow covers this bill. Approve or post it directly.', undefined, { code: 'APPROVAL_NO_WORKFLOW' });
    });
    return this.get(user, id);
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const b = await this.get(user, id);
    if (b.approvalId) {
      await this.approvals.act(user, meta, b.approvalId, 'approve', { reason: null, comment });
      return this.get(user, id);
    }
    if (!user.permissions.includes('bill:approve')) throw new ForbiddenError('You can’t approve bills.', undefined, { code: 'APPROVAL_NOT_ELIGIBLE' });
    if (b.status !== 'DRAFT') throw notEditable();
    if (b.routing) throw new ConflictError('An approval workflow covers this bill. Submit it for approval.', undefined, { code: 'BILL_APPROVAL_REQUIRED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('vendorBillApprove', id, comment));
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const b = await this.get(user, id);
    if (!b.approvalId) throw new ConflictError('This bill isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, b.approvalId, 'reject', { reason, comment: null });
    return this.get(user, id);
  }

  async recall(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const b = await this.current(user, id, rowVersion);
    if (b.status !== 'AWAITING_APPROVAL') throw new ConflictError('Only a bill waiting for approval can be recalled.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'BILL', id, 'Recalled by the preparer');
      await this.store.set('bill', user.tenantId, id, { status: 'DRAFT' });
    });
    return this.get(user, id);
  }

  /** Posts an approved bill, or a draft no workflow covers (409 BILL_APPROVAL_REQUIRED otherwise). */
  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const b = await this.current(user, id, rowVersion);
    if (b.status !== 'DRAFT' && b.status !== 'APPROVED') throw new ConflictError(b.status === 'AWAITING_APPROVAL' ? 'This bill is waiting for approval.' : 'This bill is already posted.', undefined, { code: b.status === 'AWAITING_APPROVAL' ? 'BILL_APPROVAL_REQUIRED' : 'BILL_NOT_EDITABLE' });
    if (b.status === 'DRAFT' && b.channel === 'STANDARD' && (await this.approvals.route(user.tenantId, 'VENDOR_BILL', b.netPayableAmount, this.facts(b)))) {
      throw new ConflictError('An approval workflow covers this bill. Submit it for approval before posting.', undefined, { code: 'BILL_APPROVAL_REQUIRED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('vendorBillPost', id));
    return this.get(user, id);
  }

  /** Voids a bill: a posted one is reversed (journal, stock, price variance, issued cheque). */
  async void(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const b = await this.current(user, id, rowVersion);
    if (b.status === 'VOID') return b;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (b.status === 'AWAITING_APPROVAL') await this.approvals.cancelFor(user, 'BILL', id, reason);
      await this.store.run('vendorBillVoid', id, reason);
    });
    return this.get(user, id);
  }

  /** The counter purchase voucher: saved as a COUNTER bill and, unless kept as a draft, posted in the same transaction. */
  async voucher(user: SessionUser, meta: RequestMeta, input: BillInput & { post: boolean }) {
    if (input.post && !user.permissions.includes('bill:post')) throw new ForbiddenError('You can’t post purchase vouchers; save it as a draft.');
    const data = await this.payload(user, { ...input, channel: 'COUNTER' }, null);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const id = await this.store.save('vendorBillAddUpdate', { ...data, purchaserUserId: input.purchaserUserId ?? user.id });
      if (input.post) await this.store.run('vendorBillPost', id);
      return id;
    });
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- helpers
  private facts(b: Pick<BillBase, 'branch' | 'costCentre'>): DocumentFacts {
    return { DOC_TYPE: 'BILL', BRANCH: b.branch.id, ...(b.costCentre && { COST_CENTRE: b.costCentre.id }) };
  }

  private async payload(user: SessionUser, p: BillInput, selfId: string | null) {
    const o: PurchaseOptions = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    const vendor = o.vendors.find((x) => x.id === p.vendorId);
    if (!vendor) e.vendorId = 'Choose an active vendor';
    if (!o.branches.some((x) => x.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (p.warehouseId && !o.warehouses.some((x) => x.id === p.warehouseId)) e.warehouseId = 'Choose an active warehouse';
    if (p.payableAccountId && !o.accounts.some((x) => x.id === p.payableAccountId)) e.payableAccountId = 'Choose a postable account';
    if (p.costCentreId && !o.costCentres.some((x) => x.id === p.costCentreId)) e.costCentreId = 'Choose an active cost centre';
    if (p.projectId && !o.projects.some((x) => x.id === p.projectId)) e.projectId = 'Choose an open project';
    if (p.cashAccountId && !o.cashAccounts.some((x) => x.id === p.cashAccountId)) e.cashAccountId = 'Choose an active cash account';
    if (p.bankAccountId && !o.bankAccounts.some((x) => x.id === p.bankAccountId)) e.bankAccountId = 'Choose an active bank account';
    const po = p.purchaseOrderId ? await this.store.getOrder(user.tenantId, p.purchaseOrderId) : null;
    const grn = p.grnId ? await this.store.getGrn(user.tenantId, p.grnId) : null;
    if (p.purchaseOrderId && !po) e.purchaseOrderId = 'Purchase order not found';
    else if (po && po.vendor.id !== p.vendorId) e.purchaseOrderId = `Purchase order ${po.docNo} is from ${po.vendor.name}`;
    else if (po && ['DRAFT', 'PENDING_L1', 'PENDING_L2', 'CANCELLED'].includes(po.status)) e.purchaseOrderId = `Purchase order ${po.docNo} isn’t approved`;
    if (p.grnId && !grn) e.grnId = 'Goods receipt not found';
    else if (grn && grn.vendor.id !== p.vendorId) e.grnId = `Goods receipt ${grn.docNo} is from ${grn.vendor.name}`;
    else if (grn && grn.status !== 'POSTED') e.grnId = `Goods receipt ${grn.docNo} isn’t posted`;
    if (Object.keys(e).length) throw v(e);
    const dup = await this.store.duplicateInvoice(user.tenantId, p.vendorId, p.vendorInvoiceNo, selfId);
    if (dup) throw new ConflictError(`Invoice ${p.vendorInvoiceNo} from ${vendor!.name} is already entered on ${dup}.`, { vendorInvoiceNo: ['Already entered'] }, { code: 'BILL_DUPLICATE_INVOICE' });

    const lines = p.lines.map((l, i) => {
      const item = l.itemId ? o.products.find((x) => x.id === l.itemId) : null;
      if (l.itemId && !item) e[`lines.${i}.itemId`] = 'Choose an active product';
      if (l.accountId && !o.accounts.some((x) => x.id === l.accountId)) e[`lines.${i}.accountId`] = 'Choose a postable account';
      if (l.taxCodeId && !o.taxCodes.some((x) => x.id === l.taxCodeId)) e[`lines.${i}.taxCodeId`] = 'Choose an active tax code';
      if (l.whtSection && !o.whtSections.some((x) => x.code === l.whtSection)) e[`lines.${i}.whtSection`] = 'Choose a WHT section';
      if (l.costCentreId && !o.costCentres.some((x) => x.id === l.costCentreId)) e[`lines.${i}.costCentreId`] = 'Choose an active cost centre';
      const gl = l.grnLineId ? grn?.lines.find((x) => x.id === l.grnLineId) : null;
      if (l.grnLineId && !gl) e[`lines.${i}.grnLineId`] = 'Not a line of this goods receipt';
      const pl = po ? po.lines.find((x) => x.id === (l.purchaseOrderLineId ?? gl?.purchaseOrderLineId)) ?? po.lines.find((x) => !!l.itemId && x.item?.id === l.itemId) ?? null : null;
      const baseQty = baseQtyOf(l.qtyCtn, l.qtyLoose, item?.ctn ?? 1);
      if (l.breakageQty > baseQty + l.bonusQty) e[`lines.${i}.breakageQty`] = 'More than received';
      const a = lineAmounts({ baseQty, rate: l.rate, discountPct: l.discountPct, taxRate: l.taxRate, whtRate: l.whtRate });
      return {
        row: {
          ...(l.id && { id: l.id }), lineNo: i + 1, itemId: l.itemId, description: l.description, accountId: l.accountId, purchaseOrderLineId: pl?.id ?? null, grnLineId: l.grnLineId, upc: l.upc ?? item?.upc ?? null,
          qtyCtn: l.qtyCtn, qtyLoose: l.qtyLoose, baseQty, bonusQty: l.bonusQty, breakageQty: l.breakageQty, rate: l.rate, salePrice: l.salePrice, updateItemSalePrice: l.updateItemSalePrice && l.salePrice !== null,
          discountPct: l.discountPct, taxCodeId: l.taxCodeId, taxRate: l.taxRate, whtSection: l.whtSection,whtRate: l.whtRate, batchNo: l.batchNo, expiryDate: l.expiryDate,
          costCentreId: l.costCentreId, projectId: l.projectId,
          grossAmount: a.grossAmount, discountAmount: a.discountAmount, netAmount: a.netAmount, taxAmount: a.taxAmount, totalAmount: a.totalAmount, whtAmount: a.whtAmount,
        },
        a,
        match: { qty: baseQty + l.bonusQty, rate: l.rate, poRate: pl?.rate ?? null, receivedQty: gl ? gl.acceptedQty - gl.billedQty : null },
      };
    });
    if (Object.keys(e).length) throw v(e);
    const t = docTotals(lines.map((l) => l.a), p.advanceTaxAmount);
    if (p.paidNowAmount > t.netPayableAmount) throw v({ paidNowAmount: `At most the net payable ${t.netPayableAmount.toLocaleString('en-PK')}` });
    const m = threeWayMatch(lines.map((l) => l.match), !!po);
    const warehouseId = p.warehouseId ?? grn?.warehouse.id ?? po?.warehouse?.id ?? null;
    if (!warehouseId && !grn && lines.some((l) => l.row.itemId)) throw v({ warehouseId: 'Choose the warehouse receiving the stock' });
    return {
      channel: p.channel, docDate: p.docDate, dueDate: p.dueDate ?? dueDateFor(p.docDate, vendor!.creditDays), vendorId: p.vendorId, branchId: p.branchId, warehouseId,
      purchaseOrderId: po?.id ?? null, grnId: grn?.id ?? null, vendorInvoiceNo: p.vendorInvoiceNo.trim(), payableAccountId: p.payableAccountId, costCentreId: p.costCentreId, projectId: p.projectId,
      purchaserUserId: p.purchaserUserId, dealOnSupply: p.dealOnSupply, retailPriceDiscountPct: p.retailPriceDiscountPct,
      grossAmount: t.grossAmount, discountAmount: t.discountAmount, netAmount: t.netAmount, taxAmount: t.taxAmount, advanceTaxAmount: t.advanceTaxAmount, totalAmount: t.totalAmount,
      whtAmount: t.whtAmount, netPayableAmount: t.netPayableAmount,
      payMode: p.payMode, cashAccountId: p.payMode === 'CASH' ? p.cashAccountId : null, bankAccountId: p.payMode === 'BANK' || p.payMode === 'CHEQUE' ? p.bankAccountId : null,
      chequeNo: p.payMode === 'CHEQUE' ? p.chequeNo : null, paidNowAmount: p.payMode === 'CREDIT' ? 0 : p.paidNowAmount,
      matchStatus: m.matchStatus, matchVariancePct: m.matchVariancePct, isDisputed: p.isDisputed, disputeNote: p.isDisputed ? p.disputeNote : null, remarks: p.remarks,
      lines: lines.map((l) => l.row),
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const b = await this.store.getBill(user.tenantId, id);
    if (!b) throw new NotFoundError('Bill not found');
    if (b.rowVersion !== rowVersion) throw new ConcurrencyError('This bill was changed. Reload and try again.');
    return b;
  }
}
