import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type {
  BackOrder, BackOrderList, BulkRun, BulkRunList, HeldBill, IncomingStock, OrderBooking, OrderBookingList, OrderTemplate, StockMap, WholesaleOptions, WholesaleQuery,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { WholesaleStore, type BookingScope, type WholesaleSave } from '../application/wholesale-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };
const today = () => new Date().toISOString().slice(0, 10);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };
const ageDays = (d: Date) => Math.max(0, Math.round((Date.parse(today()) - Date.parse(day(d)!)) / 86_400_000));
const OPEN_BO = ['WAITING', 'PART_ALLOCATED', 'READY'];

async function employeeNames(db: Db, tenantId: string, xs: (string | null)[]) {
  const rows = ids(xs).length ? await db.employees.findMany({ where: { tenantId, id: { in: ids(xs) } }, select: { id: true, displayName: true, firstName: true, lastName: true } }) : [];
  return new Map(rows.map((e) => [e.id, { id: e.id, name: e.displayName ?? [e.firstName, e.lastName].filter(Boolean).join(' ') }]));
}
async function customers(db: Db, tenantId: string, xs: (string | null)[]) {
  const rows = ids(xs).length ? await db.customers.findMany({ where: { tenantId, id: { in: ids(xs) } }, select: { id: true, code: true, name: true, area: true } }) : [];
  return rows;
}
async function products(db: Db, tenantId: string, xs: (string | null)[]) {
  return ids(xs).length ? db.products.findMany({ where: { tenantId, id: { in: ids(xs) } }, select: { id: true, sku: true, name: true, ctn: true } }) : [];
}
const item = (ps: { id: string; sku: string; name: string; ctn: number }[], id: string) => find(ps, id) ?? { id, sku: '?', name: '?', ctn: 1 };

