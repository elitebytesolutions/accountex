import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import {
  AGEING_BUCKETS, ageingBucket, type AgeingBucket, type ApAgeing, type DebitNote, type DebitNoteList, type OpenItems, type PurchaseReturn, type PurchaseReturnList,
  type ReturnableLine, type ReturnBill, type VendorPaymentList, type VendorStatement,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { bankAccountRefs, day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { PayablesStore, type PaymentBase, type PayablesDoc, type PayablesLifecycle, type PayablesSave } from '../application/payables-store.js';
import type { ListQuery } from '../application/purchasing-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };
const TEXT_ARG: PayablesLifecycle[] = ['purchaseReturnCancel', 'debitNoteVoid', 'vendorPaymentVoid'];
const OPEN_BILL = ['POSTED', 'PARTIALLY_PAID'];
const LIVE_BILL = ['POSTED', 'PARTIALLY_PAID', 'PAID'];
const LIVE_PAY = ['POSTED', 'PRESENTED', 'CLEARED'];
const LIVE_DN = ['OPEN', 'APPLIED', 'REFUNDED'];
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date(`${today().slice(0, 7)}-01`);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function refs(db: Db, tenantId: string, k: { vendors?: (string | null)[]; branches?: (string | null)[]; warehouses?: (string | null)[]; accounts?: (string | null)[]; taxCodes?: (string | null)[]; products?: (string | null)[]; cash?: (string | null)[] }) {
  const q = <T,>(xs: (string | null)[] | undefined, f: (i: string[]) => Promise<T[]>) => (xs && ids(xs).length ? f(ids(xs)) : Promise.resolve([] as T[]));
  const [vendors, branches, warehouses, accounts, taxCodes, products, cash] = await Promise.all([
    q(k.vendors, (i) => db.vendors.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.branches, (i) => db.branches.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.warehouses, (i) => db.warehouses.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.accounts, (i) => db.chartOfAccounts.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.taxCodes, (i) => db.taxCodes.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, description: true } })),
    q(k.products, (i) => db.products.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, sku: true, name: true, trackExpiry: true } })),
    q(k.cash, (i) => db.cashAccounts.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
  ]);
  return { vendors: vendors as Ref[], branches: branches as Ref[], warehouses: warehouses as Ref[], accounts: accounts as Ref[], cash: cash as Ref[], taxCodes: taxCodes.map((t) => ({ id: t.id, code: t.code, name: t.description })), products };
}

