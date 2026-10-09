import { Injectable, type OnModuleInit } from '@nestjs/common';
import { allocationWht, type PaymentRunInput, type PaymentRunResult, type SessionUser, type VendorPayment, type VendorPaymentInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../../../../core/domain/errors.js';
import { ApprovalSubjects } from '../../../approvals/application/approval-subjects.js';
import { ApprovalsService, type DocumentFacts } from '../../../approvals/application/approvals.service.js';
import { PayablesStore, type PaymentBase } from '../../common/application/payables-store.js';
import { PurchasingStore, type ListQuery } from '../../common/application/purchasing-store.js';

const LIVE = ['POSTED', 'PRESENTED', 'CLEARED'];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => n.toLocaleString('en-PK');
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('Only a draft payment can be changed. Void a posted one instead.', undefined, { code: 'PAYMENT_NOT_EDITABLE' });
const tooMuch = (msg: string, field: string) => new ValidationError(msg, { [field]: [msg] }, { code: 'ALLOCATION_EXCEEDS_BALANCE' });

/**
 * Vendor payments: cash, bank transfer, pay order or cheque, allocated to open bills with WHT withheld at payment.
 * Draft → (approval engine when a "Vendor payment" workflow applies; final approval posts) → posted. Without a workflow
 * vpay:post posts directly. Posting (database vendorPaymentPost): Dr payable / Cr bank or cash (cheques: Cr PDC payable
 * until the cheque register clears them), Cr WHT 153, bank charges. Void reverses it until the cheque is presented.
 * The payment run pays bills of many vendors from one account: one payment per vendor.
 */
@Injectable()
export class VendorPaymentsService implements OnModuleInit {
  constructor(
    private readonly store: PayablesStore,
    private readonly purchasing: PurchasingStore,
    private readonly approvals: ApprovalsService,
    private readonly subjects: ApprovalSubjects,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    this.subjects.register({
      entityTypes: ['PAY'],
      workflowSubject: 'VENDOR_PAYMENT',
      link: (id) => `/payables/payments?payment=${id}`,
      lines: async (tenantId, id) => ((await this.store.getPayment(tenantId, id))?.allocations ?? []).filter((a) => !a.isReversed).map((a) => ({
        account: `${a.bill.docNo} · ${a.bill.vendorInvoiceNo}`, particulars: a.whtAmount ? `WHT ${fmt(a.whtAmount)}` : null, debit: r2(a.amount + a.whtAmount), credit: 0,
      })),
      onApproved: async (tenantId, id, approverUserId) => {
        await this.store.set('payment', tenantId, id, { approvedByUserId: approverUserId, approvedAt: new Date() });
        await this.store.run('vendorPaymentPost', id);
      },
      onReturned: async (tenantId, id) => { await this.store.set('payment', tenantId, id, { status: 'DRAFT' }); },
    });
  }

  list(user: SessionUser, q: ListQuery) {
    return this.store.listPayments(user.tenantId, q);
  }

  openItems(user: SessionUser, vendorId: string | null) {
    return this.store.openItems(user.tenantId, vendorId);
  }

  async get(user: SessionUser, id: string): Promise<VendorPayment> {
    const p = await this.store.getPayment(user.tenantId, id);
    if (!p) throw new NotFoundError('Payment not found');
    const approval = await this.approvals.forEntity(user, 'PAY', id);
    const routing = p.status === 'DRAFT' ? await this.approvals.preview(user.tenantId, 'VENDOR_PAYMENT', p.amount, this.facts(p), p.createdBy?.id ?? user.id) : null;
    return { ...p, approval, routing, approvalId: approval?.status === 'PENDING' ? approval.id : null, canAct: !!approval?.canAct };
  }

  /** vpay:view, or the approver who can act on the payment's current step (the approval inbox links here). */
  async view(user: SessionUser, id: string) {
    const p = await this.get(user, id);
    if (!user.permissions.includes('vpay:view') && !p.canAct) throw new PermissionDeniedError('You do not have permission to do this.');
    return p;
  }

  async create(user: SessionUser, meta: RequestMeta, input: VendorPaymentInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('vendorPaymentAddUpdate', data));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: VendorPaymentInput & { rowVersion: number }) {
    const p = await this.current(user, id, input.rowVersion);
    if (p.status !== 'DRAFT') throw notEditable();
    const data = await this.payload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('vendorPaymentAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const p = await this.current(user, id, rowVersion);
    if (p.status !== 'DRAFT') throw notEditable();
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('payment', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This payment was changed. Reload and try again.');
  }

  async submit(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const p = await this.current(user, id, rowVersion);
    if (p.status !== 'DRAFT') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.set('payment', user.tenantId, id, { status: 'PENDING_APPROVAL' });
      const req = await this.approvals.submit(user, { entityType: 'PAY', entityId: id, docLabel: p.docNo, title: p.vendor.name, amount: p.amount, branchId: p.branch.id, facts: this.facts(p) });
      if (!req) throw new ConflictError('No approval workflow covers this payment. Post it directly.', undefined, { code: 'APPROVAL_NO_WORKFLOW' });
    });
    return this.get(user, id);
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, comment: string | null) {
    const p = await this.get(user, id);
    if (!p.approvalId) throw new ConflictError('This payment isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, p.approvalId, 'approve', { reason: null, comment });
    return this.get(user, id);
  }

  async reject(user: SessionUser, meta: RequestMeta, id: string, reason: string) {
    const p = await this.get(user, id);
    if (!p.approvalId) throw new ConflictError('This payment isn’t waiting for approval.', undefined, { code: 'APPROVAL_NOT_PENDING' });
    await this.approvals.act(user, meta, p.approvalId, 'reject', { reason, comment: null });
    return this.get(user, id);
  }

  async recall(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const p = await this.current(user, id, rowVersion);
    if (p.status !== 'PENDING_APPROVAL') throw new ConflictError('Only a payment waiting for approval can be recalled.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.approvals.cancelFor(user, 'PAY', id, 'Recalled by the preparer');
      await this.store.set('payment', user.tenantId, id, { status: 'DRAFT' });
    });
    return this.get(user, id);
  }

  /** Posts a draft no workflow covers (409 PAYMENT_APPROVAL_REQUIRED otherwise). */
  async post(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const p = await this.current(user, id, rowVersion);
    if (p.status === 'PENDING_APPROVAL') throw new ConflictError('This payment is waiting for approval; final approval posts it.', undefined, { code: 'PAYMENT_APPROVAL_REQUIRED' });
    if (p.status !== 'DRAFT') throw notEditable();
    if (await this.approvals.route(user.tenantId, 'VENDOR_PAYMENT', p.amount, this.facts(p))) {
      throw new ConflictError('An approval workflow covers this payment. Submit it for approval.', undefined, { code: 'PAYMENT_APPROVAL_REQUIRED' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('vendorPaymentPost', id));
    return this.get(user, id);
  }

  async void(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const p = await this.current(user, id, rowVersion);
    if (p.status === 'VOID') return p;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (p.status === 'PENDING_APPROVAL') await this.approvals.cancelFor(user, 'PAY', id, reason);
      await this.store.run('vendorPaymentVoid', id, reason);
    });
    return this.get(user, id);
  }

  /** Allocates a posted payment's unallocated (on-account) amount to open bills of the vendor. */
  async allocate(user: SessionUser, meta: RequestMeta, id: string, p: { rowVersion: number; allocations: { billId: string; amount: number }[] }) {
    const pay = await this.current(user, id, p.rowVersion);
    if (!LIVE.includes(pay.status)) throw new ConflictError('Only a posted payment can be allocated.');
    const total = r2(p.allocations.reduce((s, a) => s + a.amount, 0));
    if (total > pay.unallocatedAmount + 0.001) throw tooMuch(`At most the unallocated ${fmt(pay.unallocatedAmount)}`, 'allocations');
    await this.checkBills(user, pay.vendor.id, p.allocations.map((a) => ({ billId: a.billId, settle: a.amount })));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.allocate(user.tenantId, { paymentId: id }, new Date().toISOString().slice(0, 10), p.allocations.map((a) => ({ billId: a.billId, amount: r2(a.amount) }))));
    return this.get(user, id);
  }

  async reverseAllocation(user: SessionUser, meta: RequestMeta, allocationId: string) {
    const r = await this.unitOfWork.run(actorContext(user, meta), () => this.store.reverseAllocation(user.tenantId, allocationId));
    if (!r) throw new NotFoundError('Allocation not found or already reversed');
    return r;
  }

  /** Pays the selected bills: one payment per vendor (each in its own transaction), posted or submitted for approval. */
  async paymentRun(user: SessionUser, meta: RequestMeta, input: PaymentRunInput): Promise<PaymentRunResult> {
    const open = await this.store.openItems(user.tenantId, null);
    const e: Record<string, string> = {};
    const picked = input.bills.map((b, i) => {
      const bill = open.bills.find((x) => x.id === b.billId);
      if (!bill) e[`bills.${i}.billId`] = 'Not an open bill';
      else if (b.amount > bill.balanceAmount + 0.001) e[`bills.${i}.amount`] = `At most the balance ${fmt(bill.balanceAmount)}`;
      if (b.whtRate > 0 && !b.whtSection) e[`bills.${i}.whtSection`] = 'Choose the WHT section';
      return { ...b, bill: bill! };
    });
    if (Object.keys(e).length) throw v(e);
    const byVendor = new Map<string, typeof picked>();
    for (const p of picked) byVendor.set(p.bill.vendor.id, [...(byVendor.get(p.bill.vendor.id) ?? []), p]);
    if (input.method === 'CHEQUE') {
      const missing = [...byVendor.keys()].find((vid) => !input.cheques[vid]);
      if (missing) throw v({ [`cheques.${missing}`]: `Enter the cheque no. for ${byVendor.get(missing)![0]!.bill.vendor.name}` });
    }
    const ref = `RUN-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
    const result: PaymentRunResult = { payments: [], failed: [] };
    for (const [vendorId, rows] of byVendor) {
      const vendor = rows[0]!.bill.vendor;
      const allocations = rows.map((r) => {
        const withhold = input.whtTreatment === 'WITHHOLD_NOW' && r.whtRate > 0 ? allocationWht(r.amount, r.whtRate) : { amount: r2(r.amount), whtAmount: 0 };
        return { billId: r.billId, ...withhold };
      });
      const section = rows.find((r) => r.whtRate > 0)?.whtSection ?? null;
      const rate = rows.find((r) => r.whtRate > 0)?.whtRate ?? 0;
      try {
        const data = await this.payload(user, {
          docDate: input.docDate, vendorId, branchId: input.branchId, method: input.method, bankAccountId: input.bankAccountId, cashAccountId: input.cashAccountId,
          chequeNo: input.method === 'CHEQUE' ? input.cheques[vendorId]! : null, chequeBookId: null, isCrossed: true,
          amount: r2(allocations.reduce((s, a) => s + a.amount, 0)), whtTreatment: input.whtTreatment, whtSection: section, whtRate: rate, bankChargesAmount: 0,
          remarks: input.remarks, allocations,
        });
        const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
          const id = await this.store.save('vendorPaymentAddUpdate', { ...data, paymentRunRef: ref });
          const p = (await this.store.getPayment(user.tenantId, id))!;
          if (await this.approvals.route(user.tenantId, 'VENDOR_PAYMENT', p.amount, this.facts(p))) {
            await this.store.set('payment', user.tenantId, id, { status: 'PENDING_APPROVAL' });
            await this.approvals.submit(user, { entityType: 'PAY', entityId: id, docLabel: p.docNo, title: p.vendor.name, amount: p.amount, branchId: p.branch.id, facts: this.facts(p) });
          } else await this.store.run('vendorPaymentPost', id);
          return id;
        });
        const p = (await this.store.getPayment(user.tenantId, id))!;
        result.payments.push({ id, docNo: p.docNo, vendor, amount: p.amount, whtAmount: r2(allocations.reduce((s, a) => s + a.whtAmount, 0)), status: p.status, chequeNo: p.chequeNo });
      } catch (err) {
        result.failed.push({ vendor, message: (err as Error).message });
      }
    }
    return result;
  }

  // ---------------------------------------------------------------- helpers
  private facts(p: Pick<PaymentBase, 'branch'>): DocumentFacts {
    return { DOC_TYPE: 'PAY', BRANCH: p.branch.id };
  }

  private async checkBills(user: SessionUser, vendorId: string, rows: { billId: string; settle: number }[]) {
    const open = await this.store.openItems(user.tenantId, vendorId);
    rows.forEach((r, i) => {
      const b = open.bills.find((x) => x.id === r.billId);
      if (!b) throw v({ [`allocations.${i}.billId`]: 'Not an open bill of this vendor' });
      if (r.settle > b.balanceAmount + 0.001) throw tooMuch(`Bill ${b.docNo}: at most its balance ${fmt(b.balanceAmount)}`, `allocations.${i}.amount`);
    });
  }

  private async payload(user: SessionUser, p: VendorPaymentInput) {
    const o = await this.purchasing.options(user.tenantId);
    const e: Record<string, string> = {};
    if (!o.vendors.some((x) => x.id === p.vendorId)) e.vendorId = 'Choose an active vendor';
    if (!o.branches.some((x) => x.id === p.branchId)) e.branchId = 'Choose an active branch';
    if (p.method === 'CASH' && !o.cashAccounts.some((x) => x.id === p.cashAccountId)) e.cashAccountId = 'Choose an active cash account';
    if (p.method !== 'CASH' && !o.bankAccounts.some((x) => x.id === p.bankAccountId)) e.bankAccountId = 'Choose an active bank account';
    if (p.whtSection && !o.whtSections.some((x) => x.code === p.whtSection)) e.whtSection = 'Choose a WHT section';
    if (Object.keys(e).length) throw v(e);
    await this.checkBills(user, p.vendorId, p.allocations.map((a) => ({ billId: a.billId, settle: r2(a.amount + a.whtAmount) })));
    const allocated = r2(p.allocations.reduce((s, a) => s + a.amount, 0));
    if (allocated > p.amount + 0.001) throw tooMuch(`Allocated ${fmt(allocated)} is more than the amount paid ${fmt(p.amount)}`, 'allocations');
    // WHT withheld now needs its section; with no WHT the payment is 'already withheld' (vendorPaymentWhtChk)
    const withheld = p.whtTreatment === 'WITHHOLD_NOW' && !!p.whtSection && p.allocations.some((a) => a.whtAmount > 0);
    return {
      docDate: p.docDate, vendorId: p.vendorId, branchId: p.branchId, method: p.method, bankAccountId: p.method === 'CASH' ? null : p.bankAccountId,
      cashAccountId: p.method === 'CASH' ? p.cashAccountId : null, chequeNo: p.method === 'CHEQUE' ? p.chequeNo : null, chequeBookId: p.method === 'CHEQUE' ? p.chequeBookId : null,
      isCrossed: p.isCrossed, amount: r2(p.amount), whtTreatment: withheld ? 'WITHHOLD_NOW' : 'ALREADY_WITHHELD', whtSection: withheld ? p.whtSection : null, whtRate: withheld ? p.whtRate : 0,
      bankChargesAmount: p.bankChargesAmount, remarks: p.remarks,
      allocations: p.allocations.map((a) => ({ billId: a.billId, amount: r2(a.amount), whtAmount: withheld ? r2(a.whtAmount) : 0, allocationDate: p.docDate })),
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const p = await this.store.getPayment(user.tenantId, id);
    if (!p) throw new NotFoundError('Payment not found');
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('This payment was changed. Reload and try again.');
    return p;
  }
}
