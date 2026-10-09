import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ItemInsight, Grn, GrnList, ImportGrn, LandedCost, LandedCostList, PurchaseOptions, PurchaseOrderList, VendorBillList } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { bankAccountRefs, day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { PurchasingStore, type BillBase, type Doc, type Lifecycle, type ListQuery, type OrderBase, type SaveFunction } from '../application/purchasing-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };
const LIFECYCLE_TEXT: Lifecycle[] = ['purchaseOrderApprove', 'purchaseOrderCancel', 'goodsReceivedNoteCancel', 'vendorBillApprove', 'vendorBillVoid', 'landedCostShipmentCancel'];
const OPEN_BILL = ['POSTED', 'PARTIALLY_PAID'];
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date(`${today().slice(0, 7)}-01`);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

async function refs(db: Db, tenantId: string, k: { vendors?: (string | null)[]; branches?: (string | null)[]; warehouses?: (string | null)[]; costCentres?: (string | null)[]; departments?: (string | null)[]; projects?: (string | null)[]; accounts?: (string | null)[]; taxCodes?: (string | null)[]; products?: (string | null)[] }) {
  const q = <T,>(xs: (string | null)[] | undefined, f: (i: string[]) => Promise<T[]>) => (xs && ids(xs).length ? f(ids(xs)) : Promise.resolve([] as T[]));
  const [vendors, branches, warehouses, costCentres, departments, projects, accounts, taxCodes, products] = await Promise.all([
    q(k.vendors, (i) => db.vendors.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.branches, (i) => db.branches.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.warehouses, (i) => db.warehouses.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.costCentres, (i) => db.costCentres.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.departments, (i) => db.departments.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.projects, (i) => db.projects.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.accounts, (i) => db.chartOfAccounts.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.taxCodes, (i) => db.taxCodes.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, description: true } })),
    q(k.products, (i) => db.products.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, sku: true, name: true, ctn: true, trackExpiry: true, weightKg: true } })),
  ]);
  return {
    vendors: vendors as Ref[], branches: branches as Ref[], warehouses: warehouses as Ref[], costCentres: costCentres as Ref[], departments: departments as Ref[],
    projects: projects as Ref[], accounts: accounts as Ref[],
    taxCodes: taxCodes.map((t) => ({ id: t.id, code: t.code, name: t.description })),
    products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, ctn: p.ctn, trackExpiry: p.trackExpiry, weightKg: p.weightKg ? num(p.weightKg) : null })),
  };
}
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };

