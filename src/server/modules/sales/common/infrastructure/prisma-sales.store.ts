import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import {
  quotationShownStatus, type CustomerCredit, type DeliverableOrder, type DeliveryChallan, type DeliveryChallanList, type PriceMap, type Quotation, type QuotationList,
  type SalesDocOptions, type SalesInvoiceList, type SalesLine, type SalesOrderList, type SalesQuery,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { SalesStore, type Doc, type InvoiceBase, type Lifecycle, type OrderBase, type SaveFunction } from '../application/sales-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };
const LIFECYCLE_TEXT: Lifecycle[] = ['quotationReject', 'quotationCancel', 'salesOrderClose', 'salesOrderCancel', 'deliveryChallanCancel', 'salesInvoiceVoid'];
const OPEN_ORDER = ['CONFIRMED', 'PARTIALLY_DELIVERED', 'TO_INVOICE', 'ON_HOLD'];
const OPEN_INVOICE = ['POSTED', 'PARTIALLY_PAID'];
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000);
const monthStart = () => new Date(`${today().slice(0, 7)}-01`);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);
const page = (q: SalesQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

type LineRow = {
  id: string; lineNo: number; itemId: string | null; description: string | null; qtyCtn: Prisma.Decimal; qtyLoose: Prisma.Decimal; baseQty: Prisma.Decimal; rate: Prisma.Decimal;
  discountPct: Prisma.Decimal; grossAmount: Prisma.Decimal; discountAmount: Prisma.Decimal; taxableAmount: Prisma.Decimal; taxCodeId: string | null; taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal; bonusQty?: Prisma.Decimal; deliveredQty?: Prisma.Decimal; invoicedQty?: Prisma.Decimal;
  salesOrderLineId?: string | null; deliveryChallanLineId?: string | null; batchId?: string | null; hsCode?: string | null;
};

async function refs(db: Db, tenantId: string, k: { customers?: (string | null)[]; branches?: (string | null)[]; warehouses?: (string | null)[]; priceLists?: (string | null)[]; taxCodes?: (string | null)[]; products?: (string | null)[] }) {
  const q = <T,>(xs: (string | null)[] | undefined, f: (i: string[]) => Promise<T[]>) => (xs && ids(xs).length ? f(ids(xs)) : Promise.resolve([] as T[]));
  const [customers, branches, warehouses, priceLists, taxCodes, products] = await Promise.all([
    q(k.customers, (i) => db.customers.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true, city: true, billingAddress: true, phone: true, mobile: true } })),
    q(k.branches, (i) => db.branches.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.warehouses, (i) => db.warehouses.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.priceLists, (i) => db.priceLists.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.taxCodes, (i) => db.taxCodes.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, description: true } })),
    q(k.products, (i) => db.products.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, sku: true, name: true, ctn: true, trackExpiry: true } })),
  ]);
  return {
    customers: customers.map((c) => ({ id: c.id, code: c.code, name: c.name, city: c.city, address: c.billingAddress, phone: c.mobile ?? c.phone })),
    branches: branches as Ref[], warehouses: warehouses as Ref[], priceLists: priceLists as Ref[],
    taxCodes: taxCodes.map((t) => ({ id: t.id, code: t.code, name: t.description })),
    products,
  };
}
type Refs = Awaited<ReturnType<typeof refs>>;

function line(l: LineRow, r: Refs): SalesLine {
  const p = find(r.products, l.itemId);
  return {
    id: l.id, lineNo: l.lineNo, item: p && { id: p.id, sku: p.sku, name: p.name, ctn: p.ctn }, description: l.description,
    qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose), baseQty: num(l.baseQty), bonusQty: num(l.bonusQty), rate: num(l.rate), discountPct: num(l.discountPct),
    grossAmount: num(l.grossAmount), discountAmount: num(l.discountAmount), taxableAmount: num(l.taxableAmount), taxCode: find(r.taxCodes, l.taxCodeId), taxRate: num(l.taxRate),
    taxAmount: num(l.taxAmount), totalAmount: num(l.totalAmount),
    ...(l.deliveredQty !== undefined && { deliveredQty: num(l.deliveredQty), invoicedQty: num(l.invoicedQty) }),
    ...(l.salesOrderLineId !== undefined && { salesOrderLineId: l.salesOrderLineId }),
    ...(l.deliveryChallanLineId !== undefined && { deliveryChallanLineId: l.deliveryChallanLineId, batchId: l.batchId ?? null, hsCode: l.hsCode ?? null }),
  };
}

