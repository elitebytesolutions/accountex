import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type {
  AssemblyList, AssemblyVoucher, BulkPriceUpdate, BulkPriceUpdateList, DemandOptions, GoodsDemand, GoodsDemandList, PrincipalClaim, PrincipalClaimList, PrincipalTarget,
  StockVoucher, StockVoucherList,
} from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { StockDemandStore, type DemandDoc, type DemandLifecycle, type DemandQuery, type DemandSave, type ReorderNeed } from '../application/stock-demand-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };
const TEXT_ARG: DemandLifecycle[] = ['stockVoucherCancel', 'assemblyVoucherCancel', 'goodsDemandCancel', 'principalClaimCancel'];
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };
const page = (q: DemandQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

async function refs(db: Db, tenantId: string, k: { warehouses?: (string | null)[]; products?: (string | null)[]; batches?: (string | null)[]; accounts?: (string | null)[]; costCentres?: (string | null)[]; companies?: (string | null)[]; vendors?: (string | null)[]; classes?: (string | null)[] }) {
  const q = <T,>(xs: (string | null)[] | undefined, f: (i: string[]) => Promise<T[]>) => (xs && ids(xs).length ? f(ids(xs)) : Promise.resolve([] as T[]));
  const [warehouses, products, batches, accounts, costCentres, companies, vendors, classes] = await Promise.all([
    q(k.warehouses, (i) => db.warehouses.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.products, (i) => db.products.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, sku: true, name: true } })),
    q(k.batches, (i) => db.productBatches.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, batchNo: true } })),
    q(k.accounts, (i) => db.chartOfAccounts.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.costCentres, (i) => db.costCentres.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.companies, (i) => db.productCompanies.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.vendors, (i) => db.vendors.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.classes, (i) => db.productClasses.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
  ]);
  const item = (id: string) => find(products, id) ?? { id, sku: '?', name: '?' };
  return { warehouses: warehouses as Ref[], batches, accounts: accounts as Ref[], costCentres: costCentres as Ref[], companies: companies as Ref[], vendors: vendors as Ref[], classes: classes as Ref[], item };
}