@Injectable()
export class PrismaPurchasingStore extends PurchasingStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ---------------------------------------------------------------- options
  async options(tenantId: string): Promise<PurchaseOptions> {
    const db = this.prisma.db();
    const [vendors, products, uoms, warehouses, taxCodes, rates, branches, costCentres, departments, projects, coa, banks, cash, users, lookups] = await Promise.all([
      db.vendors.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      db.products.findMany({ where: { tenantId, deletedAt: null, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }),
      db.unitsOfMeasure.findMany({ where: { tenantId }, select: { id: true, code: true } }),
      db.warehouses.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, branchId: true, type: true }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }),
      db.taxCodes.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: { code: 'asc' } }),
      db.taxCodeRates.findMany({ where: { tenantId, effectiveFrom: { lte: new Date(today()) } }, orderBy: { effectiveFrom: 'desc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.costCentres.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.departments.findMany({ where: { tenantId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.projects.findMany({ where: { tenantId, status: { notIn: ['CLOSED', 'CANCELLED'] } }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: 'asc' } }),
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, accountTitle: true, accountLast4: true, branchId: true }, orderBy: { accountTitle: 'asc' } }),
      db.cashAccounts.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: 'asc' } }),
      db.users.findMany({ where: { tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
      db.lookups.findMany({ where: { lookupType: { in: ['RejectReason', 'ChargeType', 'WhtSection', 'PurchaseOrderPaymentTerms'] }, isActive: true, OR: [{ tenantId: null }, { tenantId }] }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const rateOf = (taxCodeId: string) => rates.find((r) => r.taxCodeId === taxCodeId && (!r.effectiveTo || day(r.effectiveTo)! >= today()));
    const lk = (t: string) => lookups.filter((l) => l.lookupType === t).map((l) => ({ code: l.code, label: l.label }));
    return {
      vendors: vendors.map((v) => ({ id: v.id, code: v.code, name: v.name, paymentTerms: v.paymentTerms, creditDays: v.creditDays, whtSection: v.defaultWhtSection, atlStatus: v.atlStatus, payableAccountId: v.payableAccountId, defaultAccountId: v.defaultAccountId, currencyCode: v.currencyCode, ntn: v.ntn })),
      products: products.map((p) => ({
        id: p.id, sku: p.sku, name: p.name, upc: p.upc, ctn: p.ctn, unit: uoms.find((u) => u.id === p.uomId)?.code ?? null, trackExpiry: p.trackExpiry,
        cost: num(p.cost), avgCost: num(p.avgCost), price: num(p.price), taxCodeId: p.taxCodeId, gstRate: num(p.gstRate), weightKg: p.weightKg ? num(p.weightKg) : null,
      })),
      warehouses,
      taxCodes: taxCodes.map((t) => {
        const r = rateOf(t.id);
        return { id: t.id, code: t.code, name: t.description, taxType: t.taxType, whtSection: t.whtSection, rate: r?.rate ? num(r.rate) : null, nonAtlRate: r?.nonAtlRate ? num(r.nonAtlRate) : null };
      }),
      branches, costCentres, departments, projects,
      accounts: coa.map((a) => ({ id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass) })),
      bankAccounts: banks.map((b) => ({ id: b.id, title: b.accountTitle, last4: b.accountLast4, branchId: b.branchId })),
      cashAccounts: cash,
      users: users.map((u) => ({ id: u.id, name: u.fullName })),
      rejectReasons: lk('RejectReason'), chargeTypes: lk('ChargeType'), whtSections: lk('WhtSection'), paymentTerms: lk('PurchaseOrderPaymentTerms'),
    };
  }

  // ---------------------------------------------------------------- purchase orders
  async listOrders(tenantId: string, q: ListQuery): Promise<PurchaseOrderList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.PurchaseOrdersWhereInput = {
      tenantId, ...(q.vendor && { vendorId: q.vendor }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { remarks: { contains: s, mode: 'insensitive' } }, { vendorId: { in: await this.vendorIds(tenantId, s) } }] }),
    };
    const where: Prisma.PurchaseOrdersWhereInput = { ...base, ...(q.status && { status: q.status === 'PENDING' ? { in: ['PENDING_L1', 'PENDING_L2'] } : q.status === 'OPEN' ? { in: ['APPROVED', 'PARTIALLY_RECEIVED'] } : q.status }) };
    const [rows, total, byStatus, open, pending, awaiting, month] = await Promise.all([
      db.purchaseOrders.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.purchaseOrders.count({ where }),
      db.purchaseOrders.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.purchaseOrders.aggregate({ where: { ...base, status: { in: ['APPROVED', 'PARTIALLY_RECEIVED'] } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      db.purchaseOrders.aggregate({ where: { ...base, status: { in: ['PENDING_L1', 'PENDING_L2'] } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      db.purchaseOrders.count({ where: { ...base, status: 'APPROVED' } }),
      db.purchaseOrders.aggregate({ where: { ...base, status: { not: 'CANCELLED' }, docDate: { gte: monthStart() } }, _sum: { totalAmount: true } }),
    ]);
    const items = (await this.mapOrders(tenantId, rows, false)).map(({ lines, grns, ...r }) => { void lines; void grns; return r; });
    return {
      items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: { open: open._count._all, openAmount: num(open._sum.totalAmount), pending: pending._count._all, pendingAmount: num(pending._sum.totalAmount), awaitingReceipt: awaiting, thisMonthAmount: num(month._sum.totalAmount) },
    };
  }

  async getOrder(tenantId: string, id: string) {
    const row = await this.prisma.db().purchaseOrders.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapOrders(tenantId, [row], true))[0]! : null;
  }

  private async mapOrders(tenantId: string, rows: Prisma.PurchaseOrdersGetPayload<object>[], full: boolean): Promise<OrderBase[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const allLines = await db.purchaseOrderLines.findMany({ where: { tenantId, purchaseOrderId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } });
    const lines = full ? allLines : [];
    const [r, users, grns] = await Promise.all([
      refs(db, tenantId, {
        vendors: rows.map((x) => x.vendorId), branches: rows.map((x) => x.branchId), warehouses: rows.map((x) => x.warehouseId), costCentres: [...rows.map((x) => x.costCentreId), ...lines.map((l) => l.costCentreId)],
        departments: rows.map((x) => x.departmentId), projects: rows.map((x) => x.projectId), accounts: lines.map((l) => l.accountId), taxCodes: lines.map((l) => l.taxCodeId), products: lines.map((l) => l.itemId),
      }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.buyerUserId, x.approvedByUserId, x.createdBy])),
      full ? db.goodsReceivedNotes.findMany({ where: { tenantId, purchaseOrderId: { in: rows.map((x) => x.id) } }, select: { id: true, docNo: true, docDate: true, status: true, purchaseOrderId: true }, orderBy: { docNo: 'asc' } }) : Promise.resolve([]),
    ]);
    return rows.map((x) => {
      const mine = allLines.filter((l) => l.purchaseOrderId === x.id);
      const ordered = mine.reduce((s, l) => s + num(l.baseQty) + num(l.bonusQty), 0);
      const pctOf = (k: 'receivedQty' | 'billedQty') => (ordered > 0 ? Math.min(100, Math.round((mine.reduce((s, l) => s + num(l[k]), 0) / ordered) * 100)) : 0);
      return {
        id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, vendor: ref(r.vendors, x.vendorId), branch: ref(r.branches, x.branchId), warehouse: find(r.warehouses, x.warehouseId),
        expectedDate: day(x.expectedDate), paymentTerms: x.paymentTerms, creditDays: x.creditDays, costCentre: find(r.costCentres, x.costCentreId), department: find(r.departments, x.departmentId),
        project: find(r.projects, x.projectId), buyer: users.get(x.buyerUserId ?? '') ?? null, currencyCode: x.currencyCode, grossAmount: num(x.grossAmount), discountAmount: num(x.discountAmount),
        netAmount: num(x.netAmount), taxAmount: num(x.taxAmount), totalAmount: num(x.totalAmount), status: x.status, submittedAt: iso(x.submittedAt), approvedBy: users.get(x.approvedByUserId ?? '') ?? null,
        approvedAt: iso(x.approvedAt), cancelledAt: iso(x.cancelledAt), cancelReason: x.cancelReason, remarks: x.remarks, createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(),
        rowVersion: x.rowVersion, receivedPct: pctOf('receivedQty'), billedPct: pctOf('billedQty'),
        lines: lines.filter((l) => l.purchaseOrderId === x.id).map((l) => ({
          id: l.id, lineNo: l.lineNo, item: find(r.products, l.itemId), description: l.description, account: find(r.accounts, l.accountId), qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose),
          baseQty: num(l.baseQty), bonusQty: num(l.bonusQty), rate: num(l.rate), discountPct: num(l.discountPct), grossAmount: num(l.grossAmount), discountAmount: num(l.discountAmount),
          netAmount: num(l.netAmount), taxCode: find(r.taxCodes, l.taxCodeId), taxRate: num(l.taxRate), taxAmount: num(l.taxAmount), totalAmount: num(l.totalAmount),
          receivedQty: num(l.receivedQty), billedQty: num(l.billedQty), openQty: Math.max(0, num(l.baseQty) + num(l.bonusQty) - num(l.receivedQty)), costCentre: find(r.costCentres, l.costCentreId), remarks: l.remarks,
        })),
        grns: grns.filter((g) => g.purchaseOrderId === x.id).map((g) => ({ id: g.id, docNo: g.docNo, docDate: day(g.docDate)!, status: g.status })),
      };
    });
  }

  // ---------------------------------------------------------------- goods received notes
  async listGrns(tenantId: string, q: ListQuery): Promise<GrnList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.GoodsReceivedNotesWhereInput = {
      tenantId, ...(q.vendor && { vendorId: q.vendor }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { vendorRef: { contains: s, mode: 'insensitive' } }, { vendorId: { in: await this.vendorIds(tenantId, s) } }] }),
    };
    const where: Prisma.GoodsReceivedNotesWhereInput = { ...base, ...(q.status && { status: q.status }), ...(q.match && { billStatus: q.match }) };
    const [rows, total, byStatus, drafts, posted, awaiting] = await Promise.all([
      db.goodsReceivedNotes.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.goodsReceivedNotes.count({ where }),
      db.goodsReceivedNotes.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.goodsReceivedNotes.count({ where: { ...base, status: 'DRAFT' } }),
      db.goodsReceivedNotes.aggregate({ where: { ...base, status: 'POSTED', docDate: { gte: monthStart() } }, _sum: { acceptedAmount: true }, _count: { _all: true } }),
      db.goodsReceivedNotes.aggregate({ where: { ...base, status: 'POSTED', billStatus: { in: ['AWAITING', 'PARTIALLY_BILLED'] } }, _sum: { acceptedAmount: true }, _count: { _all: true } }),
    ]);
    const items = (await this.mapGrns(tenantId, rows, false)).map(({ lines, bills, ...r }) => { void lines; void bills; return r; });
    return {
      items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: { drafts, postedThisMonth: posted._count._all, valueThisMonth: num(posted._sum.acceptedAmount), awaitingBill: awaiting._count._all, awaitingBillAmount: num(awaiting._sum.acceptedAmount) },
    };
  }

  async getGrn(tenantId: string, id: string) {
    const row = await this.prisma.db().goodsReceivedNotes.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapGrns(tenantId, [row], true))[0]! : null;
  }

  private async mapGrns(tenantId: string, rows: Prisma.GoodsReceivedNotesGetPayload<object>[], full: boolean): Promise<Grn[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.goodsReceivedNoteLines.findMany({ where: { tenantId, grnId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const batches = full ? await db.productBatches.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.batchId)) } }, select: { id: true, batchNo: true, expiryDate: true } }) : [];
    const [r, users, pos, vouchers, bills] = await Promise.all([
      refs(db, tenantId, { vendors: rows.map((x) => x.vendorId), branches: rows.map((x) => x.branchId), warehouses: rows.map((x) => x.warehouseId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.map((x) => x.createdBy)),
      db.purchaseOrders.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.purchaseOrderId)) } }, select: { id: true, docNo: true } }),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
      full ? db.vendorBills.findMany({ where: { tenantId, grnId: { in: rows.map((x) => x.id) } }, select: { id: true, docNo: true, status: true, grnId: true } }) : Promise.resolve([]),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, purchaseOrder: find(pos, x.purchaseOrderId), vendor: ref(r.vendors, x.vendorId), branch: ref(r.branches, x.branchId),
      warehouse: ref(r.warehouses, x.warehouseId), vendorRef: x.vendorRef, qcStatus: x.qcStatus, qcNote: x.qcNote, matchStatus: x.matchStatus, billStatus: x.billStatus,
      receivedQty: num(x.receivedQty), acceptedAmount: num(x.acceptedAmount), rejectedAmount: num(x.rejectedAmount), isImport: x.isImport, status: x.status, postedAt: iso(x.postedAt),
      voucher: vouchers.get(x.journalEntryId ?? '') ?? null, cancelledAt: iso(x.cancelledAt), cancelReason: x.cancelReason, remarks: x.remarks, createdBy: users.get(x.createdBy ?? '') ?? null,
      createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.grnId === x.id).map((l) => {
        const b = find(batches, l.batchId);
        const p = find(r.products, l.itemId);
        return {
          id: l.id, lineNo: l.lineNo, purchaseOrderLineId: l.purchaseOrderLineId, item: p ? { id: p.id, sku: p.sku, name: p.name, trackExpiry: p.trackExpiry } : { id: l.itemId, sku: '?', name: '?', trackExpiry: false },
          orderedQty: num(l.orderedQty), prevReceivedQty: num(l.prevReceivedQty), receivedQty: num(l.receivedQty), acceptedQty: num(l.acceptedQty), rejectedQty: num(l.rejectedQty),
          rejectReason: l.rejectReason, batchNo: l.batchNo ?? b?.batchNo ?? null, expiryDate: day(l.expiryDate) ?? day(b?.expiryDate), unitCost: num(l.unitCost),
          acceptedAmount: num(l.acceptedAmount), rejectedAmount: num(l.rejectedAmount), billedQty: num(l.billedQty),
        };
      }),
      bills: bills.filter((b) => b.grnId === x.id).map((b) => ({ id: b.id, docNo: b.docNo, status: b.status })),
    }));
  }

  // ---------------------------------------------------------------- vendor bills
  async listBills(tenantId: string, q: ListQuery): Promise<VendorBillList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.VendorBillsWhereInput = {
      tenantId, ...(q.vendor && { vendorId: q.vendor }), ...(q.channel && { channel: q.channel }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { vendorInvoiceNo: { contains: s, mode: 'insensitive' } }, { vendorId: { in: await this.vendorIds(tenantId, s) } }] }),
    };
    const t = new Date(today());
    const week = new Date(t.getTime() + 7 * 86_400_000);
    const statusWhere = (st: string): Prisma.VendorBillsWhereInput => (st === 'OVERDUE' ? { status: { in: OPEN_BILL }, dueDate: { lt: t } } : st === 'DISPUTED' ? { isDisputed: true } : { status: st });
    const where: Prisma.VendorBillsWhereInput = { ...base, ...(q.status && statusWhere(q.status)), ...(q.match && { matchStatus: q.match }) };
    const [rows, total, byStatus, byMatch, outstanding, overdue, dueWeek, pending, disputed] = await Promise.all([
      db.vendorBills.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.vendorBills.count({ where }),
      db.vendorBills.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.vendorBills.groupBy({ by: ['matchStatus'], where: { ...base, status: { not: 'VOID' } }, _count: { _all: true } }),
      db.vendorBills.aggregate({ where: { ...base, status: { in: OPEN_BILL } }, _sum: { balanceAmount: true } }),
      db.vendorBills.aggregate({ where: { ...base, status: { in: OPEN_BILL }, dueDate: { lt: t } }, _sum: { balanceAmount: true }, _count: { _all: true } }),
      db.vendorBills.aggregate({ where: { ...base, status: { in: OPEN_BILL }, dueDate: { gte: t, lte: week } }, _sum: { balanceAmount: true } }),
      db.vendorBills.count({ where: { ...base, status: 'AWAITING_APPROVAL' } }),
      db.vendorBills.count({ where: { ...base, isDisputed: true, status: { not: 'VOID' } } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    counts.OVERDUE = overdue._count._all;
    counts.DISPUTED = disputed;
    const items = (await this.mapBills(tenantId, rows, false)).map(({ lines, ...r }) => { void lines; return r; });
    return {
      items, total, counts, matchCounts: Object.fromEntries(byMatch.map((b) => [b.matchStatus, b._count._all])),
      kpis: { outstanding: num(outstanding._sum.balanceAmount), overdue: num(overdue._sum.balanceAmount), overdueCount: overdue._count._all, dueThisWeek: num(dueWeek._sum.balanceAmount), pendingApproval: pending, disputed },
    };
  }

  async getBill(tenantId: string, id: string) {
    const row = await this.prisma.db().vendorBills.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapBills(tenantId, [row], true))[0]! : null;
  }

  private async mapBills(tenantId: string, rows: Prisma.VendorBillsGetPayload<object>[], full: boolean): Promise<BillBase[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.vendorBillLines.findMany({ where: { tenantId, billId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, pos, grns, vouchers, banks, cash, cheques, poLines, grnLines] = await Promise.all([
      refs(db, tenantId, {
        vendors: rows.map((x) => x.vendorId), branches: rows.map((x) => x.branchId), warehouses: rows.map((x) => x.warehouseId),
        costCentres: [...rows.map((x) => x.costCentreId), ...lines.map((l) => l.costCentreId)], projects: [...rows.map((x) => x.projectId), ...lines.map((l) => l.projectId)],
        accounts: [...rows.map((x) => x.payableAccountId), ...lines.map((l) => l.accountId)], taxCodes: lines.map((l) => l.taxCodeId), products: lines.map((l) => l.itemId),
      }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.purchaserUserId, x.approvedByUserId, x.createdBy])),
      db.purchaseOrders.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.purchaseOrderId)) } }, select: { id: true, docNo: true } }),
      db.goodsReceivedNotes.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.grnId)) } }, select: { id: true, docNo: true } }),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
      bankAccountRefs(db, tenantId, rows.map((x) => x.bankAccountId)),
      db.cashAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.cashAccountId)) } }, select: { id: true, code: true, name: true } }),
      db.cheques.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.chequeId)) } }, select: { id: true, docNo: true, status: true } }),
      db.purchaseOrderLines.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.purchaseOrderLineId)) } }, select: { id: true, rate: true } }),
      db.goodsReceivedNoteLines.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.grnLineId)) } }, select: { id: true, acceptedQty: true } }),
    ]);
    const t = today();
    return rows.map((x) => {
      const due = day(x.dueDate)!;
      return {
        id: x.id, channel: x.channel, docNo: x.docNo, docDate: day(x.docDate)!, dueDate: due, vendor: ref(r.vendors, x.vendorId), branch: ref(r.branches, x.branchId),
        warehouse: find(r.warehouses, x.warehouseId), purchaseOrder: find(pos, x.purchaseOrderId), grn: find(grns, x.grnId), vendorInvoiceNo: x.vendorInvoiceNo,
        payableAccount: find(r.accounts, x.payableAccountId), currencyCode: x.currencyCode, purchaser: users.get(x.purchaserUserId ?? '') ?? null, costCentre: find(r.costCentres, x.costCentreId),
        project: find(r.projects, x.projectId), dealOnSupply: x.dealOnSupply, retailPriceDiscountPct: num(x.retailPriceDiscountPct), captureMethod: x.captureMethod,
        grossAmount: num(x.grossAmount), discountAmount: num(x.discountAmount), netAmount: num(x.netAmount), taxAmount: num(x.taxAmount), advanceTaxAmount: num(x.advanceTaxAmount),
        totalAmount: num(x.totalAmount), whtAmount: num(x.whtAmount), netPayableAmount: num(x.netPayableAmount), payMode: x.payMode,
        bankAccount: x.bankAccountId ? { id: x.bankAccountId, title: banks.get(x.bankAccountId)?.title ?? '?' } : null, cashAccount: find(cash, x.cashAccountId), chequeNo: x.chequeNo,
        cheque: find(cheques, x.chequeId), paidNowAmount: num(x.paidNowAmount), balanceAmount: num(x.balanceAmount), matchStatus: x.matchStatus,
        matchVariancePct: x.matchVariancePct ? num(x.matchVariancePct) : null, isDisputed: x.isDisputed, disputeNote: x.disputeNote, status: x.status, submittedAt: iso(x.submittedAt),
        approvedBy: users.get(x.approvedByUserId ?? '') ?? null, approvedAt: iso(x.approvedAt), postedAt: iso(x.postedAt), voucher: vouchers.get(x.journalEntryId ?? '') ?? null,
        voidedAt: iso(x.voidedAt), voidReason: x.voidReason, remarks: x.remarks, createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
        overdueDays: OPEN_BILL.includes(x.status) && due < t ? daysBetween(due, t) : 0,
        lines: lines.filter((l) => l.billId === x.id).map((l) => ({
          id: l.id, lineNo: l.lineNo, item: find(r.products, l.itemId), description: l.description, account: find(r.accounts, l.accountId), purchaseOrderLineId: l.purchaseOrderLineId,
          grnLineId: l.grnLineId, upc: l.upc, qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose), baseQty: num(l.baseQty), bonusQty: num(l.bonusQty), breakageQty: num(l.breakageQty),
          totalQty: num(l.totalQty), rate: num(l.rate), salePrice: l.salePrice ? num(l.salePrice) : null, updateItemSalePrice: l.updateItemSalePrice, discountPct: num(l.discountPct),
          grossAmount: num(l.grossAmount), discountAmount: num(l.discountAmount), netAmount: num(l.netAmount), taxCode: find(r.taxCodes, l.taxCodeId), taxRate: num(l.taxRate),
          taxAmount: num(l.taxAmount), totalAmount: num(l.totalAmount), whtSection: l.whtSection, whtRate: num(l.whtRate), whtAmount: num(l.whtAmount),
          netUnitCost: l.netUnitCost ? num(l.netUnitCost) : null, batchNo: l.batchNo, expiryDate: day(l.expiryDate), costCentre: find(r.costCentres, l.costCentreId), project: find(r.projects, l.projectId),
          poRate: (() => { const p = poLines.find((p) => p.id === l.purchaseOrderLineId); return p ? num(p.rate) : null; })(),
          receivedQty: (() => { const g = grnLines.find((g) => g.id === l.grnLineId); return g ? num(g.acceptedQty) : null; })(),
        })),
      };
    });
  }

  // ---------------------------------------------------------------- landed cost
  async listLandedCosts(tenantId: string, q: ListQuery): Promise<LandedCostList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.LandedCostShipmentsWhereInput = {
      tenantId, ...(q.vendor && { vendorId: q.vendor }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { gdNo: { contains: s, mode: 'insensitive' } }, { billOfLadingNo: { contains: s, mode: 'insensitive' } }, { lcRef: { contains: s, mode: 'insensitive' } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus] = await Promise.all([
      db.landedCostShipments.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.landedCostShipments.count({ where }),
      db.landedCostShipments.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const items = (await this.mapLc(tenantId, rows, false)).map(({ items, charges, ...r }) => { void items; void charges; return r; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) };
  }

  async getLandedCost(tenantId: string, id: string) {
    const row = await this.prisma.db().landedCostShipments.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapLc(tenantId, [row], true))[0]! : null;
  }

  private async mapLc(tenantId: string, rows: Prisma.LandedCostShipmentsGetPayload<object>[], full: boolean): Promise<LandedCost[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const items = full ? await db.landedCostItems.findMany({ where: { tenantId, shipmentId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const charges = full ? await db.landedCostCharges.findMany({ where: { tenantId, shipmentId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, grns, vouchers, banks] = await Promise.all([
      refs(db, tenantId, { vendors: [...rows.map((x) => x.vendorId), ...charges.map((c) => c.payeeVendorId)], branches: rows.map((x) => x.branchId), products: items.map((i) => i.itemId), accounts: charges.map((c) => c.claimAccountId) }),
      userRefs(db, tenantId, rows.map((x) => x.createdBy)),
      db.goodsReceivedNotes.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.grnId)) } }, select: { id: true, docNo: true, status: true } }),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
      bankAccountRefs(db, tenantId, rows.map((x) => x.bankAccountId)),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, vendor: ref(r.vendors, x.vendorId), branch: ref(r.branches, x.branchId), grn: find(grns, x.grnId), originCountry: x.originCountry,
      portOfLoading: x.portOfLoading, portOfDischarge: x.portOfDischarge, shipmentMode: x.shipmentMode, containerInfo: x.containerInfo, billOfLadingNo: x.billOfLadingNo, gdNo: x.gdNo,
      lcRef: x.lcRef, bankAccount: x.bankAccountId ? { id: x.bankAccountId, title: banks.get(x.bankAccountId)?.title ?? '?' } : null, currencyCode: x.currencyCode, fxRate: num(x.fxRate),
      eta: day(x.eta), clearedOn: day(x.clearedOn), allocationBasis: x.allocationBasis, fobAmount: num(x.fobAmount), capitalisedAmount: num(x.capitalisedAmount),
      claimableAmount: num(x.claimableAmount), landedValueAmount: num(x.landedValueAmount), status: x.status, postedAt: iso(x.postedAt), voucher: vouchers.get(x.journalEntryId ?? '') ?? null,
      cancelledAt: iso(x.cancelledAt), cancelReason: x.cancelReason, remarks: x.remarks, createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      items: items.filter((i) => i.shipmentId === x.id).map((i) => {
        const p = find(r.products, i.itemId);
        return {
          id: i.id, lineNo: i.lineNo, grnLineId: i.grnLineId, item: p ? { id: p.id, sku: p.sku, name: p.name } : { id: i.itemId, sku: '?', name: '?' }, qty: num(i.qty), weightKg: num(i.weightKg),
          fobUnitFcy: num(i.fobUnitFcy), fobAmount: num(i.fobAmount), sharePct: num(i.sharePct), allocatedAmount: num(i.allocatedAmount), landedUnitCost: i.landedUnitCost ? num(i.landedUnitCost) : null,
        };
      }),
      charges: charges.filter((c) => c.shipmentId === x.id).map((c) => ({
        id: c.id, lineNo: c.lineNo, chargeType: c.chargeType, description: c.description, payeeVendor: find(r.vendors, c.payeeVendorId), payeeName: c.payeeName,
        ratePct: c.ratePct ? num(c.ratePct) : null, amount: num(c.amount), isCapitalised: c.isCapitalised, isClaimable: c.isClaimable, claimAccount: find(r.accounts, c.claimAccountId),
      })),
    }));
  }

  async itemInsight(tenantId: string, itemId: string): Promise<ItemInsight | null> {
    const db = this.prisma.db();
    const p = await db.products.findFirst({ where: { tenantId, id: itemId }, select: { id: true, sku: true, name: true, price: true, avgCost: true } });
    if (!p) return null;
    const [stock, logs, lines] = await Promise.all([
      db.$queryRaw<{ id: string; code: string; name: string; onHand: string; reserved: string; available: string }[]>`
        select w.id, w.code, w.name, sum(b."qtyOnHand")::text as "onHand", sum(coalesce(b."qtyReserved", 0))::text as reserved, sum(coalesce(b."qtyAvailable", b."qtyOnHand"))::text as available
          from "Inventory"."StockBalances" b join "Inventory"."Warehouses" w on w."tenantId" = b."tenantId" and w.id = b."warehouseId"
         where b."tenantId" = ${tenantId}::uuid and b."itemId" = ${itemId}::uuid
         group by w.id, w.code, w.name having sum(b."qtyOnHand") <> 0 order by w.name`,
      db.productPriceLogs.findMany({ where: { tenantId, itemId, priceField: 'PRICE' }, orderBy: { changedAt: 'desc' }, take: 5 }),
      db.vendorBillLines.findMany({ where: { tenantId, itemId }, orderBy: { createdAt: 'desc' }, take: 40, select: { billId: true, baseQty: true, bonusQty: true, rate: true } }),
    ]);
    const bills = await db.vendorBills.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.billId)) }, status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] } }, select: { id: true, docNo: true, docDate: true, vendorId: true } });
    const vendors = await db.vendors.findMany({ where: { tenantId, id: { in: ids(bills.map((b) => b.vendorId)) } }, select: { id: true, name: true } });
    const lastPurchases = lines.flatMap((l) => {
      const b = bills.find((x) => x.id === l.billId);
      return b ? [{ date: day(b.docDate)!, docNo: b.docNo, billId: b.id, vendor: vendors.find((v) => v.id === b.vendorId)?.name ?? '?', qty: num(l.baseQty) + num(l.bonusQty), rate: num(l.rate) }] : [];
    }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.docNo.localeCompare(a.docNo))).slice(0, 5);
    const rows = stock.map((s) => ({ warehouse: { id: s.id, code: s.code, name: s.name }, onHand: Number(s.onHand), reserved: Number(s.reserved), available: Number(s.available) }));
    return {
      item: { id: p.id, sku: p.sku, name: p.name, price: num(p.price), avgCost: num(p.avgCost) },
      stock: rows, onHand: rows.reduce((s, r) => s + r.onHand, 0),
      priceLog: logs.map((l) => ({ at: l.changedAt.toISOString(), oldValue: l.oldValue ? num(l.oldValue) : null, newValue: num(l.newValue), source: l.source })),
      lastPurchases,
    };
  }

  async importGrns(tenantId: string): Promise<ImportGrn[]> {
    const db = this.prisma.db();
    const used = await db.landedCostShipments.findMany({ where: { tenantId, status: { not: 'CANCELLED' }, grnId: { not: null } }, select: { grnId: true } });
    const grns = await db.goodsReceivedNotes.findMany({ where: { tenantId, status: 'POSTED', isImport: true, id: { notIn: ids(used.map((u) => u.grnId)) } }, orderBy: { docDate: 'desc' }, take: 100 });
    const lines = await db.goodsReceivedNoteLines.findMany({ where: { tenantId, grnId: { in: grns.map((g) => g.id) }, acceptedQty: { gt: 0 } }, orderBy: { lineNo: 'asc' } });
    const r = await refs(db, tenantId, { vendors: grns.map((g) => g.vendorId), products: lines.map((l) => l.itemId) });
    return grns.map((g) => ({
      id: g.id, docNo: g.docNo, docDate: day(g.docDate)!, vendor: ref(r.vendors, g.vendorId),
      lines: lines.filter((l) => l.grnId === g.id).map((l) => {
        const p = find(r.products, l.itemId);
        return { id: l.id, item: { id: l.itemId, sku: p?.sku ?? '?', name: p?.name ?? '?', weightKg: p?.weightKg ?? null }, acceptedQty: num(l.acceptedQty), unitCost: num(l.unitCost) };
      }),
    }));
  }

  // ---------------------------------------------------------------- writes
  save(fn: SaveFunction, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async set(doc: Doc, tenantId: string, id: string, data: Record<string, unknown>) {
    const db = this.prisma.db();
    const where = { tenantId, id };
    if (doc === 'order') await db.purchaseOrders.updateMany({ where, data });
    else if (doc === 'grn') await db.goodsReceivedNotes.updateMany({ where, data });
    else if (doc === 'bill') await db.vendorBills.updateMany({ where, data });
    else await db.landedCostShipments.updateMany({ where, data });
  }

  async run(fn: Lifecycle, id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (LIFECYCLE_TEXT.includes(fn)) await db.$queryRawUnsafe(`select "Purchases"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "Purchases"."${fn}"($1::uuid)::text`, id);
  }

  async deleteDraft(doc: Doc, tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (doc === 'order') {
      if (!(await db.purchaseOrders.count({ where: { tenantId, id, rowVersion, status: 'DRAFT', submittedAt: null } }))) return false;
      await db.purchaseOrderLines.deleteMany({ where: { tenantId, purchaseOrderId: id } });
      return (await db.purchaseOrders.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (doc === 'grn') {
      if (!(await db.goodsReceivedNotes.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.goodsReceivedNoteLines.deleteMany({ where: { tenantId, grnId: id } });
      return (await db.goodsReceivedNotes.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (doc === 'bill') {
      if (!(await db.vendorBills.count({ where: { tenantId, id, rowVersion, status: 'DRAFT', submittedAt: null } }))) return false;
      await db.vendorBillLines.deleteMany({ where: { tenantId, billId: id } });
      return (await db.vendorBills.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (!(await db.landedCostShipments.count({ where: { tenantId, id, rowVersion, status: { in: ['IN_TRANSIT', 'CLEARED'] } } }))) return false;
    await db.landedCostItems.deleteMany({ where: { tenantId, shipmentId: id } });
    await db.landedCostCharges.deleteMany({ where: { tenantId, shipmentId: id } });
    return (await db.landedCostShipments.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
  }

  async roleAccount(tenantId: string, role: string) {
    return (await this.prisma.db().defaultAccountMappings.findFirst({ where: { tenantId, role }, select: { accountId: true } }))?.accountId ?? null;
  }

  async duplicateInvoice(tenantId: string, vendorId: string, invoiceNo: string, exceptId: string | null) {
    const b = await this.prisma.db().vendorBills.findFirst({
      where: { tenantId, vendorId, status: { not: 'VOID' }, vendorInvoiceNo: { equals: invoiceNo.trim(), mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
      select: { docNo: true },
    });
    return b?.docNo ?? null;
  }

  private async vendorIds(tenantId: string, s: string) {
    return (await this.prisma.db().vendors.findMany({ where: { tenantId, OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } }] }, select: { id: true }, take: 50 })).map((v) => v.id);
  }
}