@Injectable()
export class PrismaWholesaleStore extends WholesaleStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ---------------------------------------------------------------- options
  async options(tenantId: string, userId: string, allRoutes: boolean): Promise<WholesaleOptions> {
    const db = this.prisma.db();
    const [routes, days, profiles, areas, tiers, prods, taxCodes, rates, schemes, schemeItems, warehouses, branches, emps, me] = await Promise.all([
      db.routes.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { code: 'asc' } }),
      db.routeVisitDays.findMany({ where: { tenantId }, select: { routeId: true, weekday: true, isoDow: true }, orderBy: { isoDow: 'asc' } }),
      db.shopRouteProfiles.findMany({ where: { tenantId, isActive: true } }),
      db.shopAreas.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      db.priceTiers.findMany({ where: { tenantId, isActive: true, deletedAt: null }, orderBy: { allocationRank: 'asc' } }),
      db.products.findMany({ where: { tenantId, deletedAt: null, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }),
      db.taxCodes.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true } }),
      db.taxCodeRates.findMany({ where: { tenantId, effectiveFrom: { lte: new Date(today()) } }, orderBy: { effectiveFrom: 'desc' } }),
      db.salesSchemes.findMany({ where: { tenantId, deletedAt: null, isActive: true, schemeType: 'FREE_GOODS', validFrom: { lte: new Date(today()) }, validTo: { gte: new Date(today()) } } }),
      db.salesSchemeItems.findMany({ where: { tenantId }, select: { schemeId: true, itemId: true } }),
      db.warehouses.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.employees.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, displayName: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
      this.employeeOf(tenantId, userId),
    ]);
    const shopIds = profiles.map((p) => p.customerId);
    const custs = shopIds.length ? await db.customers.findMany({ where: { tenantId, id: { in: shopIds }, deletedAt: null } }) : [];
    const empName = (id: string | null) => {
      const e = emps.find((x) => x.id === id);
      return e ? { id: e.id, name: e.displayName ?? [e.firstName, e.lastName].filter(Boolean).join(' ') } : null;
    };
    const rateOf = (taxCodeId: string | null) => {
      if (!taxCodeId || !taxCodes.some((t) => t.id === taxCodeId)) return null;
      const r = rates.find((x) => x.taxCodeId === taxCodeId && (!x.effectiveTo || day(x.effectiveTo)! >= today()));
      return r?.rate ? num(r.rate) : null;
    };
    return {
      routes: routes.map((r) => ({
        id: r.id, code: r.code, name: r.name, branchId: r.branchId, warehouseId: r.sourceWarehouseId, booker: empName(r.bookerEmployeeId), salesman: empName(r.salesmanEmployeeId),
        days: days.filter((d) => d.routeId === r.id).map((d) => d.weekday),
      })),
      shops: profiles.flatMap((p) => {
        const c = custs.find((x) => x.id === p.customerId);
        return c ? [{
          customerId: c.id, code: c.code, name: c.name, area: areas.find((a) => a.id === p.areaId)?.name ?? c.area, city: c.city, phone: c.mobile ?? c.phone, routeId: p.routeId,
          priceTier: p.priceTier, creditLimit: num(c.creditLimit), status: c.status, paymentTerms: c.paymentTerms,
        }] : [];
      }).sort((a, b) => a.name.localeCompare(b.name)),
      tiers: tiers.map((t) => ({ code: t.code, name: t.name, rateFactor: num(t.rateFactor), allocationRank: t.allocationRank })),
      products: prods.map((p) => ({
        id: p.id, sku: p.sku, name: p.name, ctn: p.ctn > 0 ? p.ctn : 1, wprice: num(p.wprice), price: num(p.price), taxCodeId: p.taxCodeId,
        taxRate: rateOf(p.taxCodeId) ?? num(p.gstRate), trackExpiry: p.trackExpiry,
      })),
      schemes: schemes.filter((s) => num(s.buyQty) > 0 && num(s.freeQty) > 0).map((s) => ({
        id: s.id, code: s.code, name: s.name, buyQty: num(s.buyQty), freeQty: num(s.freeQty),
        itemIds: s.appliesToAll ? null : schemeItems.filter((i) => i.schemeId === s.id).map((i) => i.itemId),
      })),
      warehouses, branches,
      employees: emps.map((e) => ({ id: e.id, name: e.displayName ?? [e.firstName, e.lastName].filter(Boolean).join(' ') })),
      me: { employeeId: me, allRoutes },
    };
  }

  async stock(tenantId: string, warehouseId: string): Promise<StockMap> {
    const rows = await this.prisma.db().$queryRaw<{ itemId: string; qty: Prisma.Decimal }[]>`
      select sb."itemId", sum(sb."qtyAvailable") as qty from "Inventory"."StockBalances" sb
       where sb."tenantId" = ${tenantId}::uuid and sb."warehouseId" = ${warehouseId}::uuid group by sb."itemId"`;
    return Object.fromEntries(rows.map((r) => [r.itemId, Number(r.qty)]));
  }

  async employeeOf(tenantId: string, userId: string) {
    return (await this.prisma.db().employees.findFirst({ where: { tenantId, appUserId: userId, deletedAt: null }, select: { id: true } }))?.id ?? null;
  }

  // ---------------------------------------------------------------- order templates
  async listTemplates(tenantId: string, userId: string, customerId: string | null) {
    const rows = await this.prisma.db().orderTemplates.findMany({
      where: { tenantId, deletedAt: null, status: 'ACTIVE', AND: [{ OR: [{ isShared: true }, { ownerUserId: userId }] }, ...(customerId ? [{ OR: [{ customerId: null }, { customerId }] }] : [])] },
      orderBy: { name: 'asc' },
    });
    return this.mapTemplates(tenantId, rows);
  }

  async getTemplate(tenantId: string, id: string) {
    const row = await this.prisma.db().orderTemplates.findFirst({ where: { tenantId, id, deletedAt: null } });
    return row ? (await this.mapTemplates(tenantId, [row]))[0]! : null;
  }

  private async mapTemplates(tenantId: string, rows: Prisma.OrderTemplatesGetPayload<object>[]): Promise<OrderTemplate[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = await db.orderTemplateLines.findMany({ where: { tenantId, orderTemplateId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } });
    const [cs, ps, users] = await Promise.all([customers(db, tenantId, rows.map((r) => r.customerId)), products(db, tenantId, lines.map((l) => l.itemId)), userRefs(db, tenantId, rows.map((r) => r.ownerUserId))]);
    return rows.map((t) => ({
      id: t.id, name: t.name, customer: find(cs, t.customerId), owner: users.get(t.ownerUserId ?? '') ?? null, isShared: t.isShared, status: t.status,
      updatedAt: t.updatedAt.toISOString(), rowVersion: t.rowVersion,
      lines: lines.filter((l) => l.orderTemplateId === t.id).map((l) => ({ id: l.id, item: item(ps, l.itemId), qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose) })),
    }));
  }

  async archiveTemplate(tenantId: string, id: string, rowVersion: number) {
    return (await this.prisma.db().orderTemplates.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { status: 'ARCHIVED', deletedAt: new Date() } })).count > 0;
  }

  // ---------------------------------------------------------------- held bills
  async listHeld(tenantId: string) {
    const rows = await this.prisma.db().heldBills.findMany({ where: { tenantId, status: 'HELD' }, orderBy: { heldAt: 'desc' }, take: 100 });
    return (await this.mapHeld(tenantId, rows)).map(({ routeId, warehouseId, salesmanEmployeeId, customerId, ...h }) => { void routeId; void warehouseId; void salesmanEmployeeId; void customerId; return h; });
  }

  async getHeld(tenantId: string, id: string) {
    const row = await this.prisma.db().heldBills.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapHeld(tenantId, [row]))[0]! : null;
  }

  private async mapHeld(tenantId: string, rows: Prisma.HeldBillsGetPayload<object>[]) {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = await db.heldBillLines.findMany({ where: { tenantId, heldBillId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } });
    const [cs, ps, users, emps, routes, whs] = await Promise.all([
      customers(db, tenantId, rows.map((r) => r.customerId)), products(db, tenantId, lines.map((l) => l.itemId)), userRefs(db, tenantId, rows.map((r) => r.heldByUserId)),
      employeeNames(db, tenantId, rows.map((r) => r.salesmanEmployeeId)),
      db.routes.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.routeId)) } }, select: { id: true, code: true, name: true } }),
      db.warehouses.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.warehouseId)) } }, select: { id: true, code: true, name: true } }),
    ]);
    return rows.map((h) => ({
      id: h.id, docDate: day(h.docDate)!, customer: ref(cs, h.customerId), route: find(routes, h.routeId), salesman: emps.get(h.salesmanEmployeeId ?? '') ?? null,
      warehouse: find(whs, h.warehouseId), priceTier: h.priceTier, holdReason: h.holdReason, lineCount: h.lineCount, totalCtn: num(h.totalCtn), totalLoose: num(h.totalLoose),
      netAmount: num(h.netAmount), status: h.status, heldAt: h.heldAt.toISOString(), heldBy: users.get(h.heldByUserId ?? '') ?? null, remarks: h.remarks, rowVersion: h.rowVersion,
      routeId: h.routeId, warehouseId: h.warehouseId, salesmanEmployeeId: h.salesmanEmployeeId, customerId: h.customerId,
      lines: lines.filter((l) => l.heldBillId === h.id).map((l) => ({
        item: item(ps, l.itemId), qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose), bonusQty: num(l.bonusQty), schemeId: l.schemeId, rate: num(l.rate),
        isManualRate: l.isManualRate, discountPct: num(l.discountPct), taxRate: num(l.taxRate), netAmount: num(l.netAmount),
      })),
    })) satisfies (HeldBill & { routeId: string | null; warehouseId: string | null; salesmanEmployeeId: string | null; customerId: string })[];
  }

  // ---------------------------------------------------------------- order bookings
  async routesOf(tenantId: string, employeeId: string) {
    return (await this.prisma.db().routes.findMany({ where: { tenantId, bookerEmployeeId: employeeId, deletedAt: null }, select: { id: true } })).map((r) => r.id);
  }

  async listBookings(tenantId: string, q: WholesaleQuery, scope: BookingScope): Promise<OrderBookingList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    let scoped: Prisma.OrderBookingsWhereInput = {};
    if (scope) {
      const routes = scope.employeeId ? await this.routesOf(tenantId, scope.employeeId) : [];
      scoped = { OR: [{ bookerEmployeeId: scope.employeeId ?? '00000000-0000-0000-0000-000000000000' }, { routeId: { in: routes } }] };
    }
    const custIds = s ? (await db.customers.findMany({ where: { tenantId, OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } }] }, select: { id: true }, take: 50 })).map((c) => c.id) : [];
    const base: Prisma.OrderBookingsWhereInput = {
      tenantId, ...scoped, ...(q.route && { routeId: q.route }), ...(q.booker && { bookerEmployeeId: q.booker }), ...(q.customer && { customerId: q.customer }),
      ...((q.from || q.to) && { docDate: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { customerId: { in: custIds } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const t = new Date(today());
    const y = new Date(Date.parse(today()) - 86_400_000);
    const [rows, total, byStatus, todayAgg, yesterday, awaiting, partial, gps, all] = await Promise.all([
      db.orderBookings.findMany({ where, orderBy: [{ bookedAt: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.orderBookings.count({ where }),
      db.orderBookings.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.orderBookings.aggregate({ where: { ...base, docDate: t, status: { not: 'CANCELLED' } }, _sum: { netAmount: true }, _count: { _all: true } }),
      db.orderBookings.count({ where: { ...base, docDate: y, status: { not: 'CANCELLED' } } }),
      db.orderBookings.count({ where: { ...base, status: { in: ['NEW', 'CHECKED', 'HELD'] } } }),
      db.orderBookings.count({ where: { ...base, status: 'PARTIAL' } }),
      db.orderBookings.count({ where: { ...base, gpsVerified: true, status: { not: 'CANCELLED' } } }),
      db.orderBookings.count({ where: { ...base, status: { not: 'CANCELLED' } } }),
    ]);
    const boLines = await db.backOrders.count({ where: { tenantId, status: { in: OPEN_BO }, sourceOrderBookingId: { not: null } } });
    return {
      items: (await this.mapBookings(tenantId, rows, false)).map(({ lines, ...b }) => { void lines; return b; }), total,
      counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      kpis: { today: todayAgg._count._all, yesterday, todayValue: num(todayAgg._sum.netAmount), awaiting, partial, backorderLines: boLines, gpsVerifiedPct: all ? Math.round((gps / all) * 1000) / 10 : null },
    };
  }

  async getBooking(tenantId: string, id: string) {
    const row = await this.prisma.db().orderBookings.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapBookings(tenantId, [row], true))[0]! : null;
  }

  private async mapBookings(tenantId: string, rows: Prisma.OrderBookingsGetPayload<object>[], full: boolean): Promise<OrderBooking[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.orderBookingLines.findMany({ where: { tenantId, orderBookingId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [cs, ps, emps, routes, whs, invs] = await Promise.all([
      customers(db, tenantId, rows.map((r) => r.customerId)), products(db, tenantId, lines.map((l) => l.itemId)), employeeNames(db, tenantId, rows.map((r) => r.bookerEmployeeId)),
      db.routes.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.routeId)) } }, select: { id: true, code: true, name: true } }),
      db.warehouses.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.warehouseId)) } }, select: { id: true, code: true, name: true } }),
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.invoiceId)) } }, select: { id: true, docNo: true } }),
    ]);
    return rows.map((b) => {
      const c = find(cs, b.customerId);
      const sc = (b.stockCheck ?? {}) as { short?: { sku: string; need: number; have: number }[] };
      return {
        id: b.id, docNo: b.docNo, docDate: day(b.docDate)!, bookedAt: b.bookedAt.toISOString(), booker: emps.get(b.bookerEmployeeId) ?? null, route: ref(routes, b.routeId),
        customer: { id: b.customerId, code: c?.code ?? '?', name: c?.name ?? '?', area: c?.area ?? null }, warehouse: find(whs, b.warehouseId), priceTier: b.priceTier,
        gpsVerified: b.gpsVerified, gpsOffsetM: b.gpsOffsetM === null ? null : num(b.gpsOffsetM), note: b.note, lineCount: b.lineCount, grossAmount: num(b.grossAmount),
        taxAmount: num(b.taxAmount), netAmount: num(b.netAmount), status: b.status, stockCheckedAt: iso(b.stockCheckedAt), shortLineCount: b.shortLineCount,
        short: (sc.short ?? []).map((x) => ({ sku: x.sku, need: Number(x.need), have: Number(x.have) })), allowPartial: b.allowPartial, invoice: find(invs, b.invoiceId),
        convertedAt: iso(b.convertedAt), cancelledAt: iso(b.cancelledAt), cancelReason: b.cancelReason, createdAt: b.createdAt.toISOString(), rowVersion: b.rowVersion,
        lines: lines.filter((l) => l.orderBookingId === b.id).map((l) => ({
          id: l.id, lineNo: l.lineNo, item: item(ps, l.itemId), qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose), baseQty: num(l.baseQty), rate: num(l.rate), taxRate: num(l.taxRate),
          netAmount: num(l.netAmount), availableQty: l.availableQty === null ? null : num(l.availableQty), shortQty: num(l.shortQty), invoicedQty: num(l.invoicedQty), backorderQty: num(l.backorderQty),
        })),
      };
    });
  }

  async deleteBooking(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (!(await db.orderBookings.count({ where: { tenantId, id, rowVersion, status: 'NEW' } }))) return false;
    await db.orderBookingLines.deleteMany({ where: { tenantId, orderBookingId: id } });
    return (await db.orderBookings.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
  }

  // ---------------------------------------------------------------- bulk invoice runs
  async listRuns(tenantId: string, q: WholesaleQuery): Promise<BulkRunList> {
    const db = this.prisma.db();
    const where: Prisma.BulkInvoiceRunsWhereInput = { tenantId, ...(q.route && { routeId: q.route }), ...(q.status && { status: q.status }) };
    const [rows, total] = await Promise.all([
      db.bulkInvoiceRuns.findMany({ where, orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.bulkInvoiceRuns.count({ where }),
    ]);
    return { items: (await this.mapRuns(tenantId, rows, false)).map(({ cells, invoices, skipped, ...r }) => { void cells; void invoices; void skipped; return r; }), total };
  }

  async getRun(tenantId: string, id: string) {
    const row = await this.prisma.db().bulkInvoiceRuns.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapRuns(tenantId, [row], true))[0]! : null;
  }

  private async mapRuns(tenantId: string, rows: Prisma.BulkInvoiceRunsGetPayload<object>[], full: boolean): Promise<BulkRun[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [cells, skipped] = full
      ? await Promise.all([
        db.bulkInvoiceRunCells.findMany({ where: { tenantId, bulkInvoiceBatchId: { in: rows.map((r) => r.id) } } }),
        db.bulkInvoiceSkippedShops.findMany({ where: { tenantId, bulkInvoiceBatchId: { in: rows.map((r) => r.id) } } }),
      ])
      : [[], []];
    const invIds = ids(cells.map((c) => c.invoiceId));
    const [routes, whs, users, cs, invs] = await Promise.all([
      db.routes.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.routeId)) } }, select: { id: true, code: true, name: true } }),
      db.warehouses.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.warehouseId)) } }, select: { id: true, code: true, name: true } }),
      userRefs(db, tenantId, rows.map((r) => r.generatedByUserId)),
      customers(db, tenantId, [...cells.map((c) => c.customerId), ...skipped.map((s) => s.customerId)]),
      invIds.length ? db.salesInvoices.findMany({ where: { tenantId, id: { in: invIds } }, select: { id: true, docNo: true, netAmount: true, customerId: true } }) : Promise.resolve([]),
    ]);
    return rows.map((r) => ({
      id: r.id, docDate: day(r.docDate)!, route: ref(routes, r.routeId), warehouse: find(whs, r.warehouseId), mode: r.mode, status: r.status, shopsSelected: r.shopsSelected,
      totalCtn: num(r.totalCtn), totalValue: num(r.totalValue), creditWarnings: r.creditWarnings, invoiceCount: r.invoiceCount, invoicedValue: num(r.invoicedValue),
      skippedCount: r.skippedCount, firstInvoiceNo: r.firstInvoiceNo, lastInvoiceNo: r.lastInvoiceNo, generatedAt: iso(r.generatedAt), generatedBy: users.get(r.generatedByUserId ?? '') ?? null,
      createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
      cells: cells.filter((c) => c.bulkInvoiceBatchId === r.id).map((c) => ({ customerId: c.customerId, itemId: c.itemId, qtyCtn: num(c.qtyCtn), rate: num(c.rate), amount: num(c.amount), invoiceId: c.invoiceId })),
      invoices: invs.filter((i) => cells.some((c) => c.bulkInvoiceBatchId === r.id && c.invoiceId === i.id)).map((i) => ({ customerId: i.customerId, customer: ref(cs, i.customerId).name, id: i.id, docNo: i.docNo, amount: num(i.netAmount) })),
      skipped: skipped.filter((s) => s.bulkInvoiceBatchId === r.id).map((s) => ({ customerId: s.customerId, customer: ref(cs, s.customerId).name, reasonCode: s.reasonCode, reason: s.reason, billAmount: num(s.billAmount), overByAmount: s.overByAmount === null ? null : num(s.overByAmount) })),
    }));
  }

  async completeRun(tenantId: string, id: string, userId: string, done: { customerId: string; invoiceId: string; docNo: string; amount: number }[], skipped: { customerId: string; reasonCode: string; reason: string; billAmount: number; outstandingAmount: number | null; creditLimit: number | null; overByAmount: number | null }[], creditWarnings: number) {
    const db = this.prisma.db();
    for (const d of done) await db.bulkInvoiceRunCells.updateMany({ where: { tenantId, bulkInvoiceBatchId: id, customerId: d.customerId }, data: { invoiceId: d.invoiceId } });
    if (skipped.length) {
      await db.bulkInvoiceSkippedShops.createMany({ data: skipped.map((s) => ({ tenantId, bulkInvoiceBatchId: id, customerId: s.customerId, reasonCode: s.reasonCode, reason: s.reason, billAmount: s.billAmount, outstandingAmount: s.outstandingAmount, creditLimit: s.creditLimit, overByAmount: s.overByAmount })) });
    }
    const sorted = [...done].sort((a, b) => a.docNo.localeCompare(b.docNo));
    await db.bulkInvoiceRuns.updateMany({
      where: { tenantId, id },
      data: {
        status: 'COMPLETED', generatedAt: new Date(), generatedByUserId: userId, creditWarnings, invoiceCount: done.length, invoicedValue: Math.round(done.reduce((s, d) => s + d.amount, 0) * 100) / 100,
        skippedCount: skipped.length, firstInvoiceNo: sorted[0]?.docNo ?? null, lastInvoiceNo: sorted.at(-1)?.docNo ?? null,
      },
    });
  }

  // ---------------------------------------------------------------- back-orders
  async listBackOrders(tenantId: string, q: WholesaleQuery): Promise<BackOrderList> {
    const db = this.prisma.db();
    const where: Prisma.BackOrdersWhereInput = {
      tenantId, ...(q.status ? { status: q.status } : { status: { in: OPEN_BO } }), ...(q.customer && { customerId: q.customer }), ...(q.item && { itemId: q.item }), ...(q.route && { routeId: q.route }),
    };
    const rows = await db.backOrders.findMany({ where, orderBy: [{ backorderDate: 'asc' }, { createdAt: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize });
    const [total, open] = await Promise.all([db.backOrders.count({ where }), db.backOrders.findMany({ where: { tenantId, status: { in: OPEN_BO } }, select: { itemId: true, customerId: true, pendingQty: true, unitRate: true, taxRate: true, backorderDate: true, status: true } })]);
    const items = await this.mapBackOrders(tenantId, rows);
    return {
      items, total,
      kpis: {
        pendingLines: open.length, products: new Set(open.map((o) => o.itemId)).size, customers: new Set(open.map((o) => o.customerId)).size,
        pendingValue: Math.round(open.reduce((s, o) => s + num(o.pendingQty) * num(o.unitRate) * (1 + num(o.taxRate) / 100), 0) * 100) / 100,
        oldestDays: open.length ? Math.max(...open.map((o) => ageDays(o.backorderDate))) : 0, ready: open.filter((o) => o.status === 'READY').length,
      },
    };
  }

  async getBackOrders(tenantId: string, xs: string[]) {
    return this.mapBackOrders(tenantId, await this.prisma.db().backOrders.findMany({ where: { tenantId, id: { in: xs } } }));
  }

  private async mapBackOrders(tenantId: string, rows: Prisma.BackOrdersGetPayload<object>[]): Promise<BackOrder[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const allocs = await db.backOrderAllocations.findMany({ where: { tenantId, backorderLineId: { in: rows.map((r) => r.id) } }, orderBy: { allocatedAt: 'asc' } });
    const [cs, ps, routes, bookings, invs, grns, batches] = await Promise.all([
      customers(db, tenantId, rows.map((r) => r.customerId)), products(db, tenantId, rows.map((r) => r.itemId)),
      db.routes.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.routeId)) } }, select: { id: true, code: true, name: true } }),
      db.orderBookings.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.sourceOrderBookingId)) } }, select: { id: true, docNo: true } }),
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids([...rows.map((r) => r.sourceInvoiceId), ...rows.map((r) => r.lastInvoiceId)]) } }, select: { id: true, docNo: true } }),
      db.goodsReceivedNotes.findMany({ where: { tenantId, id: { in: ids(allocs.map((a) => a.grnId)) } }, select: { id: true, docNo: true } }),
      db.productBatches.findMany({ where: { tenantId, id: { in: ids(allocs.map((a) => a.batchId)) } }, select: { id: true, batchNo: true } }),
    ]);
    return rows.map((b) => {
      const c = find(cs, b.customerId);
      const srcId = b.sourceOrderBookingId ?? b.sourceInvoiceId;
      const src = find(bookings, b.sourceOrderBookingId) ?? find(invs, b.sourceInvoiceId);
      const pending = num(b.pendingQty);
      return {
        id: b.id, source: { type: b.sourceDocType, id: srcId, docNo: src?.docNo ?? null }, customer: { id: b.customerId, code: c?.code ?? '?', name: c?.name ?? '?', area: c?.area ?? null },
        route: find(routes, b.routeId), item: item(ps, b.itemId), backorderDate: day(b.backorderDate)!, ageDays: ageDays(b.backorderDate), originalQty: num(b.originalQty),
        invoicedQty: num(b.invoicedQty), cancelledQty: num(b.cancelledQty), pendingQty: pending, allocatedQty: num(b.allocatedQty), unitRate: num(b.unitRate), taxRate: num(b.taxRate),
        value: Math.round(pending * num(b.unitRate) * (1 + num(b.taxRate) / 100) * 100) / 100, status: b.status, lastInvoice: find(invs, b.lastInvoiceId),
        allocations: allocs.filter((a) => a.backorderLineId === b.id).map((a) => ({ grnNo: find(grns, a.grnId)?.docNo ?? '?', batchNo: find(batches, a.batchId)?.batchNo ?? null, qty: num(a.qty), status: a.status })),
      };
    });
  }

  async incoming(tenantId: string): Promise<IncomingStock[]> {
    const rows = await this.prisma.db().$queryRaw<Record<string, unknown>[]>`
      select * from "Distribution"."getBackOrderIncomingStock" v where v."tenantId" = ${tenantId}::uuid and v."grnStatus" = 'POSTED' order by v."docDate" desc, v."grnNo" limit 200`;
    return rows.map((r) => ({
      grnLineId: String(r.grnLineId), grnId: String(r.grnId), grnNo: String(r.grnNo), docDate: day(r.docDate as Date)!, vendor: (r.vendorName as string | null) ?? null,
      item: { id: String(r.itemId), sku: String(r.sku), name: String(r.itemName), ctn: Number(r.unitsPerCtn) || 1 }, batchNo: (r.batchNo as string | null) ?? null,
      expiryDate: r.expiryDate ? day(r.expiryDate as Date) : null, acceptedQty: Number(r.acceptedQty), freeQty: Number(r.freeQty), waitingQty: Number(r.backorderUnallocatedQty),
      customersWaiting: Number(r.customersWaiting), arrived: r.arrivalStatus === 'ARRIVED',
    }));
  }

  async allocationSource(tenantId: string, backOrderIds: string[]) {
    const rows = await this.prisma.db().$queryRaw<{ backorderLineId: string; warehouseId: string; batchId: string | null; branchId: string | null }[]>`
      select distinct on (a."backorderLineId") a."backorderLineId", g."warehouseId", a."batchId", g."branchId"
        from "Distribution"."BackOrderAllocations" a join "Purchases"."GoodsReceivedNotes" g on g."tenantId" = a."tenantId" and g.id = a."grnId"
       where a."tenantId" = ${tenantId}::uuid and a.status = 'ALLOCATED' and a."backorderLineId" = any(${backOrderIds}::uuid[])
       order by a."backorderLineId", a."allocatedAt" desc`;
    return new Map(rows.map((r) => [r.backorderLineId, { warehouseId: r.warehouseId, batchId: r.batchId, branchId: r.branchId }]));
  }

  // ---------------------------------------------------------------- writes
  save(fn: WholesaleSave, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  private exec(sql: string, ...args: unknown[]) {
    return this.prisma.db().$queryRawUnsafe<Record<string, unknown>[]>(sql, ...args);
  }

  async checkStock(xs: string[]) { await this.exec(`select "Distribution"."orderBookingCheckStock"($1::uuid[])::text`, xs); }
  async holdBooking(id: string) { await this.exec(`select "Distribution"."orderBookingHold"($1::uuid)::text`, id); }
  async bookingConverted(id: string, invoiceId: string) { await this.exec(`select "Distribution"."orderBookingConverted"($1::uuid, $2::uuid)::text`, id, invoiceId); }
  async cancelBooking(id: string, reason: string | null) { await this.exec(`select "Distribution"."orderBookingCancel"($1::uuid, $2::text)::text`, id, reason); }
  async closeHeld(id: string, status: 'RECALLED' | 'DISCARDED') { await this.exec(`select "Distribution"."heldBillClose"($1::uuid, $2::text)::text`, id, status); }
  async allocate(grnLineId: string, policy: string, xs: string[] | null) {
    const r = await this.exec(`select "Distribution"."backOrderAllocate"($1::uuid, $2::text, $3::uuid[])::text as qty`, grnLineId, policy, xs);
    return Number(r[0]?.qty ?? 0);
  }
  async backOrderInvoiced(id: string, invoiceId: string) { await this.exec(`select "Distribution"."backOrderInvoiced"($1::uuid, $2::uuid)::text`, id, invoiceId); }
  async cancelBackOrder(id: string, reason: string, note: string | null) { await this.exec(`select "Distribution"."backOrderCancel"($1::uuid, $2::text, $3::text)::text`, id, reason, note); }
}
