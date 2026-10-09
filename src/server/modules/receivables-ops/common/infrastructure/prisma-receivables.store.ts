import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type {
  ArAgeing, ArAgeingRow, CreditNote, CreditNoteList, CustomerReceipt, CustomerReceiptList, CustomerStatement, CustomerOpenItems, PosHeldSale, PosShift, PosShiftList,
  PosShiftReport, ReceivablesOptions, ReceivablesQuery, RecurringInvoice, RecurringInvoiceList, ReturnableInvoice, SalesReturn, SalesReturnList,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { SalesStore } from '../../../sales/common/application/sales-store.js';
import { ReceivablesStore, type DueRecurring, type ReceivablesDoc, type ReceivablesLifecycle, type ReceivablesSave } from '../application/receivables-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };
const page = (q: ReceivablesQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
const monthStart = () => new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`);
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const dateRange = (q: ReceivablesQuery) => (q.from || q.to ? { ...(q.from && { gte: new Date(`${q.from}T00:00:00Z`) }), ...(q.to && { lte: new Date(`${q.to}T00:00:00Z`) }) } : undefined);
const count = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));

const LOOKUPS = {
  receiptMethods: 'CustomerReceiptMethod', returnReasons: 'SalesReturnLineReason', dispositions: 'SalesReturnLineDisposition',
  creditNoteReasons: 'CreditNoteReason', tenders: 'Tender', frequencies: 'RecurringInvoiceFrequency', endModes: 'RecurringInvoiceEndMode',
} as const;

@Injectable()
export class PrismaReceivablesStore extends ReceivablesStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesStore,
  ) {
    super();
  }

  // ---------------------------------------------------------------- reference data
  private customers(db: Db, tenantId: string, customerIds: (string | null)[]) {
    return db.customers.findMany({ where: { tenantId, id: { in: ids(customerIds) } }, select: { id: true, code: true, name: true, city: true } });
  }
  private branches(db: Db, tenantId: string) {
    return db.branches.findMany({ where: { tenantId }, select: { id: true, code: true, name: true } });
  }
  private warehouses(db: Db, tenantId: string) {
    return db.warehouses.findMany({ where: { tenantId }, select: { id: true, code: true, name: true } });
  }
  private products(db: Db, tenantId: string, itemIds: (string | null)[]) {
    return db.products.findMany({ where: { tenantId, id: { in: ids(itemIds) } }, select: { id: true, sku: true, name: true } });
  }
  private docNos<T extends { id: string; docNo: string }>(rows: T[]) {
    return (id: string | null | undefined) => {
      const r = find(rows, id);
      return r ? { id: r.id, docNo: r.docNo } : null;
    };
  }

  /** Phase 23's sales options (customers, products, warehouses, branches, tax codes, terms) plus cash / bank accounts and lookups. */
  async options(tenantId: string): Promise<ReceivablesOptions> {
    const db = this.prisma.db();
    const [o, cash, banks, lookups] = await Promise.all([
      this.sales.options(tenantId),
      db.cashAccounts.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, branchId: true } }),
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { accountTitle: 'asc' }, select: { id: true, accountTitle: true, accountLast4: true } }),
      db.lookups.findMany({ where: { lookupType: { in: Object.values(LOOKUPS) }, tenantId: null, isActive: true }, orderBy: { sortOrder: 'asc' }, select: { lookupType: true, code: true, label: true } }),
    ]);
    return {
      customers: o.customers.map((c) => ({ id: c.id, code: c.code, name: c.name, city: c.city, paymentTerms: c.paymentTerms, branchId: c.branchId, priceListId: c.priceListId, status: c.status })),
      products: o.products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, ctn: p.ctn, unit: p.unit, price: p.price, avgCost: p.avgCost, taxCodeId: p.taxCodeId, gstRate: p.gstRate })),
      warehouses: o.warehouses, branches: o.branches, taxCodes: o.taxCodes,
      cashAccounts: cash, bankAccounts: banks.map((b) => ({ id: b.id, title: b.accountTitle, last4: b.accountLast4 })), paymentTerms: o.paymentTerms,
      lookups: Object.fromEntries(Object.entries(LOOKUPS).map(([k, t]) => [k, lookups.filter((l) => l.lookupType === t).map((l) => ({ code: l.code, label: l.label }))])) as ReceivablesOptions['lookups'],
    };
  }

  // ---------------------------------------------------------------- sales returns
  async listReturns(tenantId: string, q: ReceivablesQuery): Promise<SalesReturnList> {
    const db = this.prisma.db();
    const base: Prisma.SalesReturnsWhereInput = {
      tenantId, ...(q.customer && { customerId: q.customer }), ...(dateRange(q) && { docDate: dateRange(q) }),
      ...(q.search && { OR: [{ docNo: { contains: q.search, mode: 'insensitive' } }, { remarks: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, groups, mtd, drafts] = await Promise.all([
      db.salesReturns.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.salesReturns.count({ where }),
      db.salesReturns.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.salesReturns.aggregate({ where: { tenantId, status: 'POSTED', docDate: { gte: monthStart() } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      db.salesReturns.count({ where: { tenantId, status: 'DRAFT' } }),
    ]);
    const items = await this.returnHeaders(db, tenantId, rows);
    return { items, total, counts: count(groups), kpis: { returnedMtd: num(mtd._sum.totalAmount), returnedMtdCount: mtd._count._all, draftCount: drafts } };
  }

  private async returnHeaders(db: Db, tenantId: string, rows: Prisma.SalesReturnsGetPayload<object>[]) {
    const [customers, branches, warehouses, invoices, cns, vouchers, users] = await Promise.all([
      this.customers(db, tenantId, rows.map((r) => r.customerId)), this.branches(db, tenantId), this.warehouses(db, tenantId),
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.invoiceId)) } }, select: { id: true, docNo: true } }),
      db.creditNotes.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.creditNoteId)) } }, select: { id: true, docNo: true, status: true, treatment: true } }),
      voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)), userRefs(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    const inv = this.docNos(invoices);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, returnType: r.returnType, customer: ref(customers, r.customerId), invoice: inv(r.invoiceId),
      branch: find(branches, r.branchId), warehouse: ref(warehouses, r.warehouseId), totalItems: r.totalItems, totalQty: num(r.totalQty),
      valueAmount: num(r.valueAmount), taxAmount: num(r.taxAmount), totalAmount: num(r.totalAmount), costAmount: num(r.costAmount), status: r.status,
      creditNote: (() => { const c = find(cns, r.creditNoteId); return c ? { id: c.id, docNo: c.docNo, status: c.status, treatment: c.treatment } : null; })(),
      journal: r.journalEntryId ? vouchers.get(r.journalEntryId) ?? null : null, postedAt: iso(r.postedAt), cancelledAt: iso(r.cancelledAt), remarks: r.remarks,
      createdBy: r.createdBy ? users.get(r.createdBy) ?? null : null, createdAt: iso(r.createdAt)!, rowVersion: r.rowVersion,
    }));
  }

  async getReturn(tenantId: string, id: string): Promise<SalesReturn | null> {
    const db = this.prisma.db();
    const r = await db.salesReturns.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [[h], lines] = await Promise.all([this.returnHeaders(db, tenantId, [r]), db.salesReturnLines.findMany({ where: { tenantId, salesReturnId: id }, orderBy: { lineNo: 'asc' } })]);
    const items = await this.products(db, tenantId, lines.map((l) => l.itemId));
    return {
      ...h!, lines: lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, invoiceLineId: l.invoiceLineId, item: find(items, l.itemId), batchId: l.batchId, soldQty: l.soldQty === null ? null : num(l.soldQty),
        qty: num(l.baseQty), rate: num(l.rate), discountPct: num(l.discountPct), valueAmount: num(l.valueAmount), taxRate: num(l.taxRate), taxAmount: num(l.taxAmount),
        totalAmount: num(l.totalAmount), reason: l.reason, disposition: l.disposition, costAmount: num(l.costAmount),
      })),
    };
  }

  async returnable(tenantId: string, invoiceId: string): Promise<ReturnableInvoice | null> {
    const db = this.prisma.db();
    const inv = await db.salesInvoices.findFirst({ where: { tenantId, id: invoiceId } });
    if (!inv) return null;
    const [lines, customers, branches, warehouses, returned] = await Promise.all([
      db.salesInvoiceLines.findMany({ where: { tenantId, invoiceId, itemId: { not: null } }, orderBy: { lineNo: 'asc' } }),
      this.customers(db, tenantId, [inv.customerId]), this.branches(db, tenantId), this.warehouses(db, tenantId),
      db.$queryRaw<{ id: string; q: string }[]>`
        select l."invoiceLineId"::text as id, sum(l."baseQty")::text as q from "Sales"."SalesReturnLines" l
          join "Sales"."SalesReturns" r on r."tenantId" = l."tenantId" and r.id = l."salesReturnId"
         where l."tenantId" = ${tenantId}::uuid and r."invoiceId" = ${invoiceId}::uuid and r.status = 'POSTED' group by l."invoiceLineId"`,
    ]);
    const items = await db.products.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.itemId)) } }, select: { id: true, sku: true, name: true } });
    const back = new Map(returned.map((r) => [r.id, Number(r.q)]));
    return {
      invoice: { id: inv.id, docNo: inv.docNo, docDate: day(inv.docDate)!, customer: ref(customers, inv.customerId), branch: ref(branches, inv.branchId), warehouse: find(warehouses, inv.warehouseId), status: inv.status, balanceAmount: num(inv.balanceAmount) },
      lines: lines.map((l) => {
        const sold = num(l.baseQty);
        const ret = back.get(l.id) ?? 0;
        return {
          invoiceLineId: l.id, item: find(items, l.itemId)!, batchId: l.batchId, rate: num(l.rate), discountPct: num(l.discountPct), taxCodeId: l.taxCodeId, taxRate: num(l.taxRate),
          soldQty: sold, returnedQty: ret, returnableQty: Math.max(0, sold - ret),
        };
      }),
    };
  }

  // ---------------------------------------------------------------- credit notes
  async listCreditNotes(tenantId: string, q: ReceivablesQuery): Promise<CreditNoteList> {
    const db = this.prisma.db();
    const base: Prisma.CreditNotesWhereInput = {
      tenantId, ...(q.customer && { customerId: q.customer }), ...(dateRange(q) && { docDate: dateRange(q) }),
      ...(q.search && { OR: [{ docNo: { contains: q.search, mode: 'insensitive' } }, { reasonNote: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, groups, mtd, open] = await Promise.all([
      db.creditNotes.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.creditNotes.count({ where }),
      db.creditNotes.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.creditNotes.aggregate({ where: { tenantId, status: { in: ['OPEN', 'APPLIED'] }, docDate: { gte: monthStart() } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      db.creditNotes.aggregate({ where: { tenantId, status: 'OPEN', treatment: 'KEEP_AS_CREDIT' }, _sum: { balanceAmount: true } }),
    ]);
    return { items: await this.cnHeaders(db, tenantId, rows), total, counts: count(groups), kpis: { issuedMtd: num(mtd._sum.totalAmount), issuedMtdCount: mtd._count._all, openCredit: num(open._sum.balanceAmount) } };
  }

  private async cnHeaders(db: Db, tenantId: string, rows: Prisma.CreditNotesGetPayload<object>[]) {
    const [customers, branches, warehouses, invoices, returns, vouchers, users] = await Promise.all([
      this.customers(db, tenantId, rows.map((r) => r.customerId)), this.branches(db, tenantId), this.warehouses(db, tenantId),
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.invoiceId)) } }, select: { id: true, docNo: true } }),
      db.salesReturns.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.salesReturnId)) } }, select: { id: true, docNo: true } }),
      voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)), userRefs(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    const inv = this.docNos(invoices);
    const sr = this.docNos(returns);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, customer: ref(customers, r.customerId), invoice: inv(r.invoiceId), branch: find(branches, r.branchId),
      reason: r.reason, reasonNote: r.reasonNote, treatment: r.treatment, returnWarehouse: find(warehouses, r.returnWarehouseId), valueAmount: num(r.valueAmount),
      taxAmount: num(r.taxAmount), totalAmount: num(r.totalAmount), appliedAmount: num(r.appliedAmount), balanceAmount: num(r.balanceAmount), status: r.status,
      salesReturn: sr(r.salesReturnId), journal: r.journalEntryId ? vouchers.get(r.journalEntryId) ?? null : null, postedAt: iso(r.postedAt), cancelledAt: iso(r.cancelledAt),
      cancelReason: r.cancelReason, narration: r.narration, createdBy: r.createdBy ? users.get(r.createdBy) ?? null : null, createdAt: iso(r.createdAt)!, rowVersion: r.rowVersion,
    }));
  }

  async getCreditNote(tenantId: string, id: string): Promise<CreditNote | null> {
    const db = this.prisma.db();
    const r = await db.creditNotes.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [[h], lines] = await Promise.all([this.cnHeaders(db, tenantId, [r]), db.creditNoteLines.findMany({ where: { tenantId, creditNoteId: id }, orderBy: { lineNo: 'asc' } })]);
    const items = await this.products(db, tenantId, lines.map((l) => l.itemId));
    return {
      ...h!, lines: lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, invoiceLineId: l.invoiceLineId, item: find(items, l.itemId), description: l.description, qty: num(l.baseQty), rate: num(l.rate),
        valueAmount: num(l.valueAmount), taxRate: num(l.taxRate), taxAmount: num(l.taxAmount), totalAmount: num(l.totalAmount), restock: l.restock,
      })),
    };
  }

  // ---------------------------------------------------------------- customer receipts
  async listReceipts(tenantId: string, q: ReceivablesQuery): Promise<CustomerReceiptList> {
    const db = this.prisma.db();
    const base: Prisma.CustomerReceiptsWhereInput = {
      tenantId, ...(q.customer && { customerId: q.customer }), ...(q.method && { method: q.method }), ...(dateRange(q) && { docDate: dateRange(q) }),
      ...(q.search && { OR: [{ docNo: { contains: q.search, mode: 'insensitive' } }, { reference: { contains: q.search, mode: 'insensitive' } }, { memo: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const live = { notIn: ['VOID', 'BOUNCED'] };
    const [rows, total, groups, mtd, unalloc, chq] = await Promise.all([
      db.customerReceipts.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.customerReceipts.count({ where }),
      db.customerReceipts.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.customerReceipts.aggregate({ where: { tenantId, status: live, docDate: { gte: monthStart() } }, _sum: { amountReceived: true }, _count: { _all: true } }),
      db.customerReceipts.aggregate({ where: { tenantId, status: live }, _sum: { unallocatedAmount: true } }),
      db.cheques.aggregate({ where: { tenantId, direction: 'RECEIVED', status: { in: ['IN_HAND', 'DEPOSITED'] } }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return {
      items: await this.receiptHeaders(db, tenantId, rows), total, counts: count(groups),
      kpis: { receivedMtd: num(mtd._sum.amountReceived), receivedMtdCount: mtd._count._all, unallocated: num(unalloc._sum.unallocatedAmount), chequesInHand: num(chq._sum.amount), chequesInHandCount: chq._count._all },
    };
  }

  private async receiptHeaders(db: Db, tenantId: string, rows: Prisma.CustomerReceiptsGetPayload<object>[]) {
    const [customers, branches, cash, banks, cheques, vouchers, users] = await Promise.all([
      this.customers(db, tenantId, rows.map((r) => r.customerId)), this.branches(db, tenantId),
      db.cashAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.cashAccountId)) } }, select: { id: true, code: true, name: true } }),
      db.bankAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.bankAccountId)) } }, select: { id: true, accountTitle: true } }),
      db.cheques.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.chequeId)) } }, select: { id: true, docNo: true, status: true } }),
      voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)), userRefs(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, customer: ref(customers, r.customerId), branch: find(branches, r.branchId), method: r.method,
      bankAccount: (() => { const b = find(banks, r.bankAccountId); return b ? { id: b.id, title: b.accountTitle } : null; })(), cashAccount: find(cash, r.cashAccountId),
      reference: r.reference, amountReceived: num(r.amountReceived), whtAmount: num(r.whtAmount), whtSection: r.whtSection, bankCharges: num(r.bankCharges),
      settledAmount: num(r.settledAmount), allocatedAmount: num(r.allocatedAmount), unallocatedAmount: num(r.unallocatedAmount), status: r.status,
      cheque: find(cheques, r.chequeId), journal: r.journalEntryId ? vouchers.get(r.journalEntryId) ?? null : null, posShiftId: r.posShiftId, memo: r.memo,
      bouncedAt: iso(r.bouncedAt), bounceReason: r.bounceReason, voidedAt: iso(r.voidedAt), voidReason: r.voidReason,
      createdBy: r.createdBy ? users.get(r.createdBy) ?? null : null, createdAt: iso(r.createdAt)!, rowVersion: r.rowVersion,
    }));
  }

  async getReceipt(tenantId: string, id: string): Promise<CustomerReceipt | null> {
    const db = this.prisma.db();
    const r = await db.customerReceipts.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [[h], allocs] = await Promise.all([this.receiptHeaders(db, tenantId, [r]), db.customerReceiptAllocations.findMany({ where: { tenantId, receiptId: id }, orderBy: { createdAt: 'asc' } })]);
    const [invoices, cns] = await Promise.all([
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(allocs.map((a) => a.invoiceId)) } }, select: { id: true, docNo: true } }),
      db.creditNotes.findMany({ where: { tenantId, id: { in: ids(allocs.map((a) => a.creditNoteId)) } }, select: { id: true, docNo: true } }),
    ]);
    const inv = this.docNos(invoices);
    const cn = this.docNos(cns);
    return { ...h!, allocations: allocs.map((a) => ({ id: a.id, invoice: inv(a.invoiceId), creditNote: cn(a.creditNoteId), amount: num(a.allocatedAmount), date: day(a.allocationDate)!, isAutoFifo: a.isAutoFifo })) };
  }

  async openItems(tenantId: string, customerId: string): Promise<CustomerOpenItems | null> {
    const db = this.prisma.db();
    const c = await db.customers.findFirst({ where: { tenantId, id: customerId }, select: { id: true, code: true, name: true } });
    if (!c) return null;
    const [invoices, credits, unalloc] = await Promise.all([
      db.salesInvoices.findMany({ where: { tenantId, customerId, status: { in: ['POSTED', 'PARTIALLY_PAID'] }, balanceAmount: { gt: 0 } }, orderBy: [{ dueDate: 'asc' }, { docDate: 'asc' }, { docNo: 'asc' }], select: { id: true, docNo: true, docDate: true, dueDate: true, netAmount: true, balanceAmount: true } }),
      db.creditNotes.findMany({ where: { tenantId, customerId, status: 'OPEN', treatment: 'KEEP_AS_CREDIT' }, orderBy: { docDate: 'asc' }, select: { id: true, docNo: true, balanceAmount: true } }),
      db.customerReceipts.aggregate({ where: { tenantId, customerId, status: { notIn: ['VOID', 'BOUNCED'] } }, _sum: { unallocatedAmount: true } }),
    ]);
    const t = today();
    const inv = invoices.map((i) => ({ id: i.id, docNo: i.docNo, docDate: day(i.docDate)!, dueDate: day(i.dueDate)!, netAmount: num(i.netAmount), balanceAmount: num(i.balanceAmount), daysOverdue: Math.max(0, daysBetween(day(i.dueDate)!, t)) }));
    const cr = credits.map((x) => ({ id: x.id, docNo: x.docNo, balanceAmount: num(x.balanceAmount) }));
    const un = num(unalloc._sum.unallocatedAmount);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return { customer: c, invoices: inv, credits: cr, unallocatedReceipts: un, balance: r2(inv.reduce((s, i) => s + i.balanceAmount, 0) - cr.reduce((s, x) => s + x.balanceAmount, 0) - un) };
  }

  async setAllocations(tenantId: string, receiptId: string, customerId: string, rows: { invoiceId: string; amount: number; isAutoFifo: boolean }[]) {
    const db = this.prisma.db();
    await db.customerReceiptAllocations.deleteMany({ where: { tenantId, receiptId, targetType: 'INVOICE' } });
    for (const r of rows) {
      await db.customerReceiptAllocations.create({ data: { tenantId, receiptId, customerId, targetType: 'INVOICE', invoiceId: r.invoiceId, allocatedAmount: r.amount, isAutoFifo: r.isAutoFifo } });
    }
    const rc = await db.customerReceipts.findFirst({ where: { tenantId, id: receiptId }, select: { chequeId: true } });
    if (rc?.chequeId) {
      await db.chequeAllocations.deleteMany({ where: { tenantId, chequeId: rc.chequeId } });
      if (rows.length) await db.chequeAllocations.createMany({ data: rows.map((r) => ({ tenantId, chequeId: rc.chequeId!, invoiceId: r.invoiceId, amount: r.amount })) });
    }
  }

  // ---------------------------------------------------------------- recurring invoices
  async listRecurring(tenantId: string, q: ReceivablesQuery): Promise<RecurringInvoiceList> {
    const db = this.prisma.db();
    const base: Prisma.RecurringInvoicesWhereInput = {
      tenantId, ...(q.customer && { customerId: q.customer }),
      ...(q.search && { OR: [{ docNo: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, groups, active] = await Promise.all([
      db.recurringInvoices.findMany({ where, orderBy: [{ status: 'asc' }, { nextRunDate: 'asc' }], ...page(q) }),
      db.recurringInvoices.count({ where }),
      db.recurringInvoices.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.recurringInvoices.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { frequency: true, everyDays: true, amount: true, nextRunDate: true } }),
    ]);
    const perMonth = (f: string, every: number | null) => (f === 'WEEKLY' ? 52 / 12 : f === 'QUARTERLY' ? 1 / 3 : f === 'CUSTOM' ? 30 / (every || 30) : 1);
    const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    return {
      items: await this.recurringHeaders(db, tenantId, rows), total, counts: count(groups),
      kpis: {
        monthlyValue: Math.round(active.reduce((s, r) => s + num(r.amount) * perMonth(r.frequency, r.everyDays), 0) * 100) / 100,
        dueThisWeek: active.filter((r) => r.nextRunDate && day(r.nextRunDate)! <= week).length,
      },
    };
  }

  private async recurringHeaders(db: Db, tenantId: string, rows: Prisma.RecurringInvoicesGetPayload<object>[]) {
    const [customers, branches, warehouses, invoices, users] = await Promise.all([
      this.customers(db, tenantId, rows.map((r) => r.customerId)), this.branches(db, tenantId), this.warehouses(db, tenantId),
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.lastInvoiceId)) } }, select: { id: true, docNo: true } }),
      userRefs(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    const inv = this.docNos(invoices);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, name: r.name, customer: ref(customers, r.customerId), branch: find(branches, r.branchId), warehouse: find(warehouses, r.warehouseId),
      paymentTerms: r.paymentTerms, frequency: r.frequency, everyDays: r.everyDays, startDate: day(r.startDate)!, nextRunDate: day(r.nextRunDate), endMode: r.endMode,
      endDate: day(r.endDate), maxRuns: r.maxRuns, runsCount: r.runsCount, amount: num(r.amount), saveAsDraft: r.saveAsDraft, status: r.status, lastRunAt: iso(r.lastRunAt),
      lastInvoice: inv(r.lastInvoiceId), createdBy: r.createdBy ? users.get(r.createdBy) ?? null : null, createdAt: iso(r.createdAt)!, rowVersion: r.rowVersion,
    }));
  }

  async getRecurring(tenantId: string, id: string): Promise<RecurringInvoice | null> {
    const db = this.prisma.db();
    const r = await db.recurringInvoices.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [[h], lines, invoices] = await Promise.all([
      this.recurringHeaders(db, tenantId, [r]),
      db.recurringInvoiceLines.findMany({ where: { tenantId, recurringProfileId: id }, orderBy: { lineNo: 'asc' } }),
      db.salesInvoices.findMany({ where: { tenantId, recurringProfileId: id }, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], take: 50, select: { id: true, docNo: true, docDate: true, netAmount: true, status: true } }),
    ]);
    const items = await this.products(db, tenantId, lines.map((l) => l.itemId));
    return {
      ...h!,
      lines: lines.map((l) => ({ id: l.id, lineNo: l.lineNo, item: find(items, l.itemId), description: l.description, qty: num(l.baseQty), rate: num(l.rate), useCurrentPrice: l.useCurrentPrice, taxRate: num(l.taxRate), taxAmount: num(l.taxAmount), totalAmount: num(l.totalAmount) })),
      invoices: invoices.map((i) => ({ id: i.id, docNo: i.docNo, docDate: day(i.docDate)!, netAmount: num(i.netAmount), status: i.status })),
    };
  }

  async tenants() {
    const rows = await this.prisma.db().tenants.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async dueRecurring(tenantId: string, on: string): Promise<DueRecurring[]> {
    const rows = await this.prisma.db().recurringInvoices.findMany({ where: { tenantId, status: 'ACTIVE', nextRunDate: { lte: new Date(`${on}T00:00:00Z`) } }, select: { id: true, tenantId: true, nextRunDate: true }, orderBy: { nextRunDate: 'asc' } });
    return rows.map((r) => ({ id: r.id, tenantId: r.tenantId, nextRunDate: day(r.nextRunDate)! }));
  }

  // ---------------------------------------------------------------- POS
  private async shifts(db: Db, tenantId: string, rows: Prisma.PosShiftsGetPayload<object>[], withDenoms: boolean): Promise<PosShift[]> {
    const [branches, warehouses, cash, users, vouchers, denoms] = await Promise.all([
      this.branches(db, tenantId), this.warehouses(db, tenantId),
      db.cashAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.cashAccountId)) } }, select: { id: true, code: true, name: true } }),
      userRefs(db, tenantId, rows.map((r) => r.cashierUserId)), voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)),
      withDenoms ? db.posShiftDenominations.findMany({ where: { tenantId, posShiftId: { in: rows.map((r) => r.id) } }, orderBy: { denomination: 'desc' } }) : Promise.resolve([]),
    ]);
    return rows.map((r) => ({
      id: r.id, zReportNo: r.zReportNo, branch: ref(branches, r.branchId), warehouse: ref(warehouses, r.warehouseId), counterName: r.counterName,
      cashier: users.get(r.cashierUserId) ?? null, cashAccount: find(cash, r.cashAccountId), openedAt: iso(r.openedAt)!, closedAt: iso(r.closedAt),
      openingFloat: num(r.openingFloat), cashSales: num(r.cashSales), cardSales: num(r.cardSales), walletSales: num(r.walletSales), creditSales: num(r.creditSales),
      billsCount: r.billsCount, expectedCash: num(r.expectedCash), countedCash: r.countedCash === null ? null : num(r.countedCash), overShort: r.overShort === null ? null : num(r.overShort),
      status: r.status, journal: r.journalEntryId ? vouchers.get(r.journalEntryId) ?? null : null, remarks: r.remarks, rowVersion: r.rowVersion,
      denominations: denoms.filter((d) => d.posShiftId === r.id).map((d) => ({ denomination: num(d.denomination), noteCount: d.noteCount, amount: num(d.amount) })),
    }));
  }

  async openShift(tenantId: string, userId: string) {
    const db = this.prisma.db();
    const r = await db.posShifts.findFirst({ where: { tenantId, cashierUserId: userId, status: 'OPEN' } });
    return r ? (await this.shifts(db, tenantId, [r], true))[0]! : null;
  }

  async getShift(tenantId: string, id: string) {
    const db = this.prisma.db();
    const r = await db.posShifts.findFirst({ where: { tenantId, id } });
    return r ? (await this.shifts(db, tenantId, [r], true))[0]! : null;
  }

  async shiftReport(tenantId: string, id: string): Promise<PosShiftReport | null> {
    const db = this.prisma.db();
    const s = await this.getShift(tenantId, id);
    if (!s) return null;
    const [pays, bills] = await Promise.all([
      db.posPayments.groupBy({ by: ['tender'], where: { tenantId, posShiftId: id }, _sum: { amount: true }, _count: { _all: true } }),
      db.salesInvoices.findMany({ where: { tenantId, posShiftId: id, status: { not: 'DRAFT' } }, orderBy: { docNo: 'asc' }, select: { id: true, docNo: true, customerId: true, netAmount: true, status: true, postedAt: true } }),
    ]);
    const customers = await this.customers(db, tenantId, bills.map((b) => b.customerId));
    return {
      ...s, byTender: pays.map((p) => ({ tender: p.tender, count: p._count._all, amount: num(p._sum.amount) })),
      bills: bills.map((b) => ({ id: b.id, docNo: b.docNo, customer: ref(customers, b.customerId).name, netAmount: num(b.netAmount), status: b.status, postedAt: iso(b.postedAt) })),
    };
  }

  async listShifts(tenantId: string, q: ReceivablesQuery): Promise<PosShiftList> {
    const db = this.prisma.db();
    const where: Prisma.PosShiftsWhereInput = { tenantId, ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([db.posShifts.findMany({ where, orderBy: { openedAt: 'desc' }, ...page(q) }), db.posShifts.count({ where })]);
    return { items: (await this.shifts(db, tenantId, rows, false)).map(({ denominations, ...x }) => { void denominations; return x; }), total };
  }

  async heldSales(tenantId: string, shiftId: string): Promise<PosHeldSale[]> {
    const db = this.prisma.db();
    const rows = await db.salesInvoices.findMany({ where: { tenantId, posShiftId: shiftId, status: 'DRAFT' }, orderBy: { createdAt: 'asc' }, select: { id: true, docNo: true, customerId: true, netAmount: true, createdAt: true } });
    const [customers, lines] = await Promise.all([
      this.customers(db, tenantId, rows.map((r) => r.customerId)),
      db.salesInvoiceLines.findMany({ where: { tenantId, invoiceId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' }, select: { invoiceId: true, itemId: true, baseQty: true, rate: true, discountPct: true } }),
    ]);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, customer: ref(customers, r.customerId), netAmount: num(r.netAmount), createdAt: iso(r.createdAt)!,
      lines: lines.filter((l) => l.invoiceId === r.id && l.itemId).map((l) => ({ itemId: l.itemId!, qty: num(l.baseQty), rate: num(l.rate), discountPct: num(l.discountPct) })),
    }));
  }

  async counterTaken(tenantId: string, branchId: string, counterName: string, userId: string) {
    const n = await this.prisma.db().posShifts.count({ where: { tenantId, status: 'OPEN', OR: [{ cashierUserId: userId }, { branchId, counterName: { equals: counterName, mode: 'insensitive' } }] } });
    return n > 0;
  }

  async addPosPayment(tenantId: string, row: { posShiftId: string; invoiceId: string; tender: string; amount: number; tenderedAmount: number | null; changeAmount: number; reference: string | null; receiptId: string | null }) {
    await this.prisma.db().posPayments.create({ data: { tenantId, ...row } });
  }

  // ---------------------------------------------------------------- reports
  async ageing(tenantId: string, asOf: string, basis: 'DUE' | 'DOC'): Promise<ArAgeing> {
    const db = this.prisma.db();
    const rows = await db.$queryRaw<{ customerId: string; customerCode: string; customerName: string; branchId: string | null; branchCode: string | null; branchName: string | null; paymentTerms: string; c: string; b1: string; b2: string; b3: string; b4: string; total: string; open: number; maxDays: number | null }[]>`
      select "customerId"::text as "customerId", "customerCode", "customerName", "branchId"::text as "branchId", "branchCode", "branchName", "paymentTerms",
             "bucketCurrent"::text as c, bucket130::text as b1, bucket3160::text as b2, bucket6190::text as b3, "bucket90Plus"::text as b4, total::text as total,
             "openInvoices"::int as open, (case when ${basis} = 'DOC' then "daysByDoc" else "daysByDue" end)::int as "maxDays"
        from "Sales"."getReceivablesAgeingAsOf"(${asOf}::date, ${basis})
       where "tenantId" = ${tenantId}::uuid and total <> 0
       order by total desc`;
    const out: ArAgeingRow[] = rows.map((r) => ({
      customer: { id: r.customerId, code: r.customerCode, name: r.customerName }, branch: r.branchId ? { id: r.branchId, code: r.branchCode ?? '', name: r.branchName ?? '' } : null,
      paymentTerms: r.paymentTerms, current: Number(r.c), d1to30: Number(r.b1), d31to60: Number(r.b2), d61to90: Number(r.b3), d90plus: Number(r.b4), total: Number(r.total), openInvoices: r.open, maxDaysOverdue: r.maxDays,
    }));
    const sum = (k: 'current' | 'd1to30' | 'd31to60' | 'd61to90' | 'd90plus' | 'total' | 'openInvoices') => Math.round(out.reduce((s, r) => s + r[k], 0) * 100) / 100;
    return { asOf, basis, rows: out, totals: { current: sum('current'), d1to30: sum('d1to30'), d31to60: sum('d31to60'), d61to90: sum('d61to90'), d90plus: sum('d90plus'), total: sum('total'), openInvoices: sum('openInvoices') } };
  }

  async statement(tenantId: string, customerId: string, from: string, to: string): Promise<CustomerStatement | null> {
    const db = this.prisma.db();
    const c = await db.customers.findFirst({ where: { tenantId, id: customerId }, select: { id: true, code: true, name: true, city: true, paymentTerms: true, openingBalance: true } });
    if (!c) return null;
    const upto = new Date(`${to}T00:00:00Z`);
    const [inv, rc, cn] = await Promise.all([
      db.salesInvoices.findMany({ where: { tenantId, customerId, status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] }, docDate: { lte: upto } }, select: { id: true, docNo: true, docDate: true, netAmount: true, channel: true } }),
      db.customerReceipts.findMany({ where: { tenantId, customerId, status: { notIn: ['VOID', 'BOUNCED'] }, docDate: { lte: upto } }, select: { id: true, docNo: true, docDate: true, settledAmount: true, method: true, reference: true } }),
      db.creditNotes.findMany({ where: { tenantId, customerId, status: { in: ['OPEN', 'APPLIED'] }, docDate: { lte: upto } }, select: { id: true, docNo: true, docDate: true, totalAmount: true, reason: true } }),
    ]);
    type L = CustomerStatement['lines'][number];
    const all: Omit<L, 'balance'>[] = [
      ...inv.map((i) => ({ date: day(i.docDate)!, docType: 'Invoice', docNo: i.docNo, description: i.channel === 'POS' ? 'POS sale' : 'Sales invoice', debit: num(i.netAmount), credit: 0, link: `/sales/invoices/${i.id}` })),
      ...rc.map((r) => ({ date: day(r.docDate)!, docType: 'Receipt', docNo: r.docNo, description: `Payment · ${r.method}${r.reference ? ` ${r.reference}` : ''}`, debit: 0, credit: num(r.settledAmount), link: `/receivables/receipts?id=${r.id}` })),
      ...cn.map((x) => ({ date: day(x.docDate)!, docType: 'Credit note', docNo: x.docNo, description: `Credit note · ${x.reason}`, debit: 0, credit: num(x.totalAmount), link: `/sales/credit-notes?id=${x.id}` })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.docNo.localeCompare(b.docNo));
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let bal = num(c.openingBalance);
    const lines: L[] = [];
    for (const l of all) {
      bal = r2(bal + l.debit - l.credit);
      if (l.date >= from) lines.push({ ...l, balance: bal });
    }
    const opening = r2(lines.length ? lines[0]!.balance - lines[0]!.debit + lines[0]!.credit : bal);
    return { customer: { id: c.id, code: c.code, name: c.name, city: c.city, paymentTerms: c.paymentTerms }, from, to, opening, closing: bal, lines };
  }

  // ---------------------------------------------------------------- writes
  async nextNo(docType: string, date: string, branchId: string | null) {
    const r = await this.prisma.db().$queryRaw<{ n: string }[]>`select "Company"."getNextDocNo"(${docType}, ${date}::date, ${branchId}::uuid) as n`;
    return r[0]!.n;
  }

  save(fn: ReceivablesSave, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async set(doc: ReceivablesDoc, tenantId: string, id: string, data: Record<string, unknown>) {
    const db = this.prisma.db();
    const where = { tenantId, id };
    if (doc === 'return') await db.salesReturns.updateMany({ where, data });
    else if (doc === 'creditNote') await db.creditNotes.updateMany({ where, data });
    else if (doc === 'receipt') await db.customerReceipts.updateMany({ where, data });
    else if (doc === 'recurring') await db.recurringInvoices.updateMany({ where, data });
    else await db.posShifts.updateMany({ where, data });
  }

  async run(fn: ReceivablesLifecycle, id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (fn === 'salesReturnCancel' || fn === 'creditNoteCancel' || fn === 'customerReceiptVoid') await db.$queryRawUnsafe(`select "Sales"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "Sales"."${fn}"($1::uuid)::text`, id);
  }

  async deleteDraft(doc: 'return' | 'creditNote' | 'recurring', tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (doc === 'return') {
      if (!(await db.salesReturns.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.salesReturnLines.deleteMany({ where: { tenantId, salesReturnId: id } });
      await db.salesReturns.deleteMany({ where: { tenantId, id } });
    } else if (doc === 'creditNote') {
      if (!(await db.creditNotes.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.creditNoteLines.deleteMany({ where: { tenantId, creditNoteId: id } });
      await db.creditNotes.deleteMany({ where: { tenantId, id } });
    } else {
      if (!(await db.recurringInvoices.count({ where: { tenantId, id, rowVersion, runsCount: 0 } }))) return false;
      await db.recurringInvoiceLines.deleteMany({ where: { tenantId, recurringProfileId: id } });
      await db.recurringInvoices.deleteMany({ where: { tenantId, id } });
    }
    return true;
  }
}