@Injectable()
export class PrismaPayablesStore extends PayablesStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async vendorIds(tenantId: string, s: string) {
    return (await this.prisma.db().vendors.findMany({ where: { tenantId, OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } }] }, select: { id: true }, take: 50 })).map((v) => v.id);
  }

  // ---------------------------------------------------------------- open items
  async openItems(tenantId: string, vendorId: string | null): Promise<OpenItems> {
    const db = this.prisma.db();
    const v = vendorId ? { vendorId } : {};
    const [bills, pays, dns] = await Promise.all([
      db.vendorBills.findMany({ where: { tenantId, ...v, status: { in: OPEN_BILL }, balanceAmount: { gt: 0 } }, orderBy: [{ dueDate: 'asc' }, { docNo: 'asc' }], take: 1000 }),
      db.vendorPayments.findMany({ where: { tenantId, ...v, status: { in: LIVE_PAY }, unallocatedAmount: { gt: 0 } }, orderBy: { docDate: 'asc' } }),
      db.debitNotes.findMany({ where: { tenantId, ...v, status: 'OPEN', balanceAmount: { gt: 0 } }, orderBy: { docDate: 'asc' } }),
    ]);
    const vendors = await db.vendors.findMany({ where: { tenantId, id: { in: ids([...bills, ...pays, ...dns].map((x) => x.vendorId)) } }, select: { id: true, code: true, name: true, defaultWhtSection: true, atlStatus: true } });
    const r = await refs(db, tenantId, { branches: bills.map((b) => b.branchId) });
    const lines = await db.vendorBillLines.findMany({ where: { tenantId, billId: { in: bills.map((b) => b.id) }, whtRate: { gt: 0 } }, select: { billId: true, whtSection: true, whtRate: true } });
    const dnBills = await db.vendorBills.findMany({ where: { tenantId, id: { in: ids(dns.map((d) => d.billId)) } }, select: { id: true, docNo: true } });
    const t = today();
    const vref = (id: string) => { const x = vendors.find((y) => y.id === id); return x ? { id: x.id, code: x.code, name: x.name } : { id, code: '?', name: '?' }; };
    return {
      bills: bills.map((b) => {
        const vend = vendors.find((x) => x.id === b.vendorId);
        const withheld = lines.find((l) => l.billId === b.id);
        const due = day(b.dueDate)!;
        return {
          id: b.id, docNo: b.docNo, vendorInvoiceNo: b.vendorInvoiceNo, docDate: day(b.docDate)!, dueDate: due, vendor: vref(b.vendorId), branch: ref(r.branches, b.branchId),
          netPayableAmount: num(b.netPayableAmount), balanceAmount: num(b.balanceAmount), daysOverdue: Math.max(0, days(due, t)), status: b.status,
          // WHT already deducted on the bill means none at payment; otherwise the vendor's default section
          whtSection: withheld ? null : vend?.defaultWhtSection ?? null, whtRate: 0, isDisputed: b.isDisputed,
        };
      }),
      payments: pays.map((p) => ({ id: p.id, docNo: p.docNo, docDate: day(p.docDate)!, vendor: vref(p.vendorId), amount: num(p.amount), unallocatedAmount: num(p.unallocatedAmount) })),
      debitNotes: dns.map((d) => ({ id: d.id, docNo: d.docNo, docDate: day(d.docDate)!, vendor: vref(d.vendorId), bill: find(dnBills, d.billId), balanceAmount: num(d.balanceAmount) })),
    };
  }

  // ---------------------------------------------------------------- purchase returns
  async listReturns(tenantId: string, q: ListQuery): Promise<PurchaseReturnList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.PurchaseReturnsWhereInput = {
      tenantId, ...(q.vendor && { vendorId: q.vendor }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { supplierBillNo: { contains: s, mode: 'insensitive' } }, { vendorId: { in: await this.vendorIds(tenantId, s) } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus, month, credit, cash, drafts] = await Promise.all([
      db.purchaseReturns.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.purchaseReturns.count({ where }),
      db.purchaseReturns.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.purchaseReturns.aggregate({ where: { ...base, status: 'POSTED', docDate: { gte: monthStart() } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      db.purchaseReturns.aggregate({ where: { ...base, status: 'POSTED', settlement: 'CREDIT', docDate: { gte: monthStart() } }, _sum: { totalAmount: true } }),
      db.purchaseReturns.aggregate({ where: { ...base, status: 'POSTED', settlement: 'CASH_REFUND', docDate: { gte: monthStart() } }, _sum: { totalAmount: true } }),
      db.purchaseReturns.count({ where: { ...base, status: 'DRAFT' } }),
    ]);
    const items = (await this.mapReturns(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return {
      items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: { thisMonth: month._count._all, thisMonthAmount: num(month._sum.totalAmount), creditAmount: num(credit._sum.totalAmount), cashRefundAmount: num(cash._sum.totalAmount), drafts },
    };
  }

  async getReturn(tenantId: string, id: string) {
    const row = await this.prisma.db().purchaseReturns.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapReturns(tenantId, [row], true))[0]! : null;
  }

  private async mapReturns(tenantId: string, rows: Prisma.PurchaseReturnsGetPayload<object>[], full: boolean): Promise<PurchaseReturn[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.purchaseReturnLines.findMany({ where: { tenantId, purchaseReturnId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, bills, vouchers, dns] = await Promise.all([
      refs(db, tenantId, { vendors: rows.map((x) => x.vendorId), branches: rows.map((x) => x.branchId), warehouses: rows.map((x) => x.warehouseId), cash: rows.map((x) => x.cashAccountId), taxCodes: lines.map((l) => l.taxCodeId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.map((x) => x.createdBy)),
      db.vendorBills.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.billId)) } }, select: { id: true, docNo: true, vendorInvoiceNo: true } }),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
      db.debitNotes.findMany({ where: { tenantId, purchaseReturnId: { in: rows.map((x) => x.id) } }, select: { id: true, docNo: true, status: true, purchaseReturnId: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, vendor: ref(r.vendors, x.vendorId), branch: ref(r.branches, x.branchId), warehouse: ref(r.warehouses, x.warehouseId),
      bill: find(bills, x.billId), supplierBillNo: x.supplierBillNo, settlement: x.settlement, cashAccount: find(r.cash, x.cashAccountId), reason: x.reason, gatePassNo: x.gatePassNo,
      transporter: x.transporter, debitNoteNarration: x.debitNoteNarration, grossAmount: num(x.grossAmount), discountAmount: num(x.discountAmount), taxAmount: num(x.taxAmount),
      totalAmount: num(x.totalAmount), status: x.status, postedAt: iso(x.postedAt), voucher: vouchers.get(x.journalEntryId ?? '') ?? null, cancelledAt: iso(x.cancelledAt),
      cancelReason: x.cancelReason, remarks: x.remarks, createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      debitNote: (() => { const d = dns.find((y) => y.purchaseReturnId === x.id); return d ? { id: d.id, docNo: d.docNo, status: d.status } : null; })(),
      lines: lines.filter((l) => l.purchaseReturnId === x.id).map((l) => {
        const p = r.products.find((y) => y.id === l.itemId);
        return {
          id: l.id, lineNo: l.lineNo, billLineId: l.billLineId, item: p ? { id: p.id, sku: p.sku, name: p.name, trackExpiry: p.trackExpiry } : { id: l.itemId, sku: '?', name: '?', trackExpiry: false },
          batchNo: l.batchNo, expiryDate: day(l.expiryDate), purchasedQty: l.purchasedQty ? num(l.purchasedQty) : null, returnQty: num(l.returnQty), bonusQty: num(l.bonusQty), rate: num(l.rate),
          discountPct: num(l.discountPct), grossAmount: num(l.grossAmount), discountAmount: num(l.discountAmount), taxCode: find(r.taxCodes, l.taxCodeId), taxRate: num(l.taxRate),
          taxAmount: num(l.taxAmount), totalAmount: num(l.totalAmount),
        };
      }),
    }));
  }

  async returnBills(tenantId: string, vendorId: string): Promise<ReturnBill[]> {
    const db = this.prisma.db();
    const withStock = await db.vendorBillLines.findMany({ where: { tenantId, itemId: { not: null } }, select: { billId: true }, distinct: ['billId'] });
    const bills = await db.vendorBills.findMany({
      where: { tenantId, vendorId, status: { in: LIVE_BILL }, id: { in: withStock.map((l) => l.billId) } }, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], take: 200,
    });
    const r = await refs(db, tenantId, { branches: bills.map((b) => b.branchId), warehouses: bills.map((b) => b.warehouseId) });
    return bills.map((b) => ({
      id: b.id, docNo: b.docNo, docDate: day(b.docDate)!, vendorInvoiceNo: b.vendorInvoiceNo, netPayableAmount: num(b.netPayableAmount), balanceAmount: num(b.balanceAmount),
      status: b.status, warehouse: find(r.warehouses, b.warehouseId), branch: ref(r.branches, b.branchId),
    }));
  }

  async returnable(tenantId: string, billId: string, exceptReturnId: string | null): Promise<ReturnableLine[]> {
    const db = this.prisma.db();
    const lines = await db.vendorBillLines.findMany({ where: { tenantId, billId, itemId: { not: null } }, orderBy: { lineNo: 'asc' } });
    const done = await db.purchaseReturnLines.findMany({
      where: { tenantId, billLineId: { in: lines.map((l) => l.id) }, ...(exceptReturnId && { purchaseReturnId: { not: exceptReturnId } }) },
      select: { billLineId: true, returnQty: true, bonusQty: true, purchaseReturnId: true },
    });
    const live = new Set((await db.purchaseReturns.findMany({ where: { tenantId, id: { in: ids(done.map((d) => d.purchaseReturnId)) }, status: { in: ['POSTED', 'REFERENCED'] } }, select: { id: true } })).map((x) => x.id));
    const r = await refs(db, tenantId, { products: lines.map((l) => l.itemId), taxCodes: lines.map((l) => l.taxCodeId) });
    return lines.map((l) => {
      const p = r.products.find((y) => y.id === l.itemId)!;
      const purchased = num(l.totalQty);
      const returned = done.filter((d) => d.billLineId === l.id && live.has(d.purchaseReturnId)).reduce((s, d) => s + num(d.returnQty) + num(d.bonusQty), 0);
      return {
        billLineId: l.id, item: { id: p.id, sku: p.sku, name: p.name, trackExpiry: p.trackExpiry }, purchasedQty: purchased, returnedQty: returned, returnableQty: Math.max(0, purchased - returned),
        rate: num(l.rate), discountPct: num(l.discountPct), taxCode: find(r.taxCodes, l.taxCodeId), taxRate: num(l.taxRate), batchNo: l.batchNo, expiryDate: day(l.expiryDate),
      };
    });
  }

  // ---------------------------------------------------------------- debit notes
  async listDebitNotes(tenantId: string, q: ListQuery): Promise<DebitNoteList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.DebitNotesWhereInput = {
      tenantId, ...(q.vendor && { vendorId: q.vendor }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { reasonNote: { contains: s, mode: 'insensitive' } }, { vendorId: { in: await this.vendorIds(tenantId, s) } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus, open, applied, refund, drafts] = await Promise.all([
      db.debitNotes.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.debitNotes.count({ where }),
      db.debitNotes.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.debitNotes.aggregate({ where: { ...base, status: 'OPEN' }, _sum: { balanceAmount: true } }),
      db.vendorPaymentAllocations.aggregate({ where: { tenantId, debitNoteId: { not: null }, isReversed: false, allocationDate: { gte: monthStart() } }, _sum: { amount: true } }),
      db.debitNotes.aggregate({ where: { ...base, status: 'OPEN', settlement: 'REQUEST_REFUND' }, _sum: { balanceAmount: true } }),
      db.debitNotes.count({ where: { ...base, status: 'DRAFT' } }),
    ]);
    const items = (await this.mapDebitNotes(tenantId, rows, false)).map(({ lines, applications, ...x }) => { void lines; void applications; return x; });
    return {
      items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: { openAmount: num(open._sum.balanceAmount), appliedThisMonth: num(applied._sum.amount), refundDue: num(refund._sum.balanceAmount), drafts },
    };
  }

  async getDebitNote(tenantId: string, id: string) {
    const row = await this.prisma.db().debitNotes.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapDebitNotes(tenantId, [row], true))[0]! : null;
  }

  private async mapDebitNotes(tenantId: string, rows: Prisma.DebitNotesGetPayload<object>[], full: boolean): Promise<DebitNote[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.debitNoteLines.findMany({ where: { tenantId, debitNoteId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const allocs = full ? await db.vendorPaymentAllocations.findMany({ where: { tenantId, debitNoteId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'asc' } }) : [];
    const [r, users, bills, vouchers, prs] = await Promise.all([
      refs(db, tenantId, { vendors: rows.map((x) => x.vendorId), branches: rows.map((x) => x.branchId), warehouses: rows.map((x) => x.warehouseId), taxCodes: lines.map((l) => l.taxCodeId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.map((x) => x.createdBy)),
      db.vendorBills.findMany({ where: { tenantId, id: { in: ids([...rows.map((x) => x.billId), ...allocs.map((a) => a.billId)]) } }, select: { id: true, docNo: true, vendorInvoiceNo: true, balanceAmount: true } }),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
      db.purchaseReturns.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.purchaseReturnId)) } }, select: { id: true, docNo: true, status: true } }),
    ]);
    return rows.map((x) => {
      const b = find(bills, x.billId);
      return {
        id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, vendor: ref(r.vendors, x.vendorId), branch: ref(r.branches, x.branchId),
        bill: b ? { id: b.id, docNo: b.docNo, vendorInvoiceNo: b.vendorInvoiceNo, balanceAmount: num(b.balanceAmount) } : null, reason: x.reason, reasonNote: x.reasonNote,
        warehouse: find(r.warehouses, x.warehouseId), settlement: x.settlement, netAmount: num(x.netAmount), taxAmount: num(x.taxAmount), totalAmount: num(x.totalAmount),
        whtAmount: num(x.whtAmount), creditAmount: num(x.creditAmount), appliedAmount: num(x.appliedAmount), refundedAmount: num(x.refundedAmount), balanceAmount: num(x.balanceAmount),
        status: x.status, postedAt: iso(x.postedAt), voucher: vouchers.get(x.journalEntryId ?? '') ?? null, voidedAt: iso(x.voidedAt), voidReason: x.voidReason, remarks: x.remarks,
        purchaseReturn: find(prs, x.purchaseReturnId), createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
        lines: lines.filter((l) => l.debitNoteId === x.id).map((l) => {
          const p = r.products.find((y) => y.id === l.itemId);
          return {
            id: l.id, lineNo: l.lineNo, billLineId: l.billLineId, item: p ? { id: p.id, sku: p.sku, name: p.name } : null, description: l.description,
            billedQty: l.billedQty ? num(l.billedQty) : null, returnQty: num(l.returnQty), rate: num(l.rate), netAmount: num(l.netAmount), taxCode: find(r.taxCodes, l.taxCodeId),
            taxRate: num(l.taxRate), taxAmount: num(l.taxAmount), totalAmount: num(l.totalAmount),
          };
        }),
        applications: allocs.filter((a) => a.debitNoteId === x.id).map((a) => {
          const ab = find(bills, a.billId);
          return { id: a.id, bill: { id: a.billId, docNo: ab?.docNo ?? '?' }, date: day(a.allocationDate)!, amount: num(a.amount), isReversed: a.isReversed };
        }),
      };
    });
  }

  // ---------------------------------------------------------------- vendor payments
  async listPayments(tenantId: string, q: ListQuery): Promise<VendorPaymentList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.VendorPaymentsWhereInput = {
      tenantId, ...(q.vendor && { vendorId: q.vendor }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { chequeNo: { contains: s, mode: 'insensitive' } }, { paymentRunRef: { contains: s, mode: 'insensitive' } }, { vendorId: { in: await this.vendorIds(tenantId, s) } }] }),
    };
    const where = { ...base, ...(q.status && (q.status === 'LIVE' ? { status: { in: LIVE_PAY } } : { status: q.status })) };
    const [rows, total, byStatus, month, pending, unpresented, onAccount] = await Promise.all([
      db.vendorPayments.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.vendorPayments.count({ where }),
      db.vendorPayments.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.vendorPayments.aggregate({ where: { ...base, status: { in: LIVE_PAY }, docDate: { gte: monthStart() } }, _sum: { amount: true, whtAmount: true } }),
      db.vendorPayments.count({ where: { ...base, status: 'PENDING_APPROVAL' } }),
      db.vendorPayments.aggregate({ where: { ...base, method: 'CHEQUE', status: { in: ['POSTED', 'PRESENTED'] } }, _sum: { amount: true } }),
      db.vendorPayments.aggregate({ where: { ...base, status: { in: LIVE_PAY } }, _sum: { unallocatedAmount: true } }),
    ]);
    const items = (await this.mapPayments(tenantId, rows, false)).map(({ allocations, ...x }) => { void allocations; return x; });
    return {
      items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: { paidThisMonth: num(month._sum.amount), whtThisMonth: num(month._sum.whtAmount), pendingApproval: pending, unpresentedCheques: num(unpresented._sum.amount), onAccount: num(onAccount._sum.unallocatedAmount) },
    };
  }

  async getPayment(tenantId: string, id: string) {
    const row = await this.prisma.db().vendorPayments.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapPayments(tenantId, [row], true))[0]! : null;
  }

  private async mapPayments(tenantId: string, rows: Prisma.VendorPaymentsGetPayload<object>[], full: boolean): Promise<PaymentBase[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const allocs = full ? await db.vendorPaymentAllocations.findMany({ where: { tenantId, vendorPaymentId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'asc' } }) : [];
    const [r, users, vouchers, banks, cheques, bills] = await Promise.all([
      refs(db, tenantId, { vendors: rows.map((x) => x.vendorId), branches: rows.map((x) => x.branchId), cash: rows.map((x) => x.cashAccountId) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.createdBy, x.approvedByUserId])),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
      bankAccountRefs(db, tenantId, rows.map((x) => x.bankAccountId)),
      db.cheques.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.chequeId)) } }, select: { id: true, docNo: true, status: true } }),
      db.vendorBills.findMany({ where: { tenantId, id: { in: ids(allocs.map((a) => a.billId)) } }, select: { id: true, docNo: true, vendorInvoiceNo: true } }),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, vendor: ref(r.vendors, x.vendorId), branch: ref(r.branches, x.branchId), method: x.method,
      bankAccount: x.bankAccountId ? { id: x.bankAccountId, title: banks.get(x.bankAccountId)?.title ?? '?' } : null, cashAccount: find(r.cash, x.cashAccountId), chequeNo: x.chequeNo,
      cheque: find(cheques, x.chequeId), isCrossed: x.isCrossed, currencyCode: x.currencyCode, amount: num(x.amount), whtTreatment: x.whtTreatment, whtSection: x.whtSection,
      whtRate: num(x.whtRate), whtAmount: num(x.whtAmount), bankChargesAmount: num(x.bankChargesAmount), allocatedAmount: num(x.allocatedAmount), unallocatedAmount: num(x.unallocatedAmount),
      paymentRunRef: x.paymentRunRef, status: x.status, approvedBy: users.get(x.approvedByUserId ?? '') ?? null, approvedAt: iso(x.approvedAt), postedAt: iso(x.postedAt),
      clearedOn: day(x.clearedOn), voucher: vouchers.get(x.journalEntryId ?? '') ?? null, voidedAt: iso(x.voidedAt), voidReason: x.voidReason, remarks: x.remarks,
      createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      allocations: allocs.filter((a) => a.vendorPaymentId === x.id).map((a) => {
        const b = find(bills, a.billId);
        return { id: a.id, bill: { id: a.billId, docNo: b?.docNo ?? '?', vendorInvoiceNo: b?.vendorInvoiceNo ?? '' }, date: day(a.allocationDate)!, amount: num(a.amount), whtAmount: num(a.whtAmount), isReversed: a.isReversed };
      }),
    }));
  }

  // ---------------------------------------------------------------- writes
  save(fn: PayablesSave, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async set(doc: PayablesDoc, tenantId: string, id: string, data: Record<string, unknown>) {
    const db = this.prisma.db();
    if (doc === 'return') await db.purchaseReturns.updateMany({ where: { tenantId, id }, data });
    else if (doc === 'debitNote') await db.debitNotes.updateMany({ where: { tenantId, id }, data });
    else await db.vendorPayments.updateMany({ where: { tenantId, id }, data });
  }

  async run(fn: PayablesLifecycle, id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (TEXT_ARG.includes(fn)) await db.$queryRawUnsafe(`select "Purchases"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "Purchases"."${fn}"($1::uuid)::text`, id);
  }

  async deleteDraft(doc: PayablesDoc, tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (doc === 'return') {
      if (!(await db.purchaseReturns.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.purchaseReturnLines.deleteMany({ where: { tenantId, purchaseReturnId: id } });
      return (await db.purchaseReturns.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (doc === 'debitNote') {
      if (!(await db.debitNotes.count({ where: { tenantId, id, rowVersion, status: 'DRAFT', purchaseReturnId: null } }))) return false;
      await db.debitNoteLines.deleteMany({ where: { tenantId, debitNoteId: id } });
      return (await db.debitNotes.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (!(await db.vendorPayments.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
    await db.vendorPaymentAllocations.deleteMany({ where: { tenantId, vendorPaymentId: id } });
    return (await db.vendorPayments.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
  }

  async allocate(tenantId: string, source: { paymentId?: string; debitNoteId?: string }, date: string, rows: { billId: string; amount: number; whtAmount?: number }[]) {
    const db = this.prisma.db();
    for (const r of rows) {
      await db.vendorPaymentAllocations.create({
        data: { tenantId, vendorPaymentId: source.paymentId ?? null, debitNoteId: source.debitNoteId ?? null, billId: r.billId, allocationDate: new Date(date), amount: r.amount, whtAmount: r.whtAmount ?? 0 },
      });
    }
  }

  async reverseAllocation(tenantId: string, allocationId: string) {
    const db = this.prisma.db();
    const a = await db.vendorPaymentAllocations.findFirst({ where: { tenantId, id: allocationId, isReversed: false } });
    if (!a) return null;
    await db.vendorPaymentAllocations.updateMany({ where: { tenantId, id: allocationId }, data: { isReversed: true, reversedAt: new Date() } });
    return { paymentId: a.vendorPaymentId, debitNoteId: a.debitNoteId };
  }

  async refundDebitNote(id: string, date: string, cashAccountId: string | null, bankAccountId: string | null, amount: number) {
    await this.prisma.db().$queryRaw`select "Purchases"."debitNoteRefund"(${id}::uuid, ${date}::date, ${cashAccountId}::uuid, ${bankAccountId}::uuid, ${amount}::numeric)::text`;
  }

  // ---------------------------------------------------------------- reports
  async ageing(tenantId: string, q: { asOf: string; basis: 'DUE' | 'BILL'; branch?: string; vendor?: string; includeZero: boolean }): Promise<ApAgeing> {
    const db = this.prisma.db();
    const bills = await db.vendorBills.findMany({
      where: { tenantId, status: { in: OPEN_BILL }, balanceAmount: { gt: 0 }, docDate: { lte: new Date(q.asOf) }, ...(q.branch && { branchId: q.branch }), ...(q.vendor && { vendorId: q.vendor }) },
      select: { vendorId: true, branchId: true, docDate: true, dueDate: true, balanceAmount: true, isDisputed: true },
    });
    const vendors = await db.vendors.findMany({
      where: { tenantId, ...(q.includeZero ? { deletedAt: null, status: 'ACTIVE' } : { id: { in: ids(bills.map((b) => b.vendorId)) } }), ...(q.vendor && { id: q.vendor }) },
      select: { id: true, code: true, name: true, city: true, creditDays: true }, orderBy: { name: 'asc' },
    });
    const r = await refs(db, tenantId, { branches: q.branch ? [q.branch] : [] });
    const empty = (): Record<AgeingBucket, number> => Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<AgeingBucket, number>;
    const totals = { ...empty(), total: 0 };
    const rows = vendors.map((v) => {
      const mine = bills.filter((b) => b.vendorId === v.id);
      const buckets = empty();
      let oldest = 0;
      let disputed = 0;
      for (const b of mine) {
        const d = days(day(q.basis === 'DUE' ? b.dueDate : b.docDate)!, q.asOf);
        const amt = num(b.balanceAmount);
        buckets[ageingBucket(d)] = r2(buckets[ageingBucket(d)] + amt);
        oldest = Math.max(oldest, d);
        if (b.isDisputed) disputed = r2(disputed + amt);
      }
      const total = r2(AGEING_BUCKETS.reduce((s, k) => s + buckets[k], 0));
      for (const k of AGEING_BUCKETS) totals[k] = r2(totals[k] + buckets[k]);
      totals.total = r2(totals.total + total);
      return { vendor: { id: v.id, code: v.code, name: v.name, city: v.city, creditDays: v.creditDays }, branch: q.branch ? find(r.branches, q.branch) : null, buckets, total, bills: mine.length, oldestDays: Math.max(0, oldest), disputed };
    });
    return { asOf: q.asOf, basis: q.basis, rows, totals };
  }

  async statement(tenantId: string, vendorId: string, from: string, to: string): Promise<VendorStatement | null> {
    const db = this.prisma.db();
    const v = await db.vendors.findFirst({ where: { tenantId, id: vendorId }, select: { id: true, code: true, name: true, ntn: true, city: true } });
    if (!v) return null;
    const upTo = new Date(to);
    const [bills, pays, dns, prs, refunds] = await Promise.all([
      db.vendorBills.findMany({ where: { tenantId, vendorId, status: { in: LIVE_BILL }, docDate: { lte: upTo } }, select: { id: true, docNo: true, docDate: true, vendorInvoiceNo: true, channel: true, netPayableAmount: true, paidNowAmount: true, whtAmount: true } }),
      db.vendorPayments.findMany({ where: { tenantId, vendorId, status: { in: LIVE_PAY }, docDate: { lte: upTo } }, select: { id: true, docNo: true, docDate: true, method: true, chequeNo: true, amount: true, whtAmount: true } }),
      db.debitNotes.findMany({ where: { tenantId, vendorId, status: { in: LIVE_DN }, purchaseReturnId: null, docDate: { lte: upTo } }, select: { id: true, docNo: true, docDate: true, reason: true, totalAmount: true, whtAmount: true } }),
      db.purchaseReturns.findMany({ where: { tenantId, vendorId, status: { in: ['POSTED', 'REFERENCED'] }, settlement: 'CREDIT', docDate: { lte: upTo } }, select: { id: true, docNo: true, docDate: true, supplierBillNo: true, totalAmount: true } }),
      db.vouchers.findMany({ where: { tenantId, sourceDocType: 'DN', voucherType: { in: ['BRV', 'CRV'] }, status: 'POSTED', docDate: { lte: upTo }, sourceDocId: { in: (await db.debitNotes.findMany({ where: { tenantId, vendorId }, select: { id: true } })).map((d) => d.id) } }, select: { id: true, docNo: true, docDate: true, totalDebit: true, sourceDocNo: true } }),
    ]);
    type Row = VendorStatement['rows'][number];
    const all: Row[] = [
      ...bills.flatMap((b): Row[] => {
        const base: Row = { date: day(b.docDate)!, docType: b.channel === 'COUNTER' ? 'PV' : 'BILL', docNo: b.docNo, docId: b.id, reference: b.vendorInvoiceNo, description: b.channel === 'COUNTER' ? 'Purchase voucher' : 'Vendor bill', debit: 0, credit: num(b.netPayableAmount), balance: 0 };
        return num(b.paidNowAmount) > 0 ? [base, { ...base, description: 'Paid at purchase', debit: num(b.paidNowAmount), credit: 0 }] : [base];
      }),
      ...pays.map((p): Row => ({ date: day(p.docDate)!, docType: 'PAY', docNo: p.docNo, docId: p.id, reference: p.chequeNo, description: `Payment · ${p.method.replace('_', ' ').toLowerCase()}${num(p.whtAmount) ? ' (incl. WHT)' : ''}`, debit: r2(num(p.amount) + num(p.whtAmount)), credit: 0, balance: 0 })),
      ...dns.map((d): Row => ({ date: day(d.docDate)!, docType: 'DN', docNo: d.docNo, docId: d.id, reference: null, description: `Debit note · ${d.reason.replace('_', ' ').toLowerCase()}`, debit: r2(num(d.totalAmount) - num(d.whtAmount)), credit: 0, balance: 0 })),
      ...prs.map((p): Row => ({ date: day(p.docDate)!, docType: 'PR', docNo: p.docNo, docId: p.id, reference: p.supplierBillNo, description: 'Purchase return', debit: num(p.totalAmount), credit: 0, balance: 0 })),
      ...refunds.map((x): Row => ({ date: day(x.docDate)!, docType: 'DN', docNo: x.docNo, docId: x.id, reference: x.sourceDocNo, description: 'Refund received', debit: 0, credit: num(x.totalDebit), balance: 0 })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.docNo.localeCompare(b.docNo)));
    const before = all.filter((x) => x.date < from);
    const inside = all.filter((x) => x.date >= from);
    const opening = r2(before.reduce((s, x) => s + x.credit - x.debit, 0));
    let bal = opening;
    const rows = inside.map((x) => { bal = r2(bal + x.credit - x.debit); return { ...x, balance: bal }; });
    const sum = (k: Row['docType'][], side: 'debit' | 'credit') => r2(inside.filter((x) => k.includes(x.docType)).reduce((s, x) => s + x[side], 0));
    return {
      vendor: { id: v.id, code: v.code, name: v.name, ntn: v.ntn, city: v.city }, from, to, openingBalance: opening, closingBalance: bal,
      totals: { billed: sum(['BILL', 'PV'], 'credit'), paid: r2(sum(['PAY'], 'debit') + sum(['BILL', 'PV'], 'debit')), debitNotes: sum(['DN'], 'debit'), returns: sum(['PR'], 'debit'), wht: r2(pays.filter((p) => day(p.docDate)! >= from).reduce((s, p) => s + num(p.whtAmount), 0)) },
      rows,
    };
  }
}