@Injectable()
export class PrismaStockDemandStore extends StockDemandStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async options(tenantId: string): Promise<DemandOptions> {
    const db = this.prisma.db();
    const [kits, comps, companies, vendors, branches, roles] = await Promise.all([
      db.kitsAndBundles.findMany({ where: { tenantId, deletedAt: null, status: { not: 'INACTIVE' } }, select: { id: true, code: true, name: true, kitItemId: true }, orderBy: { name: 'asc' } }),
      db.kitComponents.findMany({ where: { tenantId }, select: { kitId: true, itemId: true, qtyPerKit: true }, orderBy: { sortOrder: 'asc' } }),
      db.productCompanies.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.vendors.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }] }),
      db.defaultAccountMappings.findMany({ where: { tenantId, role: { in: ['STOCK_WRITE_OFF', 'STOCK_ADJUSTMENT', 'MARKETING_EXPENSE', 'SAMPLES_EXPENSE'] } }, select: { role: true, accountId: true } }),
    ]);
    const accts = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids(roles.map((r) => r.accountId)) } }, select: { id: true, code: true, name: true } });
    const acct = (role: string) => find(accts, roles.find((r) => r.role === role)?.accountId) ?? null;
    return {
      kits: kits.map((k) => ({ ...k, components: comps.filter((c) => c.kitId === k.id).map((c) => ({ itemId: c.itemId, qtyPerKit: num(c.qtyPerKit) })) })),
      companies, vendors, branches,
      expenseDefaults: { BRK: acct('STOCK_WRITE_OFF'), GFT: acct('MARKETING_EXPENSE') ?? acct('STOCK_ADJUSTMENT'), SMP: acct('SAMPLES_EXPENSE') ?? acct('MARKETING_EXPENSE') ?? acct('STOCK_ADJUSTMENT'), INT: acct('STOCK_ADJUSTMENT') },
    };
  }

  // ---------------------------------------------------------------- stock vouchers
  async listStockVouchers(tenantId: string, q: DemandQuery): Promise<StockVoucherList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.StockVouchersWhereInput = { tenantId, ...(q.type && { voucherType: q.type }), ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { recipientName: { contains: s, mode: 'insensitive' } }, { referenceNo: { contains: s, mode: 'insensitive' } }] }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus, byType] = await Promise.all([
      db.stockVouchers.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.stockVouchers.count({ where }),
      db.stockVouchers.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.stockVouchers.groupBy({ by: ['voucherType'], where: { tenantId }, _count: { _all: true } }),
    ]);
    const items = (await this.mapStockVouchers(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])), byType: Object.fromEntries(byType.map((b) => [b.voucherType, b._count._all])) };
  }

  async getStockVoucher(tenantId: string, id: string) {
    const row = await this.prisma.db().stockVouchers.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapStockVouchers(tenantId, [row], true))[0]! : null;
  }

  private async mapStockVouchers(tenantId: string, rows: Prisma.StockVouchersGetPayload<object>[], full: boolean): Promise<StockVoucher[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.stockVoucherLines.findMany({ where: { tenantId, voucherId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, vouchers] = await Promise.all([
      refs(db, tenantId, { warehouses: rows.map((x) => x.warehouseId), accounts: rows.map((x) => x.expenseAccountId), costCentres: rows.map((x) => x.costCentreId), products: lines.map((l) => l.itemId), batches: lines.map((l) => l.batchId) }),
      userRefs(db, tenantId, rows.map((x) => x.postedByUserId)),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
    ]);
    return rows.map((x) => ({
      id: x.id, voucherType: x.voucherType, docNo: x.docNo, docDate: day(x.docDate)!, warehouse: ref(r.warehouses, x.warehouseId), referenceNo: x.referenceNo, breakageReason: x.breakageReason,
      recipientName: x.recipientName, occasion: x.occasion, isReturnable: x.isReturnable, returnDueDate: day(x.returnDueDate), costCentre: find(r.costCentres, x.costCentreId),
      expenseAccount: find(r.accounts, x.expenseAccountId), remarks: x.remarks, status: x.status, totalItems: x.totalItems, totalQty: num(x.totalQty), totalAmount: num(x.totalAmount),
      postedAt: iso(x.postedAt), postedBy: users.get(x.postedByUserId ?? '') ?? null, voucher: vouchers.get(x.journalEntryId ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.voucherId === x.id).map((l) => ({ id: l.id, lineNo: l.lineNo, item: r.item(l.itemId), batchNo: find(r.batches, l.batchId)?.batchNo ?? null, qty: num(l.qty), rate: num(l.rate), amount: num(l.amount), remark: l.remark })),
    }));
  }

  // ---------------------------------------------------------------- assembly
  async listAssemblies(tenantId: string, q: DemandQuery): Promise<AssemblyList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.AssemblyVouchersWhereInput = { tenantId, ...(s && { docNo: { contains: s, mode: 'insensitive' } }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus] = await Promise.all([
      db.assemblyVouchers.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.assemblyVouchers.count({ where }),
      db.assemblyVouchers.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const items = (await this.mapAssemblies(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) };
  }

  async getAssembly(tenantId: string, id: string) {
    const row = await this.prisma.db().assemblyVouchers.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapAssemblies(tenantId, [row], true))[0]! : null;
  }

  private async mapAssemblies(tenantId: string, rows: Prisma.AssemblyVouchersGetPayload<object>[], full: boolean): Promise<AssemblyVoucher[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.assemblyVoucherLines.findMany({ where: { tenantId, voucherId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, kits, vouchers] = await Promise.all([
      refs(db, tenantId, { warehouses: rows.map((x) => x.warehouseId), products: lines.map((l) => l.itemId) }),
      db.kitsAndBundles.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.kitId)) } }, select: { id: true, code: true, name: true } }),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, kit: find(kits, x.kitId) ?? { id: x.kitId, code: '?', name: '?' }, direction: x.direction, kitQty: num(x.kitQty),
      warehouse: ref(r.warehouses, x.warehouseId), kitUnitCost: num(x.kitUnitCost), totalCost: num(x.totalCost), status: x.status, postedAt: iso(x.postedAt),
      voucher: vouchers.get(x.journalEntryId ?? '') ?? null, remarks: x.remarks, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.voucherId === x.id).map((l) => ({ id: l.id, lineNo: l.lineNo, item: r.item(l.itemId), qtyPerKit: num(l.qtyPerKit), qty: num(l.qty), unitCost: num(l.unitCost), value: num(l.value) })),
    }));
  }

  // ---------------------------------------------------------------- goods demand
  async listDemands(tenantId: string, q: DemandQuery): Promise<GoodsDemandList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.GoodsDemandsWhereInput = { tenantId, ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { notes: { contains: s, mode: 'insensitive' } }] }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus] = await Promise.all([
      db.goodsDemands.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], ...page(q) }),
      db.goodsDemands.count({ where }),
      db.goodsDemands.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const items = (await this.mapDemands(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) };
  }

  async getDemand(tenantId: string, id: string) {
    const row = await this.prisma.db().goodsDemands.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapDemands(tenantId, [row], true))[0]! : null;
  }

  private async mapDemands(tenantId: string, rows: Prisma.GoodsDemandsGetPayload<object>[], full: boolean): Promise<GoodsDemand[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.goodsDemandLines.findMany({ where: { tenantId, demandId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, pos, stock, products] = await Promise.all([
      refs(db, tenantId, { companies: rows.map((x) => x.manufacturerId), vendors: rows.map((x) => x.vendorId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.map((x) => x.preparedByUserId)),
      db.purchaseOrders.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.purchaseOrderId)) } }, select: { id: true, docNo: true, status: true } }),
      full ? db.stockBalances.groupBy({ by: ['itemId'], where: { tenantId, itemId: { in: ids(lines.map((l) => l.itemId)) } }, _sum: { qtyOnHand: true } }) : Promise.resolve([]),
      full ? db.products.findMany({ where: { tenantId, id: { in: ids(lines.map((l) => l.itemId)) } }, select: { id: true, lowLevel: true, highLevel: true } }) : Promise.resolve([]),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, manufacturer: ref(r.companies, x.manufacturerId), vendor: find(r.vendors, x.vendorId), source: x.source, notes: x.notes, status: x.status,
      totalItems: x.totalItems, totalQty: num(x.totalQty), totalBonus: num(x.totalBonus), grossAmount: num(x.grossAmount), discountAmount: num(x.discountAmount), netAmount: num(x.netAmount),
      purchaseOrder: find(pos, x.purchaseOrderId), orderedAt: iso(x.orderedAt), preparedBy: users.get(x.preparedByUserId) ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.demandId === x.id).map((l) => {
        const p = find(products, l.itemId);
        return {
          id: l.id, lineNo: l.lineNo, item: r.item(l.itemId), ctnSize: l.ctnSize, qtyCtn: num(l.qtyCtn), baseQty: num(l.baseQty), bonusQty: num(l.bonusQty), rate: num(l.rate),
          discountPct: num(l.discountPct), netAmount: num(l.netAmount), onHand: num(stock.find((s) => s.itemId === l.itemId)?._sum.qtyOnHand), lowLevel: num(p?.lowLevel), highLevel: num(p?.highLevel),
        };
      }),
    }));
  }

  async reorderNeeds(tenantId: string, vendorId: string, manufacturerId: string | null): Promise<ReorderNeed[]> {
    const db = this.prisma.db();
    const supplied = (await db.productSuppliers.findMany({ where: { tenantId, vendorId }, select: { itemId: true } })).map((s) => s.itemId);
    const products = await db.products.findMany({
      where: { tenantId, deletedAt: null, status: 'ACTIVE', ...(manufacturerId && { manufacturerId }), OR: [{ distributorVendorId: vendorId }, { id: { in: supplied } }] },
      select: { id: true, manufacturerId: true, ctn: true, lowLevel: true, highLevel: true, cost: true },
    });
    const [stock, rules] = await Promise.all([
      db.stockBalances.groupBy({ by: ['itemId'], where: { tenantId, itemId: { in: products.map((p) => p.id) } }, _sum: { qtyOnHand: true } }),
      db.reorderRules.groupBy({ by: ['itemId'], where: { tenantId, isActive: true, itemId: { in: products.map((p) => p.id) } }, _sum: { lowLevel: true, highLevel: true } }),
    ]);
    return products.flatMap((p) => {
      const rule = rules.find((x) => x.itemId === p.id);
      const low = rule ? num(rule._sum.lowLevel) : num(p.lowLevel);
      const high = rule ? num(rule._sum.highLevel) : num(p.highLevel);
      const onHand = num(stock.find((s) => s.itemId === p.id)?._sum.qtyOnHand);
      return high > 0 && onHand < low ? [{ itemId: p.id, manufacturerId: p.manufacturerId, ctn: p.ctn, onHand, lowLevel: low, highLevel: high, rate: num(p.cost) }] : [];
    });
  }

  // ---------------------------------------------------------------- principal claims & targets
  async listClaims(tenantId: string, q: DemandQuery): Promise<PrincipalClaimList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.PrincipalClaimsWhereInput = { tenantId, ...(s && { OR: [{ claimNo: { contains: s, mode: 'insensitive' } }, { description: { contains: s, mode: 'insensitive' } }] }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const yearStart = new Date(`${new Date().getFullYear()}-01-01`);
    const [rows, total, byStatus, open, settled] = await Promise.all([
      db.principalClaims.findMany({ where, orderBy: [{ claimDate: 'desc' }, { claimNo: 'desc' }], ...page(q) }),
      db.principalClaims.count({ where }),
      db.principalClaims.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.principalClaims.aggregate({ where: { ...base, status: { in: ['PENDING', 'SUBMITTED'] } }, _sum: { amount: true }, _count: { _all: true } }),
      db.principalClaims.aggregate({ where: { ...base, status: 'SETTLED', settledDate: { gte: yearStart } }, _sum: { settledAmount: true } }),
    ]);
    return { items: await this.mapClaims(tenantId, rows), total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])), kpis: { open: open._count._all, openAmount: num(open._sum.amount), settledThisYear: num(settled._sum.settledAmount) } };
  }

  async getClaim(tenantId: string, id: string) {
    const row = await this.prisma.db().principalClaims.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapClaims(tenantId, [row]))[0]! : null;
  }

  private async mapClaims(tenantId: string, rows: Prisma.PrincipalClaimsGetPayload<object>[]): Promise<PrincipalClaim[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [r, users, dns] = await Promise.all([
      refs(db, tenantId, { companies: rows.map((x) => x.manufacturerId), products: rows.map((x) => x.itemId), batches: rows.map((x) => x.batchId) }),
      userRefs(db, tenantId, rows.map((x) => x.createdBy)),
      db.debitNotes.findMany({ where: { tenantId, id: { in: ids(rows.map((x) => x.debitNoteId)) } }, select: { id: true, docNo: true } }),
    ]);
    return rows.map((x) => ({
      id: x.id, claimNo: x.claimNo, manufacturer: ref(r.companies, x.manufacturerId), claimDate: day(x.claimDate)!, claimType: x.claimType, description: x.description ?? '',
      item: x.itemId ? r.item(x.itemId) : null, batchNo: find(r.batches, x.batchId)?.batchNo ?? null, qty: x.qty === null ? null : num(x.qty), amount: num(x.amount), status: x.status,
      submittedAt: iso(x.submittedAt), settledDate: day(x.settledDate), settledAmount: x.settledAmount === null ? null : num(x.settledAmount), debitNote: find(dns, x.debitNoteId),
      remarks: x.remarks, createdBy: users.get(x.createdBy ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
    }));
  }

  async listTargets(tenantId: string) {
    const rows = await this.prisma.db().principalTargets.findMany({ where: { tenantId }, orderBy: [{ periodStart: 'desc' }] });
    return this.mapTargets(tenantId, rows);
  }

  async getTarget(tenantId: string, id: string) {
    const row = await this.prisma.db().principalTargets.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapTargets(tenantId, [row]))[0]! : null;
  }

  /** Achieved = posted purchases (bill line net) of the principal's products in the period; sales come with the sales phases. */
  private async mapTargets(tenantId: string, rows: Prisma.PrincipalTargetsGetPayload<object>[]): Promise<PrincipalTarget[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const r = await refs(db, tenantId, { companies: rows.map((x) => x.manufacturerId) });
    return Promise.all(rows.map(async (x) => {
      let achieved = 0;
      if (x.basis === 'PURCHASE') {
        const res = await db.$queryRaw<{ v: string | null }[]>`
          select sum(l."netAmount")::text as v from "Purchases"."VendorBillLines" l
            join "Purchases"."VendorBills" b on b."tenantId" = l."tenantId" and b.id = l."billId"
            join "Inventory"."Products" p on p."tenantId" = l."tenantId" and p.id = l."itemId"
           where l."tenantId" = ${tenantId}::uuid and p."manufacturerId" = ${x.manufacturerId}::uuid
             and b.status in ('POSTED','PARTIALLY_PAID','PAID') and b."docDate" between ${x.periodStart} and ${x.periodEnd}`;
        achieved = Number(res[0]?.v ?? 0);
      }
      const target = num(x.targetAmount);
      return {
        id: x.id, manufacturer: ref(r.companies, x.manufacturerId), periodType: x.periodType, periodStart: day(x.periodStart)!, periodEnd: day(x.periodEnd)!, basis: x.basis,
        targetAmount: target, achievedAmount: achieved, achievedPct: target > 0 ? Math.round((achieved / target) * 1000) / 10 : 0, notes: x.notes, rowVersion: x.rowVersion,
      };
    }));
  }

  // ---------------------------------------------------------------- bulk price updates
  async listPriceUpdates(tenantId: string, q: DemandQuery): Promise<BulkPriceUpdateList> {
    const db = this.prisma.db();
    const where: Prisma.BulkPriceUpdatesWhereInput = { tenantId, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus] = await Promise.all([
      db.bulkPriceUpdates.findMany({ where, orderBy: [{ createdAt: 'desc' }], ...page(q) }),
      db.bulkPriceUpdates.count({ where }),
      db.bulkPriceUpdates.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    ]);
    const items = (await this.mapPriceUpdates(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) };
  }

  async getPriceUpdate(tenantId: string, id: string) {
    const row = await this.prisma.db().bulkPriceUpdates.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapPriceUpdates(tenantId, [row], true))[0]! : null;
  }

  private async mapPriceUpdates(tenantId: string, rows: Prisma.BulkPriceUpdatesGetPayload<object>[], full: boolean): Promise<BulkPriceUpdate[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.bulkPriceUpdateLines.findMany({ where: { tenantId, batchId: { in: rows.map((r) => r.id) } } }) : [];
    const [r, users] = await Promise.all([
      refs(db, tenantId, { companies: rows.map((x) => x.manufacturerId), classes: rows.map((x) => x.productClassId), products: lines.map((l) => l.itemId) }),
      userRefs(db, tenantId, rows.map((x) => x.appliedByUserId)),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, applyTo: x.applyTo, manufacturer: find(r.companies, x.manufacturerId), productClass: find(r.classes, x.productClassId), priceField: x.priceField,
      changePct: num(x.changePct), roundTo: x.roundTo, itemCount: x.itemCount, status: x.status, appliedAt: iso(x.appliedAt), appliedBy: users.get(x.appliedByUserId ?? '') ?? null,
      undoneAt: iso(x.undoneAt), createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.batchId === x.id).map((l) => ({ id: l.id, item: r.item(l.itemId), priceField: l.priceField, oldValue: num(l.oldValue), newValue: num(l.newValue), changeAmount: num(l.changeAmount) })),
    }));
  }

  async priceScope(tenantId: string, s: { applyTo: string; manufacturerId: string | null; productClassId: string | null; itemIds: string[] }) {
    const rows = await this.prisma.db().products.findMany({
      where: { tenantId, deletedAt: null, status: { not: 'INACTIVE' }, ...(s.applyTo === 'COMPANY' ? { manufacturerId: s.manufacturerId } : s.applyTo === 'CLASS' ? { productClassId: s.productClassId } : { id: { in: s.itemIds } }) },
      select: { id: true, price: true, wprice: true, cost: true, status: true },
    });
    return rows.map((p) => ({ id: p.id, price: num(p.price), wprice: p.wprice === null ? null : num(p.wprice), cost: num(p.cost), status: p.status }));
  }

  async applyPrices(tenantId: string, batchId: string, userId: string, source: 'BULK_UPDATE' | 'UNDO', changes: { itemId: string; field: string; oldValue: number; newValue: number }[]) {
    const db = this.prisma.db();
    const col: Record<string, 'price' | 'wprice' | 'cost'> = { PRICE: 'price', WPRICE: 'wprice', COST: 'cost' };
    for (const c of changes) {
      await db.products.updateMany({ where: { tenantId, id: c.itemId }, data: { [col[c.field]!]: c.newValue } });
      await db.productPriceLogs.create({ data: { tenantId, itemId: c.itemId, priceField: c.field, oldValue: c.oldValue, newValue: c.newValue, changedByUserId: userId, source, priceChangeBatchId: batchId } });
    }
  }

  async nextNo(docType: string, date: string) {
    const r = await this.prisma.db().$queryRaw<{ n: string }[]>`select "Company"."getNextDocNo"(${docType}, ${date}::date, null::uuid) as n`;
    return r[0]!.n;
  }

  // ---------------------------------------------------------------- writes
  save(fn: DemandSave, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async set(doc: DemandDoc, tenantId: string, id: string, data: Record<string, unknown>) {
    const db = this.prisma.db();
    const where = { tenantId, id };
    if (doc === 'stockVoucher') await db.stockVouchers.updateMany({ where, data });
    else if (doc === 'assembly') await db.assemblyVouchers.updateMany({ where, data });
    else if (doc === 'demand') await db.goodsDemands.updateMany({ where, data });
    else if (doc === 'claim') await db.principalClaims.updateMany({ where, data });
    else if (doc === 'target') await db.principalTargets.updateMany({ where, data });
    else await db.bulkPriceUpdates.updateMany({ where, data });
  }

  async run(fn: DemandLifecycle, id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (TEXT_ARG.includes(fn)) await db.$queryRawUnsafe(`select "Inventory"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "Inventory"."${fn}"($1::uuid)::text`, id);
  }

  async deleteDraft(doc: DemandDoc, tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (doc === 'stockVoucher') {
      if (!(await db.stockVouchers.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.stockVoucherLines.deleteMany({ where: { tenantId, voucherId: id } });
      return (await db.stockVouchers.deleteMany({ where: { tenantId, id } })).count > 0;
    }
    if (doc === 'assembly') {
      if (!(await db.assemblyVouchers.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.assemblyVoucherLines.deleteMany({ where: { tenantId, voucherId: id } });
      return (await db.assemblyVouchers.deleteMany({ where: { tenantId, id } })).count > 0;
    }
    if (doc === 'demand') {
      if (!(await db.goodsDemands.count({ where: { tenantId, id, rowVersion, status: { in: ['DRAFT', 'SAVED'] } } }))) return false;
      await db.goodsDemandLines.deleteMany({ where: { tenantId, demandId: id } });
      return (await db.goodsDemands.deleteMany({ where: { tenantId, id } })).count > 0;
    }
    if (doc === 'claim') return (await db.principalClaims.deleteMany({ where: { tenantId, id, rowVersion, status: 'PENDING' } })).count > 0;
    if (doc === 'target') return (await db.principalTargets.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    if (!(await db.bulkPriceUpdates.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
    await db.bulkPriceUpdateLines.deleteMany({ where: { tenantId, batchId: id } });
    return (await db.bulkPriceUpdates.deleteMany({ where: { tenantId, id } })).count > 0;
  }
}