@Injectable()
export class PrismaSalesStore extends SalesStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ---------------------------------------------------------------- options
  async options(tenantId: string): Promise<SalesDocOptions> {
    const db = this.prisma.db();
    const [customers, products, uoms, warehouses, taxCodes, rates, branches, priceLists, users, vans, lookups, fbr] = await Promise.all([
      db.customers.findMany({ where: { tenantId, deletedAt: null, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }),
      db.products.findMany({ where: { tenantId, deletedAt: null, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }),
      db.unitsOfMeasure.findMany({ where: { tenantId }, select: { id: true, code: true } }),
      db.warehouses.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, branchId: true }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }),
      db.taxCodes.findMany({ where: { tenantId, deletedAt: null, isActive: true, appliesTo: { in: ['SALES', 'SALES_AND_PURCHASES'] }, taxType: { notIn: ['WHT', 'COLLECTION'] } }, orderBy: { code: 'asc' } }),
      db.taxCodeRates.findMany({ where: { tenantId, effectiveFrom: { lte: new Date(today()) } }, orderBy: { effectiveFrom: 'desc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.priceLists.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, code: true, name: true, isDefault: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      db.users.findMany({ where: { tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
      db.vans.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, regNo: true, model: true }, orderBy: { regNo: 'asc' } }),
      db.lookups.findMany({ where: { lookupType: { in: ['CustomerPaymentTerms', 'DeliverySlot', 'SaleType'] }, isActive: true, OR: [{ tenantId: null }, { tenantId }] }, orderBy: { sortOrder: 'asc' } }),
      db.fbrSettings.findFirst({ where: { tenantId, isActive: true, reportOnPosting: true }, orderBy: { createdAt: 'asc' }, select: { authority: true } }),
    ]);
    const rateOf = (taxCodeId: string) => rates.find((r) => r.taxCodeId === taxCodeId && (!r.effectiveTo || day(r.effectiveTo)! >= today()));
    const lk = (t: string) => lookups.filter((l) => l.lookupType === t).map((l) => ({ code: l.code, label: l.label }));
    return {
      customers: customers.map((c) => ({
        id: c.id, code: c.code, name: c.name, city: c.city, address: c.billingAddress, ntn: c.ntn, strn: c.strn, cnic: c.cnic, phone: c.mobile ?? c.phone, email: c.email,
        paymentTerms: c.paymentTerms, creditDays: c.creditDays, creditLimit: num(c.creditLimit), priceListId: c.priceListId, status: c.status, salesRepUserId: c.salesRepUserId,
        branchId: c.branchId, isGstExempt: c.isGstExempt,
      })),
      products: products.map((p) => ({
        id: p.id, sku: p.sku, name: p.name, ctn: p.ctn, unit: uoms.find((u) => u.id === p.uomId)?.code ?? null, trackExpiry: p.trackExpiry,
        price: num(p.price), avgCost: num(p.avgCost), taxCodeId: p.taxCodeId, gstRate: num(p.gstRate), hsCode: p.hsCode,
      })),
      warehouses,
      branches,
      taxCodes: taxCodes.map((t) => ({ id: t.id, code: t.code, name: t.description, rate: rateOf(t.id)?.rate ? num(rateOf(t.id)!.rate) : null })),
      priceLists,
      users: users.map((u) => ({ id: u.id, name: u.fullName })),
      vans,
      paymentTerms: lk('CustomerPaymentTerms'), deliverySlots: lk('DeliverySlot'), saleTypes: lk('SaleType'),
      fbr: { active: !!fbr, authority: fbr?.authority ?? null },
    };
  }

  async prices(tenantId: string, priceListId: string): Promise<PriceMap> {
    const rows = await this.prisma.db().priceListItems.findMany({ where: { tenantId, priceListId, effectiveFrom: { lte: new Date(today()) } }, orderBy: { effectiveFrom: 'asc' }, select: { itemId: true, price: true } });
    return Object.fromEntries(rows.map((r) => [r.itemId, num(r.price)]));
  }

  async credit(tenantId: string, customerId: string): Promise<CustomerCredit | null> {
    const rows = await this.prisma.db().$queryRaw<Record<string, unknown>[]>`
      select e.status, e."holdReason", e."creditLimit", e."effectiveLimit", e.balance, e."overdueAmount", e."openOrdersAmount", e.exposure, e."blockOverLimit"
        from "Sales"."getCustomerCreditExposure" e where e."tenantId" = ${tenantId}::uuid and e."customerId" = ${customerId}::uuid`;
    const e = rows[0];
    if (!e) return null;
    const n = (k: string) => Number(e[k] ?? 0);
    return {
      customerId, status: String(e.status), holdReason: (e.holdReason as string | null) ?? null, creditLimit: n('creditLimit'), effectiveLimit: n('effectiveLimit'),
      balance: n('balance'), overdueAmount: n('overdueAmount'), openOrdersAmount: n('openOrdersAmount'), exposure: n('exposure'),
      available: Math.max(0, n('effectiveLimit') - n('balance') - n('openOrdersAmount')), blockOverLimit: !!e.blockOverLimit,
    };
  }

  private async customerIds(tenantId: string, s: string) {
    return (await this.prisma.db().customers.findMany({ where: { tenantId, OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } }] }, select: { id: true }, take: 50 })).map((c) => c.id);
  }

  // ---------------------------------------------------------------- quotations
  async listQuotations(tenantId: string, q: SalesQuery): Promise<QuotationList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const t = new Date(today());
    const base: Prisma.QuotationsWhereInput = {
      tenantId, ...(q.customer && { customerId: q.customer }), ...(q.salesRep && { salesRepUserId: q.salesRep }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { subject: { contains: s, mode: 'insensitive' } }, { customerId: { in: await this.customerIds(tenantId, s) } }] }),
    };
    const status: Prisma.QuotationsWhereInput = !q.status ? {}
      : q.status === 'EXPIRED' ? { OR: [{ status: 'EXPIRED' }, { status: 'SENT', validTill: { lt: t } }] }
      : q.status === 'SENT' ? { status: 'SENT', validTill: { gte: t } }
      : q.status === 'ACCEPTED' ? { status: { in: ['ACCEPTED', 'CONVERTED'] } }
      : { status: q.status };
    const where = { ...base, ...status };
    const [rows, total, byStatus, expiredSent, open, closed, won, month, expiring] = await Promise.all([
      db.quotations.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.quotations.count({ where }),
      db.quotations.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.quotations.count({ where: { ...base, status: 'SENT', validTill: { lt: t } } }),
      db.quotations.aggregate({ where: { ...base, status: 'SENT', validTill: { gte: t } }, _sum: { netAmount: true }, _count: { _all: true } }),
      db.quotations.count({ where: { ...base, OR: [{ status: { in: ['ACCEPTED', 'CONVERTED', 'REJECTED', 'EXPIRED'] } }, { status: 'SENT', validTill: { lt: t } }] } }),
      db.quotations.count({ where: { ...base, status: { in: ['ACCEPTED', 'CONVERTED'] } } }),
      db.salesOrders.aggregate({ where: { tenantId, quotationId: { not: null }, status: { not: 'CANCELLED' }, docDate: { gte: monthStart() } }, _sum: { netAmount: true }, _count: { _all: true } }),
      db.quotations.aggregate({ where: { ...base, status: 'SENT', validTill: { gte: t, lte: addDays(today(), 7) } }, _sum: { netAmount: true }, _count: { _all: true } }),
    ]);
    const counts: Record<string, number> = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    counts.SENT = (counts.SENT ?? 0) - expiredSent;
    counts.EXPIRED = (counts.EXPIRED ?? 0) + expiredSent;
    counts.ACCEPTED = (counts.ACCEPTED ?? 0) + (counts.CONVERTED ?? 0);
    return {
      items: (await this.mapQuotations(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; }), total, counts,
      kpis: {
        open: open._count._all, openAmount: num(open._sum.netAmount), winRate: closed ? Math.round((won / closed) * 1000) / 10 : null,
        convertedMonth: month._count._all, convertedMonthAmount: num(month._sum.netAmount), expiringSoon: expiring._count._all, expiringAmount: num(expiring._sum.netAmount),
      },
    };
  }

  async getQuotation(tenantId: string, id: string) {
    const row = await this.prisma.db().quotations.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapQuotations(tenantId, [row], true))[0]! : null;
  }

  private async mapQuotations(tenantId: string, rows: Prisma.QuotationsGetPayload<object>[], full: boolean): Promise<Quotation[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.quotationLines.findMany({ where: { tenantId, quotationId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, orders, revisions] = await Promise.all([
      refs(db, tenantId, { customers: rows.map((x) => x.customerId), branches: rows.map((x) => x.branchId), priceLists: rows.map((x) => x.priceListId), taxCodes: lines.map((l) => l.taxCodeId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.salesRepUserId, x.createdBy])),
      db.salesOrders.findMany({ where: { tenantId, quotationId: { in: rows.map((x) => x.id) }, status: { not: 'CANCELLED' } }, select: { id: true, docNo: true, quotationId: true } }),
      db.quotations.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.revisionOfId)) } }, select: { id: true, docNo: true } }),
    ]);
    const t = today();
    return rows.map((x) => {
      const c = find(r.customers, x.customerId);
      const so = orders.find((o) => o.quotationId === x.id);
      return {
        id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, validTill: day(x.validTill)!, customer: { id: x.customerId, code: c?.code ?? '?', name: c?.name ?? '?', city: c?.city ?? null },
        subject: x.subject, salesRep: users.get(x.salesRepUserId ?? '') ?? null, branch: find(r.branches, x.branchId), priceList: find(r.priceLists, x.priceListId),
        revisionOf: find(revisions, x.revisionOfId), grossAmount: num(x.grossAmount), discountAmount: num(x.discountAmount), taxAmount: num(x.taxAmount), netAmount: num(x.netAmount),
        status: quotationShownStatus(x.status, day(x.validTill)!, t), sentAt: iso(x.sentAt), acceptedAt: iso(x.acceptedAt), remarks: x.remarks, terms: x.terms,
        order: so ? { id: so.id, docNo: so.docNo } : null, createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
        lines: lines.filter((l) => l.quotationId === x.id).map((l) => line(l, r)),
      };
    });
  }

  // ---------------------------------------------------------------- sales orders
  async listOrders(tenantId: string, q: SalesQuery): Promise<SalesOrderList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const t = new Date(today());
    const base: Prisma.SalesOrdersWhereInput = {
      tenantId, ...(q.customer && { customerId: q.customer }), ...(q.warehouse && { warehouseId: q.warehouse }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { customerPoRef: { contains: s, mode: 'insensitive' } }, { customerId: { in: await this.customerIds(tenantId, s) } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const late = { ...base, status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED'] }, expectedDeliveryDate: { lt: t } };
    const [rows, total, byStatus, open, toDeliver, dueWeek, lateCount, toInvoice, delivered] = await Promise.all([
      db.salesOrders.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.salesOrders.count({ where }),
      db.salesOrders.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.salesOrders.aggregate({ where: { ...base, status: { in: OPEN_ORDER } }, _sum: { netAmount: true }, _count: { _all: true } }),
      db.salesOrders.count({ where: { ...base, status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED'] } } }),
      db.salesOrders.count({ where: { ...base, status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED'] }, expectedDeliveryDate: { gte: t, lte: addDays(today(), 7) } } }),
      db.salesOrders.count({ where: late }),
      db.salesOrders.aggregate({ where: { ...base, status: 'TO_INVOICE' }, _sum: { netAmount: true } }),
      db.salesOrders.findMany({ where: { ...base, status: { in: ['TO_INVOICE', 'INVOICED'] }, expectedDeliveryDate: { not: null } }, select: { id: true, expectedDeliveryDate: true }, take: 500, orderBy: { docDate: 'desc' } }),
    ]);
    let onTimePct: number | null = null;
    if (delivered.length) {
      const last = await db.deliveryChallans.groupBy({ by: ['salesOrderId'], where: { tenantId, salesOrderId: { in: delivered.map((d) => d.id) }, status: { not: 'CANCELLED' } }, _max: { docDate: true } });
      const onTime = delivered.filter((d) => { const m = last.find((x) => x.salesOrderId === d.id)?._max.docDate; return !m || m <= d.expectedDeliveryDate!; }).length;
      onTimePct = Math.round((onTime / delivered.length) * 1000) / 10;
    }
    return {
      items: (await this.mapOrders(tenantId, rows, false)).map(({ lines, challans, invoices, ...x }) => { void lines; void challans; void invoices; return x; }),
      total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: { open: open._count._all, openAmount: num(open._sum.netAmount), toDeliver, dueThisWeek: dueWeek, toInvoiceAmount: num(toInvoice._sum.netAmount), late: lateCount, onTimePct },
    };
  }

  async getOrder(tenantId: string, id: string) {
    const row = await this.prisma.db().salesOrders.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapOrders(tenantId, [row], true))[0]! : null;
  }

  private async mapOrders(tenantId: string, rows: Prisma.SalesOrdersGetPayload<object>[], full: boolean): Promise<OrderBase[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const allLines = await db.salesOrderLines.findMany({ where: { tenantId, salesOrderId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } });
    const lines = full ? allLines : [];
    const [r, users, quotes, challans, invoiceLines] = await Promise.all([
      refs(db, tenantId, { customers: rows.map((x) => x.customerId), branches: rows.map((x) => x.branchId), warehouses: rows.map((x) => x.warehouseId), priceLists: rows.map((x) => x.priceListId), taxCodes: lines.map((l) => l.taxCodeId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.salesRepUserId, x.createdBy])),
      db.quotations.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.quotationId)) } }, select: { id: true, docNo: true } }),
      full ? db.deliveryChallans.findMany({ where: { tenantId, salesOrderId: { in: rows.map((x) => x.id) } }, select: { id: true, docNo: true, docDate: true, status: true, salesOrderId: true }, orderBy: { docNo: 'asc' } }) : Promise.resolve([]),
      full ? db.salesInvoiceLines.findMany({ where: { tenantId, salesOrderLineId: { in: allLines.map((l) => l.id) } }, select: { invoiceId: true, salesOrderLineId: true } }) : Promise.resolve([]),
    ]);
    const invoices = invoiceLines.length
      ? await db.salesInvoices.findMany({ where: { tenantId, OR: [{ id: { in: ids(invoiceLines.map((l) => l.invoiceId)) } }, { salesOrderId: { in: rows.map((x) => x.id) } }] }, select: { id: true, docNo: true, docDate: true, status: true, salesOrderId: true }, orderBy: { docNo: 'asc' } })
      : full ? await db.salesInvoices.findMany({ where: { tenantId, salesOrderId: { in: rows.map((x) => x.id) } }, select: { id: true, docNo: true, docDate: true, status: true, salesOrderId: true }, orderBy: { docNo: 'asc' } }) : [];
    const t = today();
    return rows.map((x) => {
      const mine = allLines.filter((l) => l.salesOrderId === x.id);
      const ordered = mine.reduce((s, l) => s + num(l.baseQty) + num(l.bonusQty), 0);
      const deliveredPct = pctOf(mine.reduce((s, l) => s + num(l.deliveredQty), 0), ordered);
      const c = find(r.customers, x.customerId);
      const myLineIds = new Set(mine.map((l) => l.id));
      const myInvoiceIds = new Set(invoiceLines.filter((l) => myLineIds.has(l.salesOrderLineId ?? '')).map((l) => l.invoiceId));
      return {
        id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, customer: { id: x.customerId, code: c?.code ?? '?', name: c?.name ?? '?', city: c?.city ?? null },
        branch: find(r.branches, x.branchId), warehouse: find(r.warehouses, x.warehouseId), expectedDeliveryDate: day(x.expectedDeliveryDate), customerPoRef: x.customerPoRef,
        customerPoDate: day(x.customerPoDate), salesRep: users.get(x.salesRepUserId ?? '') ?? null, priceList: find(r.priceLists, x.priceListId), paymentTerms: x.paymentTerms,
        reserveStock: x.reserveStock, grossAmount: num(x.grossAmount), discountAmount: num(x.discountAmount), taxAmount: num(x.taxAmount), netAmount: num(x.netAmount),
        status: x.status, holdReason: x.holdReason, confirmedAt: iso(x.confirmedAt), cancelledAt: iso(x.cancelledAt), cancelReason: x.cancelReason, remarks: x.remarks,
        quotation: find(quotes, x.quotationId), deliveredPct, invoicedPct: pctOf(mine.reduce((s, l) => s + num(l.invoicedQty), 0), ordered),
        late: ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(x.status) && !!x.expectedDeliveryDate && day(x.expectedDeliveryDate)! < t,
        createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
        lines: lines.filter((l) => l.salesOrderId === x.id).map((l) => line(l, r)),
        challans: challans.filter((d) => d.salesOrderId === x.id).map((d) => ({ id: d.id, docNo: d.docNo, docDate: day(d.docDate)!, status: d.status })),
        invoices: invoices.filter((i) => i.salesOrderId === x.id || myInvoiceIds.has(i.id)).map((i) => ({ id: i.id, docNo: i.docNo, docDate: day(i.docDate)!, status: i.status })),
      };
    });
  }

  async deliverableOrders(tenantId: string): Promise<DeliverableOrder[]> {
    const db = this.prisma.db();
    const orders = await db.salesOrders.findMany({ where: { tenantId, status: { in: ['CONFIRMED', 'PARTIALLY_DELIVERED'] } }, orderBy: { docNo: 'asc' }, take: 300 });
    if (!orders.length) return [];
    const lines = await db.salesOrderLines.findMany({ where: { tenantId, salesOrderId: { in: orders.map((o) => o.id) }, itemId: { not: null } }, orderBy: { lineNo: 'asc' } });
    const r = await refs(db, tenantId, { customers: orders.map((o) => o.customerId), warehouses: orders.map((o) => o.warehouseId), products: lines.map((l) => l.itemId) });
    return orders.map((o) => {
      const c = find(r.customers, o.customerId);
      return {
        id: o.id, docNo: o.docNo, customer: { id: o.customerId, code: c?.code ?? '?', name: c?.name ?? '?', city: c?.city ?? null, address: c?.address ?? null, phone: c?.phone ?? null },
        warehouse: find(r.warehouses, o.warehouseId),
        lines: lines.filter((l) => l.salesOrderId === o.id).map((l) => {
          const p = find(r.products, l.itemId)!;
          const ordered = num(l.baseQty) + num(l.bonusQty);
          return { id: l.id, item: { id: p.id, sku: p.sku, name: p.name, trackExpiry: p.trackExpiry }, ordered, delivered: num(l.deliveredQty), pending: Math.max(0, ordered - num(l.deliveredQty)) };
        }).filter((l) => l.pending > 0),
      };
    }).filter((o) => o.lines.length);
  }

  // ---------------------------------------------------------------- delivery challans
  async listChallans(tenantId: string, q: SalesQuery): Promise<DeliveryChallanList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    let soIds: string[] = [];
    if (s) soIds = (await db.salesOrders.findMany({ where: { tenantId, docNo: { contains: s, mode: 'insensitive' } }, select: { id: true }, take: 50 })).map((o) => o.id);
    const base: Prisma.DeliveryChallansWhereInput = {
      tenantId, ...(q.customer && { customerId: q.customer }), ...(q.warehouse && { warehouseId: q.warehouse }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { vehicleNo: { contains: s, mode: 'insensitive' } }, { driverName: { contains: s, mode: 'insensitive' } }, { salesOrderId: { in: soIds } }, { customerId: { in: await this.customerIds(tenantId, s) } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const weekAgo = addDays(today(), -7);
    const [rows, total, byStatus, delivered, invoicedWeek] = await Promise.all([
      db.deliveryChallans.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.deliveryChallans.count({ where }),
      db.deliveryChallans.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.deliveryChallans.findMany({ where: { ...base, status: 'DELIVERED' }, select: { id: true } }),
      db.deliveryChallans.findMany({ where: { ...base, status: 'INVOICED', updatedAt: { gte: weekAgo } }, select: { invoiceId: true } }),
    ]);
    const [unbilled, billed] = await Promise.all([
      delivered.length ? this.challanValue(tenantId, delivered.map((d) => d.id)) : Promise.resolve(0),
      invoicedWeek.length ? db.salesInvoices.aggregate({ where: { tenantId, id: { in: ids(invoicedWeek.map((i) => i.invoiceId)) } }, _sum: { netAmount: true } }) : Promise.resolve(null),
    ]);
    const counts: Record<string, number> = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    return {
      items: (await this.mapChallans(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; }), total, counts,
      kpis: { packed: counts.PACKED ?? 0, onRoad: counts.DISPATCHED ?? 0, deliveredToInvoice: counts.DELIVERED ?? 0, unbilledAmount: unbilled, invoicedWeek: invoicedWeek.length, invoicedWeekAmount: num(billed?._sum.netAmount) },
    };
  }

  /** Delivered-not-invoiced value at the order lines' net rates. */
  private async challanValue(tenantId: string, challanIds: string[]) {
    const db = this.prisma.db();
    const lines = await db.deliveryChallanLines.findMany({ where: { tenantId, deliveryChallanId: { in: challanIds } }, select: { salesOrderLineId: true, baseQty: true } });
    const so = await db.salesOrderLines.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.salesOrderLineId)) } }, select: { id: true, baseQty: true, totalAmount: true } });
    return Math.round(lines.reduce((s, l) => {
      const o = so.find((x) => x.id === l.salesOrderLineId);
      return s + (o && num(o.baseQty) > 0 ? (num(o.totalAmount) / num(o.baseQty)) * num(l.baseQty) : 0);
    }, 0) * 100) / 100;
  }

  async getChallan(tenantId: string, id: string) {
    const row = await this.prisma.db().deliveryChallans.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapChallans(tenantId, [row], true))[0]! : null;
  }

  private async mapChallans(tenantId: string, rows: Prisma.DeliveryChallansGetPayload<object>[], full: boolean): Promise<DeliveryChallan[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.deliveryChallanLines.findMany({ where: { tenantId, deliveryChallanId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, orders, invoices, vouchers] = await Promise.all([
      refs(db, tenantId, { customers: rows.map((x) => x.customerId), branches: rows.map((x) => x.branchId), warehouses: rows.map((x) => x.warehouseId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.map((x) => x.createdBy)),
      db.salesOrders.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.salesOrderId)) } }, select: { id: true, docNo: true } }),
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.invoiceId)) } }, select: { id: true, docNo: true } }),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
    ]);
    return rows.map((x) => {
      const c = find(r.customers, x.customerId);
      return {
        id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, salesOrder: find(orders, x.salesOrderId) ?? { id: x.salesOrderId, docNo: '?' },
        customer: { id: x.customerId, code: c?.code ?? '?', name: c?.name ?? '?', city: c?.city ?? null, address: c?.address ?? null, phone: c?.phone ?? null },
        branch: find(r.branches, x.branchId), warehouse: ref(r.warehouses, x.warehouseId), vehicleNo: x.vehicleNo, driverName: x.driverName, deliverySlot: x.deliverySlot,
        totalQty: num(x.totalQty), costAmount: num(x.costAmount), status: x.status, dispatchedAt: iso(x.dispatchedAt), deliveredAt: iso(x.deliveredAt), receivedBy: x.receivedBy,
        invoice: find(invoices, x.invoiceId), journal: vouchers.get(x.journalEntryId ?? '') ?? null, remarks: x.remarks, cancelledAt: iso(x.cancelledAt),
        createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
        lines: lines.filter((l) => l.deliveryChallanId === x.id).map((l) => {
          const p = find(r.products, l.itemId);
          return {
            id: l.id, lineNo: l.lineNo, salesOrderLineId: l.salesOrderLineId, item: { id: l.itemId, sku: p?.sku ?? '?', name: p?.name ?? '?' }, batchId: l.batchId,
            orderedQty: num(l.orderedQty), previouslyDeliveredQty: num(l.previouslyDeliveredQty), baseQty: num(l.baseQty), unitCost: l.unitCost === null ? null : num(l.unitCost), costAmount: num(l.costAmount),
          };
        }),
      };
    });
  }

  // ---------------------------------------------------------------- sales invoices
  async listInvoices(tenantId: string, q: SalesQuery): Promise<SalesInvoiceList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const t = new Date(today());
    const base: Prisma.SalesInvoicesWhereInput = {
      tenantId, ...(q.customer && { customerId: q.customer }), ...(q.branch && { branchId: q.branch }), ...(q.channel && { channel: q.channel }),
      ...((q.from || q.to) && { docDate: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { fbrInvoiceNo: { contains: s, mode: 'insensitive' } }, { buyerName: { contains: s, mode: 'insensitive' } }, { customerId: { in: await this.customerIds(tenantId, s) } }] }),
    };
    const status: Prisma.SalesInvoicesWhereInput = !q.status ? {}
      : q.status === 'OVERDUE' ? { status: { in: OPEN_INVOICE }, dueDate: { lt: t } }
      : q.status === 'POSTED' ? { status: 'POSTED', dueDate: { gte: t } }
      : { status: q.status };
    const where = { ...base, ...status };
    const [rows, total, byStatus, overdueCount, mtd, open, overdue] = await Promise.all([
      db.salesInvoices.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.salesInvoices.count({ where }),
      db.salesInvoices.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.salesInvoices.count({ where: { ...base, status: 'POSTED', dueDate: { lt: t } } }),
      db.salesInvoices.aggregate({ where: { ...base, status: { notIn: ['DRAFT', 'VOID'] }, docDate: { gte: monthStart() } }, _sum: { netAmount: true }, _count: { _all: true } }),
      db.salesInvoices.aggregate({ where: { ...base, status: { in: OPEN_INVOICE } }, _sum: { balanceAmount: true }, _count: { _all: true } }),
      db.salesInvoices.aggregate({ where: { ...base, status: { in: OPEN_INVOICE }, dueDate: { lt: t } }, _sum: { balanceAmount: true }, _count: { _all: true } }),
    ]);
    const counts: Record<string, number> = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    counts.OVERDUE = overdueCount;
    counts.POSTED = (counts.POSTED ?? 0) - overdueCount;
    const pending = new Set((await db.approvals.findMany({ where: { tenantId, entityType: 'INV', status: 'PENDING', entityId: { in: rows.map((x) => x.id) } }, select: { entityId: true } })).map((a) => a.entityId));
    return {
      items: (await this.mapInvoices(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return { ...x, awaitingApproval: pending.has(x.id) }; }), total, counts,
      kpis: { invoicedMtd: num(mtd._sum.netAmount), invoicedMtdCount: mtd._count._all, outstanding: num(open._sum.balanceAmount), openCount: open._count._all, overdue: num(overdue._sum.balanceAmount), overdueCount: overdue._count._all },
    };
  }

  async getInvoice(tenantId: string, id: string) {
    const row = await this.prisma.db().salesInvoices.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapInvoices(tenantId, [row], true))[0]! : null;
  }

  private async mapInvoices(tenantId: string, rows: Prisma.SalesInvoicesGetPayload<object>[], full: boolean): Promise<InvoiceBase[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.salesInvoiceLines.findMany({ where: { tenantId, invoiceId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, orders, challans, quotes, vouchers] = await Promise.all([
      refs(db, tenantId, { customers: rows.map((x) => x.customerId), branches: rows.map((x) => x.branchId), warehouses: rows.map((x) => x.warehouseId), priceLists: rows.map((x) => x.priceListId), taxCodes: lines.map((l) => l.taxCodeId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.salesRepUserId, x.postedByUserId, x.createdBy])),
      db.salesOrders.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.salesOrderId)) } }, select: { id: true, docNo: true } }),
      db.deliveryChallans.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.deliveryChallanId)) } }, select: { id: true, docNo: true } }),
      db.quotations.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.quotationId)) } }, select: { id: true, docNo: true } }),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
    ]);
    const t = today();
    return rows.map((x) => {
      const c = find(r.customers, x.customerId);
      return {
        id: x.id, docNo: x.docNo, channel: x.channel, docDate: day(x.docDate)!, customer: { id: x.customerId, code: c?.code ?? '?', name: c?.name ?? '?', city: c?.city ?? null },
        branch: ref(r.branches, x.branchId), warehouse: find(r.warehouses, x.warehouseId), salesOrder: find(orders, x.salesOrderId), deliveryChallan: find(challans, x.deliveryChallanId),
        quotation: find(quotes, x.quotationId), customerPoNo: x.customerPoNo, customerPoDate: day(x.customerPoDate), salesRep: users.get(x.salesRepUserId ?? '') ?? null,
        priceList: find(r.priceLists, x.priceListId), paymentTerms: x.paymentTerms, dueDate: day(x.dueDate)!,
        buyer: { name: x.buyerName, address: x.buyerAddress, ntn: x.buyerNtn, strn: x.buyerStrn, cnic: x.buyerCnic, city: x.buyerCity, phone: x.contactPhone, email: x.contactEmail },
        saleType: x.saleType, grossAmount: num(x.grossAmount), discountAmount: num(x.discountAmount), taxableAmount: num(x.taxableAmount), taxAmount: num(x.taxAmount),
        furtherTaxAmount: num(x.furtherTaxAmount), netAmount: num(x.netAmount), paidAmount: num(x.paidAmount), balanceAmount: num(x.balanceAmount), costAmount: num(x.costAmount),
        submitToFbr: x.submitToFbr, fbrStatus: x.fbrStatus, fbrInvoiceNo: x.fbrInvoiceNo, fbrError: x.fbrError, status: x.status,
        overdue: OPEN_INVOICE.includes(x.status) && day(x.dueDate)! < t, postedAt: iso(x.postedAt), postedBy: users.get(x.postedByUserId ?? '') ?? null,
        journal: vouchers.get(x.journalEntryId ?? '') ?? null, voidReason: x.voidReason, voidedAt: iso(x.voidedAt), customerNotes: x.customerNotes, termsConditions: x.termsConditions,
        remarks: x.remarks, billBookNo: x.billBookNo, bookerName: x.bookerName, deliverymanName: x.deliverymanName, salesmanName: x.salesmanName, supervisorName: x.supervisorName,
        deliverySlot: x.deliverySlot, createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
        lines: lines.filter((l) => l.invoiceId === x.id).map((l) => line(l, r)),
      };
    });
  }

  // ---------------------------------------------------------------- writes
  save(fn: SaveFunction, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async set(doc: Doc, tenantId: string, id: string, data: Record<string, unknown>) {
    const db = this.prisma.db();
    const where = { tenantId, id };
    if (doc === 'quotation') await db.quotations.updateMany({ where, data });
    else if (doc === 'order') await db.salesOrders.updateMany({ where, data });
    else if (doc === 'challan') await db.deliveryChallans.updateMany({ where, data });
    else await db.salesInvoices.updateMany({ where, data });
  }

  async run(fn: Lifecycle, id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (LIFECYCLE_TEXT.includes(fn)) await db.$queryRawUnsafe(`select "Sales"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "Sales"."${fn}"($1::uuid)::text`, id);
  }

  async confirmOrder(id: string, allowOverLimit: boolean) {
    await this.prisma.db().$queryRawUnsafe(`select "Sales"."salesOrderConfirm"($1::uuid, $2::boolean)::text`, id, allowOverLimit);
  }

  async deleteDraft(doc: Doc, tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (doc === 'quotation') {
      if (!(await db.quotations.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.quotationLines.deleteMany({ where: { tenantId, quotationId: id } });
      return (await db.quotations.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (doc === 'order') {
      if (!(await db.salesOrders.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.salesOrderLines.deleteMany({ where: { tenantId, salesOrderId: id } });
      return (await db.salesOrders.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (doc === 'challan') {
      if (!(await db.deliveryChallans.count({ where: { tenantId, id, rowVersion, status: 'PACKED', dispatchedAt: null } }))) return false;
      await db.deliveryChallanLines.deleteMany({ where: { tenantId, deliveryChallanId: id } });
      return (await db.deliveryChallans.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (!(await db.salesInvoices.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
    await db.salesInvoiceLines.deleteMany({ where: { tenantId, invoiceId: id } });
    return (await db.salesInvoices.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
  }
}
