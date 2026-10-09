import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type {
  CreditControl, CreditOverride, DistributionOpsOptions, DistributionQuery, LoadCandidate, LoadSheet, LoadSheetList, RecoverySheet, RecoverySheetList, RouteSettlement,
  RouteSettlementList, SalesmanCommission, SalesmanTarget,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import {
  DistributionOpsStore, type CustomerCreditFacts, type DistDoc, type DistLifecycle, type DistSave, type InvoiceFacts, type RecoveryCandidate, type SettlementDetail,
} from '../application/distribution-ops-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };
const page = (q: DistributionQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
const count = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dt = (d: string) => new Date(`${d}T00:00:00Z`);
const today = () => new Date().toISOString().slice(0, 10);

const LOOKUPS = {
  returnReasons: 'RouteSettlementReturnReason', deliveryStates: 'DeliveryState', recoveryModes: 'RecoverySheetLineMode', overrideTypes: 'OverrideType',
  holdReasons: 'CreditHoldEventReason', targetRoles: 'SalesmanTargetRole',
} as const;

@Injectable()
export class PrismaDistributionOpsStore extends DistributionOpsStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ---------------------------------------------------------------- reference data
  private async employees(db: Db, tenantId: string, employeeIds: (string | null)[]) {
    const rows = await db.employees.findMany({ where: { tenantId, id: { in: ids(employeeIds) } }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true } });
    return rows.map((e) => ({ id: e.id, code: e.code, name: e.displayName || `${e.firstName} ${e.lastName ?? ''}`.trim() }));
  }
  private who(xs: Ref[], id: string | null | undefined) {
    const e = find(xs, id);
    return e ? { id: e.id, name: e.name } : null;
  }
  private customers(db: Db, tenantId: string, customerIds: (string | null)[]) {
    return db.customers.findMany({ where: { tenantId, id: { in: ids(customerIds) } }, select: { id: true, code: true, name: true, city: true } });
  }
  private routes(db: Db, tenantId: string, routeIds: (string | null)[]) {
    return db.routes.findMany({ where: { tenantId, id: { in: ids(routeIds) } }, select: { id: true, code: true, name: true } });
  }
  private docNos<T extends { id: string; docNo: string }>(rows: T[]) {
    return (id: string | null | undefined) => {
      const r = find(rows, id);
      return r ? { id: r.id, docNo: r.docNo } : null;
    };
  }

  async options(tenantId: string): Promise<DistributionOpsOptions> {
    const db = this.prisma.db();
    const [routes, vans, emps, whs, branches, cash, banksAcc, banks, slabs, lookups] = await Promise.all([
      db.routes.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
      db.vans.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { regNo: 'asc' } }),
      db.employees.findMany({ where: { tenantId, deletedAt: null, status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED', 'NOTICE_PERIOD'] } }, orderBy: { firstName: 'asc' }, select: { id: true, code: true, displayName: true, firstName: true, lastName: true, isBooker: true, isSalesman: true, isDeliveryman: true, appUserId: true } }),
      db.warehouses.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }),
      db.cashAccounts.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }),
      db.bankAccounts.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: { accountTitle: 'asc' }, select: { id: true, accountTitle: true } }),
      db.banks.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }),
      db.commissionSlabs.findMany({ where: { tenantId, deletedAt: null }, orderBy: { fromPct: 'asc' } }),
      db.lookups.findMany({ where: { lookupType: { in: Object.values(LOOKUPS) }, tenantId: null, isActive: true }, orderBy: { sortOrder: 'asc' }, select: { lookupType: true, code: true, label: true } }),
    ]);
    return {
      routes: routes.map((r) => ({ id: r.id, code: r.code, name: r.name, branchId: r.branchId, sourceWarehouseId: r.sourceWarehouseId, bookerEmployeeId: r.bookerEmployeeId, salesmanEmployeeId: r.salesmanEmployeeId, driverEmployeeId: r.driverEmployeeId, vehicleId: r.vehicleId })),
      vans: vans.map((v) => ({ id: v.id, regNo: v.regNo, capacityCtn: num(v.capacityCtn), capacityKg: num(v.capacityKg), driverEmployeeId: v.defaultDriverEmployeeId })),
      employees: emps.map((e) => ({ id: e.id, code: e.code, name: e.displayName || `${e.firstName} ${e.lastName ?? ''}`.trim(), isBooker: e.isBooker, isSalesman: e.isSalesman, isDeliveryman: e.isDeliveryman, userId: e.appUserId })),
      warehouses: whs, branches, cashAccounts: cash, bankAccounts: banksAcc.map((b) => ({ id: b.id, title: b.accountTitle })), banks,
      commissionSlabs: slabs.filter((s) => day(s.effectiveFrom)! <= today() && (!s.effectiveTo || day(s.effectiveTo)! >= today())).map((s) => ({ id: s.id, label: s.label, fromPct: num(s.fromPct), toPct: s.toPct === null ? 1_000_000 : num(s.toPct), ratePct: num(s.ratePct) })),
      lookups: Object.fromEntries(Object.entries(LOOKUPS).map(([k, t]) => [k, lookups.filter((l) => l.lookupType === t).map((l) => ({ code: l.code, label: l.label }))])) as DistributionOpsOptions['lookups'],
    };
  }

  async employeeOfUser(tenantId: string, userId: string) {
    return (await this.prisma.db().employees.findFirst({ where: { tenantId, appUserId: userId, deletedAt: null }, select: { id: true } }))?.id ?? null;
  }

  // ---------------------------------------------------------------- load sheets
  async candidates(tenantId: string, routeId: string, date: string): Promise<LoadCandidate[]> {
    const db = this.prisma.db();
    const from = new Date(dt(date).getTime() - 14 * 86_400_000);
    const busy = await db.$queryRaw<{ id: string }[]>`
      select li."invoiceId"::text as id from "Distribution"."LoadSheetInvoices" li
        join "Distribution"."LoadSheets" s on s."tenantId" = li."tenantId" and s.id = li."deliveryRunId"
       where li."tenantId" = ${tenantId}::uuid and li."releasedAt" is null and s.status not in ('CANCELLED', 'SETTLED')`;
    const inv = await db.salesInvoices.findMany({
      where: { tenantId, routeId, status: { in: ['POSTED', 'PARTIALLY_PAID'] }, docDate: { gte: from, lte: dt(date) }, id: { notIn: busy.map((b) => b.id) } },
      orderBy: [{ docDate: 'asc' }, { docNo: 'asc' }], take: 300,
    });
    const [customers, lines, stops] = await Promise.all([
      this.customers(db, tenantId, inv.map((i) => i.customerId)),
      db.salesInvoiceLines.findMany({ where: { tenantId, invoiceId: { in: inv.map((i) => i.id) }, itemId: { not: null } }, select: { invoiceId: true, baseQty: true, bonusQty: true, ctnFactor: true } }),
      db.shopRouteProfiles.findMany({ where: { tenantId, routeId, customerId: { in: inv.map((i) => i.customerId) } }, select: { customerId: true, visitSeq: true } }),
    ]);
    return inv.map((i) => {
      const ls = lines.filter((l) => l.invoiceId === i.id);
      return {
        id: i.id, docNo: i.docNo, docDate: day(i.docDate)!, customer: ref(customers, i.customerId), netAmount: num(i.netAmount), balanceAmount: num(i.balanceAmount), lineCount: ls.length,
        ctnEquiv: r2(ls.reduce((s, l) => s + (num(l.baseQty) + num(l.bonusQty)) / (num(l.ctnFactor) || 1), 0)), stopSeq: stops.find((s) => s.customerId === i.customerId)?.visitSeq ?? null,
      };
    });
  }

  async invoiceFacts(tenantId: string, invoiceIds: string[]): Promise<InvoiceFacts[]> {
    const db = this.prisma.db();
    const inv = await db.salesInvoices.findMany({ where: { tenantId, id: { in: invoiceIds } } });
    const [customers, lines] = await Promise.all([
      this.customers(db, tenantId, inv.map((i) => i.customerId)),
      db.salesInvoiceLines.findMany({ where: { tenantId, invoiceId: { in: invoiceIds }, itemId: { not: null } }, orderBy: { lineNo: 'asc' } }),
    ]);
    return inv.map((i) => ({
      id: i.id, docNo: i.docNo, docDate: day(i.docDate)!, status: i.status, routeId: i.routeId, customerId: i.customerId, customerName: ref(customers, i.customerId).name,
      branchId: i.branchId, warehouseId: i.warehouseId, netAmount: num(i.netAmount), balanceAmount: num(i.balanceAmount), salesmanEmployeeId: i.salesmanEmployeeId,
      lines: lines.filter((l) => l.invoiceId === i.id).map((l) => {
        const q = num(l.baseQty);
        return {
          id: l.id, itemId: l.itemId!, batchId: l.batchId, qty: q + num(l.bonusQty), rate: num(l.rate), netRate: q > 0 ? r2(num(l.totalAmount) / q) : 0, taxRate: num(l.taxRate),
          discountPct: num(l.discountPct), ctn: num(l.ctnFactor) || 1, value: num(l.totalAmount),
        };
      }),
    }));
  }

  async listLoadSheets(tenantId: string, q: DistributionQuery): Promise<LoadSheetList> {
    const db = this.prisma.db();
    const base: Prisma.LoadSheetsWhereInput = {
      tenantId, ...(q.route && { routeId: q.route }), ...((q.from || q.to) && { docDate: { ...(q.from && { gte: dt(q.from) }), ...(q.to && { lte: dt(q.to) }) } }),
      ...(q.search && { OR: [{ docNo: { contains: q.search, mode: 'insensitive' } }, { gatePassNo: { contains: q.search, mode: 'insensitive' } }] }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, groups] = await Promise.all([
      db.loadSheets.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.loadSheets.count({ where }),
      db.loadSheets.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    return { items: await this.lsHeaders(db, tenantId, rows), total, counts: count(groups) };
  }

  private async lsHeaders(db: Db, tenantId: string, rows: Prisma.LoadSheetsGetPayload<object>[]) {
    const [routes, vans, emps, whs, branches, settlements, users] = await Promise.all([
      this.routes(db, tenantId, rows.map((r) => r.routeId)),
      db.vans.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.vehicleId)) } }, select: { id: true, regNo: true } }),
      this.employees(db, tenantId, rows.flatMap((r) => [r.driverEmployeeId, r.salesmanEmployeeId])),
      db.warehouses.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.sourceWarehouseId)) } }, select: { id: true, code: true, name: true } }),
      db.branches.findMany({ where: { tenantId }, select: { id: true, code: true, name: true } }),
      db.routeSettlements.findMany({ where: { tenantId, deliveryRunId: { in: rows.map((r) => r.id) } }, select: { id: true, docNo: true, status: true, deliveryRunId: true } }),
      userRefs(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    return rows.map((r) => {
      const st = settlements.find((s) => s.deliveryRunId === r.id);
      return {
        id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, route: ref(routes, r.routeId), branch: find(branches, r.branchId), vehicle: find(vans, r.vehicleId) ?? { id: r.vehicleId, regNo: '?' },
        driver: this.who(emps, r.driverEmployeeId), salesman: this.who(emps, r.salesmanEmployeeId), sourceWarehouse: ref(whs, r.sourceWarehouseId),
        departureTime: r.departureTime instanceof Date ? r.departureTime.toISOString().slice(11, 16) : String(r.departureTime).slice(0, 5),
        gatePassNo: r.gatePassNo, sealNo: r.sealNo, returnableCrates: r.returnableCrates ?? 0, invoiceCount: r.invoiceCount ?? 0, shopCount: r.shopCount ?? 0, skuCount: r.skuCount ?? 0,
        totalCtnEquiv: num(r.totalCtnEquiv), totalPcs: num(r.totalPcs), totalValue: num(r.totalValue), capacityCtn: num(r.capacityCtn), capacityCtnPct: num(r.capacityCtnPct),
        status: r.status, dispatchedAt: iso(r.dispatchedAt), cancelledAt: iso(r.cancelledAt), remarks: r.remarks, settlement: st ? { id: st.id, docNo: st.docNo, status: st.status } : null,
        createdBy: r.createdBy ? users.get(r.createdBy) ?? null : null, createdAt: iso(r.createdAt)!, rowVersion: r.rowVersion,
      };
    });
  }

  async getLoadSheet(tenantId: string, id: string): Promise<LoadSheet | null> {
    const db = this.prisma.db();
    const r = await db.loadSheets.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [[h], invs, lines, setl] = await Promise.all([
      this.lsHeaders(db, tenantId, [r]),
      db.loadSheetInvoices.findMany({ where: { tenantId, deliveryRunId: id }, orderBy: [{ stopSeq: 'asc' }, { createdAt: 'asc' }] }),
      db.loadSheetLines.findMany({ where: { tenantId, deliveryRunId: id }, orderBy: { shelfCode: 'asc' } }),
      db.routeSettlements.findFirst({ where: { tenantId, deliveryRunId: id }, select: { id: true } }),
    ]);
    const [invoices, customers, items, slines] = await Promise.all([
      db.salesInvoices.findMany({ where: { tenantId, id: { in: invs.map((i) => i.invoiceId) } }, select: { id: true, docNo: true } }),
      this.customers(db, tenantId, invs.map((i) => i.customerId)),
      db.products.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.itemId)) } }, select: { id: true, sku: true, name: true } }),
      setl ? db.routeSettlementLines.findMany({ where: { tenantId, runSettlementId: setl.id }, select: { invoiceId: true, deliveryState: true } }) : Promise.resolve([]),
    ]);
    const inv = this.docNos(invoices);
    return {
      ...h!,
      invoices: invs.map((i) => ({
        id: i.id, invoice: inv(i.invoiceId) ?? { id: i.invoiceId, docNo: '?' }, customer: ref(customers, i.customerId), stopSeq: i.stopSeq, lineCount: i.lineCount ?? 0,
        ctnEquiv: num(i.ctnEquiv), amount: num(i.invoiceAmount), released: !!i.releasedAt, deliveryState: slines.find((s) => s.invoiceId === i.invoiceId)?.deliveryState ?? null,
      })),
      lines: lines.map((l) => ({ id: l.id, item: find(items, l.itemId) ?? { id: l.itemId, sku: '?', name: '?' }, qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose), baseQty: num(l.baseQty), ctnEquiv: num(l.ctnEquiv), value: num(l.valueAmount), isPicked: l.isPicked })),
    };
  }

  // ---------------------------------------------------------------- route settlements
  async listSettlements(tenantId: string, q: DistributionQuery): Promise<RouteSettlementList> {
    const db = this.prisma.db();
    const base: Prisma.RouteSettlementsWhereInput = { tenantId, ...(q.search && { docNo: { contains: q.search, mode: 'insensitive' } }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, groups] = await Promise.all([
      db.routeSettlements.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.routeSettlements.count({ where }),
      db.routeSettlements.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    return { items: await this.rsHeaders(db, tenantId, rows), total, counts: count(groups) };
  }

  private async rsHeaders(db: Db, tenantId: string, rows: Prisma.RouteSettlementsGetPayload<object>[]) {
    const sheets = await db.loadSheets.findMany({ where: { tenantId, id: { in: rows.map((r) => r.deliveryRunId) } }, select: { id: true, docNo: true, routeId: true, vehicleId: true, salesmanEmployeeId: true } });
    const [routes, vans, emps, cash, vouchers, users] = await Promise.all([
      this.routes(db, tenantId, sheets.map((s) => s.routeId)),
      db.vans.findMany({ where: { tenantId, id: { in: ids(sheets.map((s) => s.vehicleId)) } }, select: { id: true, regNo: true } }),
      this.employees(db, tenantId, rows.map((r) => r.salesmanEmployeeId)),
      db.cashAccounts.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.cashAccountId)) } }, select: { id: true, code: true, name: true } }),
      voucherRefs(db, tenantId, rows.map((r) => r.journalEntryId)), userRefs(db, tenantId, rows.map((r) => r.postedByUserId)),
    ]);
    return rows.map((r) => {
      const s = sheets.find((x) => x.id === r.deliveryRunId);
      return {
        id: r.id, docNo: r.docNo, docDate: day(r.docDate)!,
        loadSheet: { id: r.deliveryRunId, docNo: s?.docNo ?? '?', route: ref(routes, s?.routeId ?? ''), vehicle: find(vans, s?.vehicleId)?.regNo ?? '?' },
        salesman: this.who(emps, r.salesmanEmployeeId), cashAccount: find(cash, r.cashAccountId), invoiceTotal: num(r.invoiceTotal), returnTotal: num(r.returnTotal),
        cashExpected: num(r.cashExpected), cashCounted: num(r.cashCounted), cashShortAmount: num(r.cashShortAmount), cashOverAmount: num(r.cashOverAmount), chequeTotal: num(r.chequeTotal),
        creditTotal: num(r.creditTotal), status: r.status, journal: r.journalEntryId ? vouchers.get(r.journalEntryId) ?? null : null, postedAt: iso(r.postedAt),
        postedBy: r.postedByUserId ? users.get(r.postedByUserId) ?? null : null, remarks: r.remarks, rowVersion: r.rowVersion,
      };
    });
  }

  async getSettlement(tenantId: string, id: string): Promise<RouteSettlement | null> {
    const db = this.prisma.db();
    const r = await db.routeSettlements.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [[h], lines, cheques, returns, counts] = await Promise.all([
      this.rsHeaders(db, tenantId, [r]),
      db.routeSettlementLines.findMany({ where: { tenantId, runSettlementId: id }, orderBy: { lineNo: 'asc' } }),
      db.routeSettlementCheques.findMany({ where: { tenantId, runSettlementId: id } }),
      db.routeSettlementReturns.findMany({ where: { tenantId, runSettlementId: id } }),
      db.routeSettlementCashCounts.findMany({ where: { tenantId, runSettlementId: id }, orderBy: { denomination: 'desc' } }),
    ]);
    const facts = await this.invoiceFacts(tenantId, lines.map((l) => l.invoiceId));
    const [customers, receipts, srs, items] = await Promise.all([
      this.customers(db, tenantId, lines.map((l) => l.customerId)),
      db.customerReceipts.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.receiptId)) } }, select: { id: true, docNo: true } }),
      db.salesReturns.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.salesReturnId)) } }, select: { id: true, docNo: true } }),
      db.products.findMany({ where: { tenantId, id: { in: ids(facts.flatMap((f) => f.lines.map((l) => l.itemId))) } }, select: { id: true, sku: true, name: true } }),
    ]);
    const rc = this.docNos(receipts);
    const sr = this.docNos(srs);
    const item = (id: string) => find(items, id) ?? { id, sku: '?', name: '?' };
    return {
      ...h!,
      denominations: counts.map((c) => ({ denomination: Number(c.denomination), noteCount: c.noteCount ?? 0, amount: num(c.amount) })),
      lines: lines.map((l) => {
        const f = facts.find((x) => x.id === l.invoiceId);
        return {
          id: l.id, lineNo: l.lineNo, invoice: { id: l.invoiceId, docNo: f?.docNo ?? '?' }, customer: ref(customers, l.customerId), invoiceAmount: num(l.invoiceAmount),
          balanceAmount: f?.balanceAmount ?? 0, deliveryState: l.deliveryState, nonDeliveryReason: l.nonDeliveryReason, cashAmount: num(l.cashAmount), chequeAmount: num(l.chequeAmount),
          returnAmount: num(l.returnAmount), creditAmount: num(l.creditAmount), receipt: rc(l.receiptId), salesReturn: sr(l.salesReturnId),
          cheques: cheques.filter((c) => c.settlementLineId === l.id).map((c) => ({ id: c.id, chequeNo: c.chequeNo, bankId: c.bankId, bankName: c.bankName, chequeDate: day(c.chequeDate)!, amount: num(c.amount), chequeId: c.chequeId })),
          returns: returns.filter((x) => x.settlementLineId === l.id).map((x) => ({ id: x.id, invoiceLineId: x.invoiceLineId, item: item(x.itemId), suppliedQty: num(x.suppliedQty), returnQty: num(x.returnQty), unitPrice: num(x.unitPrice), returnValue: num(x.returnValue), reason: x.reason })),
          invoiceLines: (f?.lines ?? []).map((x) => ({ id: x.id, item: item(x.itemId), qty: x.qty, rate: x.rate, netRate: x.netRate })),
        };
      }),
    };
  }

  async writeSettlement(tenantId: string, id: string, d: SettlementDetail) {
    const db = this.prisma.db();
    const where = { tenantId, runSettlementId: id };
    await db.routeSettlementCheques.deleteMany({ where });
    await db.routeSettlementReturns.deleteMany({ where });
    await db.routeSettlementCashCounts.deleteMany({ where });
    for (const l of d.lines) {
      await db.routeSettlementLines.updateMany({
        where: { tenantId, id: l.id, runSettlementId: id },
        data: { deliveryState: l.deliveryState, nonDeliveryReason: l.nonDeliveryReason, cashAmount: l.cashAmount, chequeAmount: l.chequeAmount, returnAmount: l.returnAmount, creditAmount: l.creditAmount },
      });
      if (l.cheques.length) await db.routeSettlementCheques.createMany({ data: l.cheques.map((c) => ({ tenantId, runSettlementId: id, settlementLineId: l.id, chequeNo: c.chequeNo, bankId: c.bankId, bankName: c.bankName, chequeDate: dt(c.chequeDate), amount: c.amount })) });
      if (l.returns.length) await db.routeSettlementReturns.createMany({ data: l.returns.map((x) => ({ tenantId, runSettlementId: id, settlementLineId: l.id, invoiceLineId: x.invoiceLineId, itemId: x.itemId, batchId: x.batchId, suppliedQty: x.suppliedQty, returnQty: x.returnQty, unitPrice: x.unitPrice, unitCost: x.unitCost, reason: x.reason })) });
    }
    if (d.cashCounts.length) await db.routeSettlementCashCounts.createMany({ data: d.cashCounts.map((c) => ({ tenantId, runSettlementId: id, denomination: c.denomination, noteCount: c.noteCount })) });
  }

  async deleteSettlement(tenantId: string, id: string) {
    const db = this.prisma.db();
    const where = { tenantId, runSettlementId: id };
    await db.routeSettlementCheques.deleteMany({ where });
    await db.routeSettlementReturns.deleteMany({ where });
    await db.routeSettlementCashCounts.deleteMany({ where });
    await db.routeSettlementLines.deleteMany({ where });
    await db.routeSettlements.deleteMany({ where: { tenantId, id, status: 'OPEN' } });
  }

  async setSettlementLine(tenantId: string, lineId: string, data: Record<string, unknown>) {
    await this.prisma.db().routeSettlementLines.updateMany({ where: { tenantId, id: lineId }, data });
  }

  async setSettlementCheque(tenantId: string, settlementLineId: string, chequeNo: string, chequeId: string) {
    await this.prisma.db().routeSettlementCheques.updateMany({ where: { tenantId, settlementLineId, chequeNo }, data: { chequeId } });
  }

  // ---------------------------------------------------------------- recovery sheets
  async listRecovery(tenantId: string, q: DistributionQuery): Promise<RecoverySheetList> {
    const db = this.prisma.db();
    const base: Prisma.RecoverySheetsWhereInput = { tenantId, ...(q.route && { routeId: q.route }), ...(q.search && { docNo: { contains: q.search, mode: 'insensitive' } }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, groups] = await Promise.all([
      db.recoverySheets.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.recoverySheets.count({ where }),
      db.recoverySheets.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    return { items: await this.rcvHeaders(db, tenantId, rows), total, counts: count(groups) };
  }

  private async rcvHeaders(db: Db, tenantId: string, rows: Prisma.RecoverySheetsGetPayload<object>[]) {
    const [routes, emps, users] = await Promise.all([
      this.routes(db, tenantId, rows.map((r) => r.routeId)), this.employees(db, tenantId, rows.map((r) => r.salesmanEmployeeId)), userRefs(db, tenantId, rows.map((r) => r.createdBy)),
    ]);
    return rows.map((r) => ({
      id: r.id, docNo: r.docNo, docDate: day(r.docDate)!, route: find(routes, r.routeId), salesman: this.who(emps, r.salesmanEmployeeId), shopCount: r.shopCount ?? 0,
      targetAmount: num(r.targetAmount), outstandingTotal: num(r.outstandingTotal), collectedTotal: num(r.collectedTotal), postedTotal: num(r.postedTotal), status: r.status,
      createdBy: r.createdBy ? users.get(r.createdBy) ?? null : null, createdAt: iso(r.createdAt)!, rowVersion: r.rowVersion,
    }));
  }

  async getRecovery(tenantId: string, id: string): Promise<RecoverySheet | null> {
    const db = this.prisma.db();
    const r = await db.recoverySheets.findFirst({ where: { tenantId, id } });
    if (!r) return null;
    const [[h], lines] = await Promise.all([this.rcvHeaders(db, tenantId, [r]), db.recoverySheetLines.findMany({ where: { tenantId, recoverySheetId: id }, orderBy: { lineNo: 'asc' } })]);
    const [customers, receipts, cheques] = await Promise.all([
      this.customers(db, tenantId, lines.map((l) => l.customerId)),
      db.customerReceipts.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.receiptId)) } }, select: { id: true, docNo: true } }),
      db.cheques.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.chequeId)) } }, select: { id: true, docNo: true } }),
    ]);
    const rc = this.docNos(receipts);
    const cq = this.docNos(cheques);
    return {
      ...h!,
      lines: lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, customer: ref(customers, l.customerId), outstandingAmount: num(l.outstandingAmount), age030: num(l.age030), age3160: num(l.age3160),
        age6190: num(l.age6190), age90Plus: num(l.age90Plus), creditLimit: num(l.creditLimit), lastPaymentDate: day(l.lastPaymentDate), lastPaymentAmount: num(l.lastPaymentAmount),
        targetAmount: num(l.targetAmount), collectedAmount: num(l.collectedAmount), mode: l.mode, remarks: l.remarks, depositBankAccountId: l.depositBankAccountId,
        promiseToPayDate: day(l.promiseToPayDate), status: l.status, receipt: rc(l.receiptId), cheque: cq(l.chequeId),
      })),
    };
  }

  async recoveryCandidates(tenantId: string, routeId: string, asOf: string): Promise<RecoveryCandidate[]> {
    const db = this.prisma.db();
    const shops = await db.shopRouteProfiles.findMany({ where: { tenantId, routeId, isActive: true }, orderBy: { visitSeq: 'asc' }, select: { customerId: true, recoveryTargetAmount: true } });
    if (!shops.length) return [];
    const rows = await db.$queryRaw<{ customerId: string; b0: string; b1: string; b2: string; b3: string; b4: string; total: string }[]>`
      select "customerId"::text as "customerId", "bucketCurrent"::text as b0, bucket130::text as b1, bucket3160::text as b2, bucket6190::text as b3, "bucket90Plus"::text as b4, total::text as total
        from "Sales"."getReceivablesAgeingAsOf"(${asOf}::date, 'DUE') where "tenantId" = ${tenantId}::uuid and total > 0`;
    const [customers, lastPay] = await Promise.all([
      db.customers.findMany({ where: { tenantId, id: { in: shops.map((s) => s.customerId) } }, select: { id: true, creditLimit: true } }),
      db.customerReceipts.findMany({ where: { tenantId, customerId: { in: shops.map((s) => s.customerId) }, status: { notIn: ['VOID', 'BOUNCED'] } }, orderBy: { docDate: 'desc' }, select: { customerId: true, docDate: true, amountReceived: true } }),
    ]);
    return shops.flatMap((s) => {
      const a = rows.find((r) => r.customerId === s.customerId);
      if (!a) return [];
      const lp = lastPay.find((p) => p.customerId === s.customerId);
      const out = Number(a.total);
      return [{
        customerId: s.customerId, outstanding: out, age030: r2(Number(a.b0) + Number(a.b1)), age3160: Number(a.b2), age6190: Number(a.b3), age90Plus: Number(a.b4),
        creditLimit: num(customers.find((c) => c.id === s.customerId)?.creditLimit), target: Math.min(out, num(s.recoveryTargetAmount) || out),
        lastPaymentDate: lp ? day(lp.docDate) : null, lastPaymentAmount: lp ? num(lp.amountReceived) : 0,
      }];
    });
  }

  // ---------------------------------------------------------------- targets & commissions
  async targets(tenantId: string) {
    const db = this.prisma.db();
    const [ts, cs] = await Promise.all([
      db.salesmanTargets.findMany({ where: { tenantId }, orderBy: [{ periodStart: 'desc' }] , take: 300 }),
      db.salesmanCommissions.findMany({ where: { tenantId }, orderBy: [{ periodStart: 'desc' }], take: 300 }),
    ]);
    return { targets: await this.targetRows(db, tenantId, ts, cs), commissions: await this.commissionRows(db, tenantId, cs) };
  }

  private async targetRows(db: Db, tenantId: string, ts: Prisma.SalesmanTargetsGetPayload<object>[], cs: Prisma.SalesmanCommissionsGetPayload<object>[]): Promise<SalesmanTarget[]> {
    const [emps, routes] = await Promise.all([this.employees(db, tenantId, ts.map((t) => t.employeeId)), this.routes(db, tenantId, ts.map((t) => t.routeId))]);
    return ts.map((t) => {
      const c = cs.find((x) => x.salesTargetId === t.id && x.status !== 'CANCELLED');
      return {
        id: t.id, employee: ref(emps, t.employeeId), role: t.role, route: find(routes, t.routeId), periodStart: day(t.periodStart)!, periodEnd: day(t.periodEnd)!,
        targetAmount: num(t.targetAmount), achievedAmount: num(t.achievedAmount), achievementPct: num(t.achievementPct), status: t.status,
        commission: c ? { id: c.id, status: c.status, amount: num(c.commissionAmount) } : null, rowVersion: t.rowVersion,
      };
    });
  }

  private async commissionRows(db: Db, tenantId: string, cs: Prisma.SalesmanCommissionsGetPayload<object>[]): Promise<SalesmanCommission[]> {
    const [emps, ts, slabs, vouchers, users, adj] = await Promise.all([
      this.employees(db, tenantId, cs.map((c) => c.employeeId)),
      db.salesmanTargets.findMany({ where: { tenantId, id: { in: cs.map((c) => c.salesTargetId) } }, select: { id: true, role: true } }),
      db.commissionSlabs.findMany({ where: { tenantId, id: { in: cs.map((c) => c.commissionSlabId) } }, select: { id: true, label: true } }),
      voucherRefs(db, tenantId, cs.map((c) => c.journalEntryId)), userRefs(db, tenantId, cs.map((c) => c.approvedByUserId)),
      db.payrollAdjustments.findMany({ where: { tenantId, sourceDocType: 'SCM', sourceDocId: { in: cs.map((c) => c.id) } }, orderBy: { createdAt: 'desc' }, select: { sourceDocId: true, payrollRunId: true } }),
    ]);
    const runs = await db.payrollRuns.findMany({ where: { tenantId, id: { in: adj.map((a) => a.payrollRunId) }, status: { not: 'CANCELLED' } }, select: { id: true, docNo: true } });
    return cs.map((c) => {
      const a = adj.find((x) => x.sourceDocId === c.id && runs.some((r) => r.id === x.payrollRunId));
      return {
        id: c.id, employee: ref(emps, c.employeeId), target: { id: c.salesTargetId, role: find(ts, c.salesTargetId)?.role ?? '?' }, periodStart: day(c.periodStart)!, periodEnd: day(c.periodEnd)!,
        targetAmount: num(c.targetAmount), achievedAmount: num(c.achievedAmount), achievementPct: num(c.achievementPct), slab: find(slabs, c.commissionSlabId), ratePct: num(c.ratePct),
        commissionAmount: num(c.commissionAmount), status: c.status, approvedBy: c.approvedByUserId ? users.get(c.approvedByUserId) ?? null : null, approvedAt: iso(c.approvedAt),
        journal: c.journalEntryId ? vouchers.get(c.journalEntryId) ?? null : null, payrollRun: a ? this.docNos(runs)(a.payrollRunId) : null, rowVersion: c.rowVersion,
      };
    });
  }

  async getTarget(tenantId: string, id: string) {
    const db = this.prisma.db();
    const t = await db.salesmanTargets.findFirst({ where: { tenantId, id } });
    if (!t) return null;
    const cs = await db.salesmanCommissions.findMany({ where: { tenantId, salesTargetId: id } });
    return (await this.targetRows(db, tenantId, [t], cs))[0]!;
  }

  async getCommission(tenantId: string, id: string) {
    const db = this.prisma.db();
    const c = await db.salesmanCommissions.findFirst({ where: { tenantId, id } });
    return c ? (await this.commissionRows(db, tenantId, [c]))[0]! : null;
  }

  async achievement(tenantId: string, employeeId: string, role: string, from: string, to: string, routeId: string | null) {
    const col = role === 'BOOKER' ? 'bookerEmployeeId' : 'salesmanEmployeeId';
    const rows = await this.prisma.db().$queryRawUnsafe<{ v: string | null }[]>(
      `select (coalesce(sum(i."netAmount"), 0) - coalesce((select sum(c."totalAmount") from "Sales"."CreditNotes" c
                where c."tenantId" = $1::uuid and c.status in ('OPEN', 'APPLIED') and c."invoiceId" in (
                  select i2.id from "Sales"."SalesInvoices" i2 where i2."tenantId" = $1::uuid and i2."${col}" = $2::uuid
                     and i2.status in ('POSTED', 'PARTIALLY_PAID', 'PAID') and i2."docDate" between $3::date and $4::date and ($5::uuid is null or i2."routeId" = $5::uuid))), 0))::text as v
         from "Sales"."SalesInvoices" i
        where i."tenantId" = $1::uuid and i."${col}" = $2::uuid and i.status in ('POSTED', 'PARTIALLY_PAID', 'PAID')
          and i."docDate" between $3::date and $4::date and ($5::uuid is null or i."routeId" = $5::uuid)`,
      tenantId, employeeId, from, to, routeId,
    );
    return r2(Number(rows[0]?.v ?? 0));
  }

  async draftPayrollRun(tenantId: string, month: string) {
    const r = await this.prisma.db().payrollRuns.findFirst({ where: { tenantId, status: { in: ['DRAFT', 'REVIEW'] }, payrollMonth: dt(`${month.slice(0, 7)}-01`) }, orderBy: { createdAt: 'desc' }, select: { id: true, docNo: true } });
    return r;
  }

  async commissionComponentId(tenantId: string) {
    return (await this.prisma.db().salaryComponents.findFirst({ where: { tenantId, systemRole: 'COMMISSION', deletedAt: null }, select: { id: true } }))?.id ?? null;
  }

  async payrollAdjustmentFor(tenantId: string, commissionId: string) {
    const db = this.prisma.db();
    const a = await db.payrollAdjustments.findFirst({ where: { tenantId, sourceDocType: 'SCM', sourceDocId: commissionId }, select: { payrollRunId: true } });
    if (!a) return null;
    return db.payrollRuns.findFirst({ where: { tenantId, id: a.payrollRunId, status: { not: 'CANCELLED' } }, select: { id: true, docNo: true } });
  }

  async addPayrollAdjustment(tenantId: string, row: { payrollRunId: string; employeeId: string; componentId: string; amount: number; remarks: string; sourceDocId: string }) {
    await this.prisma.db().payrollAdjustments.create({
      data: { tenantId, payrollRunId: row.payrollRunId, employeeId: row.employeeId, componentId: row.componentId, inputSource: 'MANUAL', amount: row.amount, isTaxable: true, remarks: row.remarks, sourceDocType: 'SCM', sourceDocId: row.sourceDocId },
    });
    // the run must be recalculated, and a stale "Inputs" save of it now gets a 409 instead of dropping this row
    await this.prisma.db().payrollRuns.updateMany({ where: { tenantId, id: row.payrollRunId, status: { in: ['DRAFT', 'REVIEW'] } }, data: { calculatedAt: null, status: 'DRAFT' } });
  }

  // ---------------------------------------------------------------- credit control
  async creditControl(tenantId: string): Promise<CreditControl> {
    const db = this.prisma.db();
    const [ageing, custs, overrides, events] = await Promise.all([
      db.$queryRaw<{ customerId: string; total: string; overdue: string; maxDays: number | null }[]>`
        select "customerId"::text as "customerId", total::text as total, (bucket130 + bucket3160 + bucket6190 + "bucket90Plus")::text as overdue, "daysByDue"::int as "maxDays"
          from "Sales"."getReceivablesAgeingAsOf"(current_date, 'DUE') where "tenantId" = ${tenantId}::uuid`,
      db.customers.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, city: true, status: true, holdReason: true, onHoldSince: true, creditLimit: true } }),
      db.creditOverrides.findMany({ where: { tenantId }, orderBy: { requestedAt: 'desc' }, take: 100 }),
      db.creditHoldEvents.findMany({ where: { tenantId }, orderBy: { occurredAt: 'desc' }, take: 50 }),
    ]);
    const rows = custs.map((c) => {
      const a = ageing.find((x) => x.customerId === c.id);
      const bal = a ? Number(a.total) : 0;
      const lim = num(c.creditLimit);
      return {
        customer: { id: c.id, code: c.code, name: c.name, city: c.city }, status: c.status, holdReason: c.holdReason, onHoldSince: iso(c.onHoldSince), creditLimit: lim, balance: bal,
        overdue: a ? Number(a.overdue) : 0, usedPct: lim > 0 ? Math.round((bal / lim) * 1000) / 10 : null, overLimit: lim > 0 && bal > lim, maxDaysOverdue: a?.maxDays ?? null,
      };
    }).filter((r) => r.balance !== 0 || r.status === 'ON_HOLD' || r.creditLimit > 0);
    const evCust = await this.customers(db, tenantId, events.map((e) => e.customerId));
    const evUsers = await userRefs(db, tenantId, events.map((e) => e.userId));
    return {
      kpis: {
        onHold: rows.filter((r) => r.status === 'ON_HOLD').length, overLimit: rows.filter((r) => r.overLimit).length,
        overdueAmount: r2(rows.reduce((s, r) => s + r.overdue, 0)), pendingOverrides: overrides.filter((o) => o.status === 'PENDING').length,
      },
      customers: rows.sort((a, b) => b.balance - a.balance),
      overrides: await this.overrideRows(db, tenantId, overrides),
      events: events.map((e) => ({ id: e.id, customer: ref(evCust, e.customerId), eventType: e.eventType, reason: e.reason, source: e.source, occurredAt: iso(e.occurredAt)!, user: e.userId ? evUsers.get(e.userId) ?? null : null, notes: e.notes })),
    };
  }

  private async overrideRows(db: Db, tenantId: string, rows: Prisma.CreditOverridesGetPayload<object>[]): Promise<CreditOverride[]> {
    const [customers, invoices, users] = await Promise.all([
      this.customers(db, tenantId, rows.map((o) => o.customerId)),
      db.salesInvoices.findMany({ where: { tenantId, id: { in: ids(rows.map((o) => o.invoiceId)) } }, select: { id: true, docNo: true } }),
      userRefs(db, tenantId, rows.flatMap((o) => [o.requestedByUserId, o.decidedByUserId])),
    ]);
    const inv = this.docNos(invoices);
    return rows.map((o) => ({
      id: o.id, docNo: o.docNo, customer: ref(customers, o.customerId), overrideType: o.overrideType, invoice: inv(o.invoiceId), documentAmount: num(o.documentAmount),
      creditLimit: num(o.creditLimitSnapshot), balance: num(o.balanceSnapshot), exceedBy: num(o.exceedByAmount), tempLimitAmount: o.tempLimitAmount === null ? null : num(o.tempLimitAmount),
      validUntil: day(o.validUntil), requestReason: o.requestReason ?? '', status: o.status, requestedBy: o.requestedByUserId ? users.get(o.requestedByUserId) ?? null : null,
      requestedAt: iso(o.requestedAt)!, decidedBy: o.decidedByUserId ? users.get(o.decidedByUserId) ?? null : null, decidedAt: iso(o.decidedAt), conditionComments: o.conditionComments, rowVersion: o.rowVersion,
    }));
  }

  async customerCredit(tenantId: string, customerId: string): Promise<CustomerCreditFacts | null> {
    const db = this.prisma.db();
    const c = await db.customers.findFirst({ where: { tenantId, id: customerId }, select: { id: true, name: true, status: true, creditLimit: true } });
    if (!c) return null;
    const a = await db.$queryRaw<{ total: string; overdue: string; maxDays: number | null }[]>`
      select total::text as total, (bucket130 + bucket3160 + bucket6190 + "bucket90Plus")::text as overdue, "daysByDue"::int as "maxDays"
        from "Sales"."getReceivablesAgeingAsOf"(current_date, 'DUE') where "tenantId" = ${tenantId}::uuid and "customerId" = ${customerId}::uuid`;
    return { id: c.id, name: c.name, status: c.status, creditLimit: num(c.creditLimit), balance: a[0] ? Number(a[0].total) : 0, overdue: a[0] ? Number(a[0].overdue) : 0, maxDaysOverdue: a[0]?.maxDays ?? null };
  }

  async getOverride(tenantId: string, id: string) {
    const db = this.prisma.db();
    const o = await db.creditOverrides.findFirst({ where: { tenantId, id } });
    return o ? (await this.overrideRows(db, tenantId, [o]))[0]! : null;
  }

  async setHold(tenantId: string, customerId: string, hold: boolean, reason: string, source: string, userId: string | null, notes: string | null, overrideId: string | null = null) {
    const db = this.prisma.db();
    const c = await db.customers.findFirst({ where: { tenantId, id: customerId }, select: { creditLimit: true } });
    await db.customers.updateMany({
      where: { tenantId, id: customerId },
      data: hold ? { status: 'ON_HOLD', holdReason: reason, onHoldSince: new Date() } : { status: 'ACTIVE', holdReason: null, onHoldSince: null },
    });
    await db.creditHoldEvents.create({
      data: { tenantId, customerId, eventType: hold ? 'HOLD' : 'RELEASE', reason, source, occurredAt: new Date(), userId, creditOverrideId: overrideId, exposureAmount: num(c?.creditLimit), notes },
    });
  }

  async logOverride(tenantId: string, row: Record<string, unknown>) {
    await this.prisma.db().creditOverrideLogs.create({ data: { tenantId, ...(row as object) } as Prisma.CreditOverrideLogsUncheckedCreateInput });
  }

  async resolveOverrideLog(tenantId: string, overrideId: string, outcome: string, approverUserId: string | null) {
    await this.prisma.db().creditOverrideLogs.updateMany({ where: { tenantId, creditOverrideId: overrideId, outcome: 'PENDING' }, data: { outcome, approvedByUserId: approverUserId, resolvedAt: new Date() } });
  }

  async setInvoiceOverride(tenantId: string, invoiceId: string, overrideId: string) {
    const r = await this.prisma.db().salesInvoices.updateMany({ where: { tenantId, id: invoiceId, status: 'DRAFT' }, data: { creditOverrideId: overrideId } });
    return r.count > 0;
  }

  // ---------------------------------------------------------------- writes
  async nextNo(docType: string, date: string, branchId: string | null) {
    const r = await this.prisma.db().$queryRaw<{ n: string }[]>`select "Company"."getNextDocNo"(${docType}, ${date}::date, ${branchId}::uuid) as n`;
    return r[0]!.n;
  }

  save(fn: DistSave, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async set(doc: DistDoc, tenantId: string, id: string, data: Record<string, unknown>) {
    const db = this.prisma.db();
    const where = { tenantId, id };
    if (doc === 'loadSheet') await db.loadSheets.updateMany({ where, data });
    else if (doc === 'loadSheetInvoice') await db.loadSheetInvoices.updateMany({ where, data });
    else if (doc === 'settlement') await db.routeSettlements.updateMany({ where, data });
    else if (doc === 'recovery') await db.recoverySheets.updateMany({ where, data });
    else if (doc === 'recoveryLine') await db.recoverySheetLines.updateMany({ where, data });
    else if (doc === 'target') await db.salesmanTargets.updateMany({ where, data });
    else if (doc === 'commission') await db.salesmanCommissions.updateMany({ where, data });
    else await db.creditOverrides.updateMany({ where, data });
  }

  async run(fn: DistLifecycle, id: string, text: string | null = null) {
    const db = this.prisma.db();
    const schema = fn === 'creditOverrideApprove' ? 'Sales' : 'Distribution';
    if (fn === 'loadSheetCancel' || fn === 'creditOverrideApprove') await db.$queryRawUnsafe(`select "${schema}"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "${schema}"."${fn}"($1::uuid)::text`, id);
  }

  async deleteDraft(doc: 'loadSheet' | 'target', tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (doc === 'loadSheet') {
      if (!(await db.loadSheets.count({ where: { tenantId, id, rowVersion, status: 'LOADING' } }))) return false;
      await db.loadSheetLines.deleteMany({ where: { tenantId, deliveryRunId: id } });
      await db.loadSheetInvoices.deleteMany({ where: { tenantId, deliveryRunId: id } });
      await db.loadSheets.deleteMany({ where: { tenantId, id } });
    } else {
      if (!(await db.salesmanTargets.count({ where: { tenantId, id, rowVersion } }))) return false;
      if (await db.salesmanCommissions.count({ where: { tenantId, salesTargetId: id, status: { not: 'CANCELLED' } } })) return false;
      await db.salesmanCommissions.deleteMany({ where: { tenantId, salesTargetId: id } });
      await db.salesmanTargets.deleteMany({ where: { tenantId, id } });
    }
    return true;
  }
}
