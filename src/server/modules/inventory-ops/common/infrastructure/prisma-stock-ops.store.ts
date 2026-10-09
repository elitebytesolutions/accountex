import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { StockAdjustmentList, StockCount, StockCountList, StockEntry, StockEntryList, StockOnHand, StockOpsOptions, StockTransfer, StockTransferList } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { day, ids, num, userRefs, voucherRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { StockOpsStore, type AdjustmentBase, type OpsDoc, type OpsLifecycle, type OpsQuery, type OpsSave } from '../application/stock-ops-store.js';

type Db = Prisma.TransactionClient;
type Ref = { id: string; code: string; name: string };
const TEXT_ARG: OpsLifecycle[] = ['stockInOutEntryCancel', 'stockTransferCancel', 'stockAdjustmentCancel', 'stockCountApprove', 'stockCountCancel'];
const monthStart = () => new Date(`${new Date().toISOString().slice(0, 7)}-01`);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const find = <T extends { id: string }>(xs: T[], id: string | null | undefined) => (id ? xs.find((x) => x.id === id) ?? null : null);
const ref = (xs: Ref[], id: string) => find(xs, id) ?? { id, code: '?', name: '?' };

async function refs(db: Db, tenantId: string, k: { warehouses?: (string | null)[]; products?: (string | null)[]; batches?: (string | null)[]; reasons?: (string | null)[]; accounts?: (string | null)[]; bins?: (string | null)[] }) {
  const q = <T,>(xs: (string | null)[] | undefined, f: (i: string[]) => Promise<T[]>) => (xs && ids(xs).length ? f(ids(xs)) : Promise.resolve([] as T[]));
  const [warehouses, products, batches, reasons, accounts, bins] = await Promise.all([
    q(k.warehouses, (i) => db.warehouses.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.products, (i) => db.products.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, sku: true, name: true, trackExpiry: true } })),
    q(k.batches, (i) => db.productBatches.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, batchNo: true, expiryDate: true } })),
    q(k.reasons, (i) => db.stockMovementReasons.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, label: true } })),
    q(k.accounts, (i) => db.chartOfAccounts.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true, name: true } })),
    q(k.bins, (i) => db.warehouseBins.findMany({ where: { tenantId, id: { in: i } }, select: { id: true, code: true } })),
  ]);
  const item = (id: string) => find(products, id) ?? { id, sku: '?', name: '?', trackExpiry: false };
  return { warehouses: warehouses as Ref[], products, batches, reasons, accounts: accounts as Ref[], bins, item };
}

@Injectable()
export class PrismaStockOpsStore extends StockOpsStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async options(tenantId: string): Promise<StockOpsOptions> {
    const db = this.prisma.db();
    const [warehouses, bins, products, uoms, reasons, classes, coa, users, countReasons] = await Promise.all([
      db.warehouses.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, branchId: true, type: true }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }),
      db.warehouseBins.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, warehouseId: true }, orderBy: { code: 'asc' } }),
      db.products.findMany({ where: { tenantId, deletedAt: null, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }),
      db.unitsOfMeasure.findMany({ where: { tenantId }, select: { id: true, code: true } }),
      db.stockMovementReasons.findMany({ where: { tenantId, isActive: true }, orderBy: [{ direction: 'asc' }, { sortOrder: 'asc' }] }),
      db.productClasses.findMany({ where: { tenantId }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, deletedAt: null, kind: 'POSTABLE', status: 'ACTIVE' }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: 'asc' } }),
      db.users.findMany({ where: { tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
      db.lookups.findMany({ where: { lookupType: 'StockCountLineReason', isActive: true, OR: [{ tenantId: null }, { tenantId }] }, select: { code: true, label: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    return {
      warehouses: warehouses.map((w) => ({ ...w, bins: bins.filter((b) => b.warehouseId === w.id).map((b) => ({ id: b.id, code: b.code })) })),
      products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, upc: p.upc, uomId: p.uomId, ctn: p.ctn, trackExpiry: p.trackExpiry, avgCost: num(p.avgCost), unit: uoms.find((u) => u.id === p.uomId)?.code ?? null, productClassId: p.productClassId, abcClass: p.abcClass })),
      reasons: reasons.map((r) => ({ id: r.id, code: r.code, label: r.label, direction: r.direction, ledgerMovementType: r.ledgerMovementType, icon: r.icon })),
      classes: classes as Ref[],
      accounts: coa.map((a) => ({ id: a.id, code: a.code, name: a.name, accountClass: Number(a.accountClass) })),
      users: users.map((u) => ({ id: u.id, name: u.fullName })),
      countReasons,
    };
  }

  async onHand(tenantId: string, warehouseId: string, itemIds?: string[]): Promise<StockOnHand> {
    const db = this.prisma.db();
    const rows = await db.stockBalances.findMany({ where: { tenantId, warehouseId, qtyOnHand: { not: 0 }, ...(itemIds && { itemId: { in: itemIds } }) } });
    const [batches, products] = await Promise.all([
      db.productBatches.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.batchId)) } }, select: { id: true, batchNo: true, expiryDate: true } }),
      db.products.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.itemId)) } }, select: { id: true, avgCost: true } }),
    ]);
    const merged = new Map<string, StockOnHand[number]>();
    for (const r of rows) {
      const key = `${r.itemId}|${r.batchId ?? ''}`;
      const b = find(batches, r.batchId);
      const prev = merged.get(key);
      const qty = num(r.qtyOnHand) + (prev?.qtyOnHand ?? 0);
      const cost = num(find(products, r.itemId)?.avgCost);
      merged.set(key, { itemId: r.itemId, batchId: r.batchId, batchNo: b?.batchNo ?? null, expiryDate: day(b?.expiryDate), qtyOnHand: qty, unitCost: cost });
    }
    return [...merged.values()];
  }

  // ---------------------------------------------------------------- stock in / out
  async listEntries(tenantId: string, q: OpsQuery): Promise<StockEntryList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.StockInOutWhereInput = { tenantId, ...(q.warehouse && { warehouseId: q.warehouse }), ...(q.mode && { mode: q.mode }), ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { manualRef: { contains: s, mode: 'insensitive' } }, { requestedByName: { contains: s, mode: 'insensitive' } }] }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus, ins, outs, drafts] = await Promise.all([
      db.stockInOut.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.stockInOut.count({ where }),
      db.stockInOut.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.stockInOut.aggregate({ where: { ...base, mode: 'IN', status: 'POSTED', docDate: { gte: monthStart() } }, _sum: { totalValue: true } }),
      db.stockInOut.aggregate({ where: { ...base, mode: 'OUT', status: 'POSTED', docDate: { gte: monthStart() } }, _sum: { totalValue: true } }),
      db.stockInOut.count({ where: { ...base, status: 'DRAFT' } }),
    ]);
    const items = (await this.mapEntries(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])), kpis: { inValue: num(ins._sum.totalValue), outValue: num(outs._sum.totalValue), drafts } };
  }

  async getEntry(tenantId: string, id: string) {
    const row = await this.prisma.db().stockInOut.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapEntries(tenantId, [row], true))[0]! : null;
  }

  private async mapEntries(tenantId: string, rows: Prisma.StockInOutGetPayload<object>[], full: boolean): Promise<StockEntry[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.stockInOutEntryLines.findMany({ where: { tenantId, entryId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, vouchers] = await Promise.all([
      refs(db, tenantId, { warehouses: rows.map((x) => x.warehouseId), reasons: rows.map((x) => x.reasonId), bins: rows.map((x) => x.binId), products: lines.map((l) => l.itemId), batches: lines.map((l) => l.batchId) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.enteredByUserId, x.postedByUserId])),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, mode: x.mode, docDate: day(x.docDate)!, warehouse: ref(r.warehouses, x.warehouseId), bin: find(r.bins, x.binId),
      reason: find(r.reasons, x.reasonId) ?? { id: x.reasonId ?? '', code: '?', label: '?' }, manualRef: x.manualRef, requestedByName: x.requestedByName, notes: x.notes,
      status: x.status, totalItems: x.totalItems, totalQty: num(x.totalQty), totalValue: num(x.totalValue), postedAt: iso(x.postedAt), postedBy: users.get(x.postedByUserId ?? '') ?? null,
      voucher: vouchers.get(x.journalEntryId ?? '') ?? null, cancelledAt: iso(x.cancelledAt), cancelReason: x.cancelReason, enteredBy: users.get(x.enteredByUserId ?? '') ?? null,
      createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.entryId === x.id).map((l) => {
        const b = find(r.batches, l.batchId);
        return { id: l.id, lineNo: l.lineNo, item: r.item(l.itemId), batchNo: b?.batchNo ?? l.newBatchNo, expiryDate: day(b?.expiryDate) ?? day(l.newExpiryDate), qty: num(l.qty), unitCost: num(l.unitCost), value: num(l.value) };
      }),
    }));
  }

  // ---------------------------------------------------------------- transfers
  async listTransfers(tenantId: string, q: OpsQuery): Promise<StockTransferList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.StockTransfersWhereInput = { tenantId, ...(q.warehouse && { OR: [{ fromWarehouseId: q.warehouse }, { toWarehouseId: q.warehouse }] }), ...(s && { docNo: { contains: s, mode: 'insensitive' } }) };
    const where = { ...base, ...(q.status && (q.status === 'IN_TRANSIT' ? { status: { in: ['POSTED', 'DISPATCHED', 'IN_TRANSIT'] } } : { status: q.status })) };
    const [rows, total, byStatus, transit, received, drafts] = await Promise.all([
      db.stockTransfers.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.stockTransfers.count({ where }),
      db.stockTransfers.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.stockTransfers.aggregate({ where: { ...base, status: { in: ['POSTED', 'DISPATCHED', 'IN_TRANSIT'] } }, _sum: { totalValue: true }, _count: { _all: true } }),
      db.stockTransfers.count({ where: { ...base, status: 'RECEIVED', receivedAt: { gte: monthStart() } } }),
      db.stockTransfers.count({ where: { ...base, status: 'DRAFT' } }),
    ]);
    const items = (await this.mapTransfers(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])), kpis: { inTransit: transit._count._all, inTransitValue: num(transit._sum.totalValue), receivedThisMonth: received, drafts } };
  }

  async getTransfer(tenantId: string, id: string) {
    const row = await this.prisma.db().stockTransfers.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapTransfers(tenantId, [row], true))[0]! : null;
  }

  private async mapTransfers(tenantId: string, rows: Prisma.StockTransfersGetPayload<object>[], full: boolean): Promise<StockTransfer[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.stockTransferLines.findMany({ where: { tenantId, transferId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const receipts = full ? await db.stockTransferReceiptLines.findMany({ where: { tenantId, transferId: { in: rows.map((r) => r.id) } } }) : [];
    const [r, users, vouchers] = await Promise.all([
      refs(db, tenantId, { warehouses: rows.flatMap((x) => [x.fromWarehouseId, x.toWarehouseId]), products: lines.map((l) => l.itemId), batches: lines.map((l) => l.batchId) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.preparedByUserId, x.receivedByUserId])),
      voucherRefs(db, tenantId, rows.flatMap((x) => [x.journalEntryId, x.receiptJournalEntryId])),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, from: ref(r.warehouses, x.fromWarehouseId), to: ref(r.warehouses, x.toWarehouseId), carrier: x.carrier, driverName: x.driverName,
      vehicleNo: x.vehicleNo, etaAt: iso(x.etaAt), remarks: x.remarks, status: x.status, dispatchedAt: iso(x.dispatchedAt), receivedAt: iso(x.receivedAt),
      receivedBy: users.get(x.receivedByUserId ?? '') ?? null, receiptNote: x.receiptNote, totalItems: x.totalItems, totalQty: num(x.totalQty), totalValue: num(x.totalValue),
      voucher: vouchers.get(x.journalEntryId ?? '') ?? null, receiptVoucher: vouchers.get(x.receiptJournalEntryId ?? '') ?? null, cancelledAt: iso(x.cancelledAt),
      cancelReason: x.cancelReason, preparedBy: users.get(x.preparedByUserId ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.transferId === x.id).map((l) => {
        const rc = receipts.find((y) => y.transferLineId === l.id);
        return {
          id: l.id, lineNo: l.lineNo, item: r.item(l.itemId), batchNo: find(r.batches, l.batchId)?.batchNo ?? null, qtyCtn: num(l.qtyCtn), qtyLoose: num(l.qtyLoose), baseQty: num(l.baseQty),
          unitCost: num(l.unitCost), value: num(l.value), receivedQty: rc ? num(rc.receivedQty) : null, varianceQty: rc?.varianceQty ? num(rc.varianceQty) : null,
        };
      }),
    }));
  }

  async setTransferLines(tenantId: string, transferId: string, from: string, to: string, lines: { itemId: string; batchId: string | null; fromBinId: string | null; toBinId: string | null; ctnSize: number; qtyCtn: number; qtyLoose: number; unitCost: number }[]) {
    const db = this.prisma.db();
    await db.stockTransferLines.deleteMany({ where: { tenantId, transferId } });
    let n = 0;
    for (const l of lines) {
      n += 1;
      await db.stockTransferLines.create({ data: { tenantId, transferId, fromWarehouseId: from, toWarehouseId: to, lineNo: n, itemId: l.itemId, batchId: l.batchId, fromBinId: l.fromBinId, toBinId: l.toBinId, ctnSize: l.ctnSize, qtyCtn: l.qtyCtn, qtyLoose: l.qtyLoose, unitCost: l.unitCost } });
    }
  }

  async saveReceipt(tenantId: string, transferId: string, lines: { transferLineId: string; sentQty: number; receivedQty: number; note: string | null; receivedAt: string; receivedByUserId: string }[]) {
    const db = this.prisma.db();
    await db.stockTransferReceiptLines.deleteMany({ where: { tenantId, transferId } });
    for (const l of lines) {
      await db.stockTransferReceiptLines.create({ data: { tenantId, transferId, transferLineId: l.transferLineId, sentQty: l.sentQty, receivedQty: l.receivedQty, note: l.note, receivedAt: new Date(l.receivedAt), receivedByUserId: l.receivedByUserId } });
    }
  }

  // ---------------------------------------------------------------- adjustments
  async listAdjustments(tenantId: string, q: OpsQuery): Promise<StockAdjustmentList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.StockAdjustmentsWhereInput = { tenantId, ...(q.warehouse && { warehouseId: q.warehouse }), ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { remarks: { contains: s, mode: 'insensitive' } }] }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus, loss, gain, pending] = await Promise.all([
      db.stockAdjustments.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.stockAdjustments.count({ where }),
      db.stockAdjustments.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      db.stockAdjustments.aggregate({ where: { ...base, status: 'POSTED', netValue: { lt: 0 }, docDate: { gte: monthStart() } }, _sum: { netValue: true } }),
      db.stockAdjustments.aggregate({ where: { ...base, status: 'POSTED', netValue: { gt: 0 }, docDate: { gte: monthStart() } }, _sum: { netValue: true } }),
      db.stockAdjustments.count({ where: { ...base, status: 'PENDING_APPROVAL' } }),
    ]);
    const items = (await this.mapAdjustments(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])), kpis: { writeOffThisMonth: -num(loss._sum.netValue), gainThisMonth: num(gain._sum.netValue), pending } };
  }

  async getAdjustment(tenantId: string, id: string) {
    const row = await this.prisma.db().stockAdjustments.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapAdjustments(tenantId, [row], true))[0]! : null;
  }

  private async mapAdjustments(tenantId: string, rows: Prisma.StockAdjustmentsGetPayload<object>[], full: boolean): Promise<AdjustmentBase[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.stockAdjustmentLines.findMany({ where: { tenantId, adjustmentId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, vouchers] = await Promise.all([
      refs(db, tenantId, { warehouses: rows.map((x) => x.warehouseId), reasons: rows.map((x) => x.reasonId), accounts: rows.map((x) => x.offsetAccountId), products: lines.map((l) => l.itemId), batches: lines.map((l) => l.batchId) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.preparedByUserId, x.approvedByUserId])),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, docDate: day(x.docDate)!, warehouse: ref(r.warehouses, x.warehouseId), reason: find(r.reasons, x.reasonId) ?? { id: x.reasonId, code: '?', label: '?' },
      offsetAccount: find(r.accounts, x.offsetAccountId), remarks: x.remarks, status: x.status, lineCount: x.lineCount, netValue: num(x.netValue),
      preparedBy: users.get(x.preparedByUserId ?? '') ?? null, submittedAt: iso(x.submittedAt), approvedBy: users.get(x.approvedByUserId ?? '') ?? null, approvedAt: iso(x.approvedAt),
      rejectionReason: x.rejectionReason, postedAt: iso(x.postedAt), voucher: vouchers.get(x.journalEntryId ?? '') ?? null,
      source: x.sourceDocType && x.sourceDocId ? { type: x.sourceDocType, id: x.sourceDocId } : null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.adjustmentId === x.id).map((l) => ({
        id: l.id, lineNo: l.lineNo, item: r.item(l.itemId), batchNo: find(r.batches, l.batchId)?.batchNo ?? null, qtyOnHand: num(l.qtyOnHand), qtyCounted: num(l.qtyCounted),
        qtyChange: num(l.qtyChange), unitCost: num(l.unitCost), value: num(l.value),
      })),
    }));
  }

  // ---------------------------------------------------------------- counts
  async listCounts(tenantId: string, q: OpsQuery): Promise<StockCountList> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const base: Prisma.StockCountsWhereInput = { tenantId, ...(q.warehouse && { warehouseId: q.warehouse }), ...(s && { OR: [{ docNo: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }] }) };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, byStatus] = await Promise.all([
      db.stockCounts.findMany({ where, orderBy: [{ docDate: 'desc' }, { docNo: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.stockCounts.count({ where }),
      db.stockCounts.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const items = (await this.mapCounts(tenantId, rows, false)).map(({ lines, ...x }) => { void lines; return x; });
    return { items, total, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) };
  }

  async getCount(tenantId: string, id: string) {
    const row = await this.prisma.db().stockCounts.findFirst({ where: { tenantId, id } });
    return row ? (await this.mapCounts(tenantId, [row], true))[0]! : null;
  }

  async setCountLines(tenantId: string, countId: string, lines: { id: string; countedQty: number | null; reason: string | null; countedAt?: string; countedByUserId?: string }[]) {
    const db = this.prisma.db();
    for (const l of lines) {
      await db.stockCountLines.updateMany({
        where: { tenantId, countId, id: l.id },
        data: { countedQty: l.countedQty, reason: l.reason, ...(l.countedAt && { countedAt: new Date(l.countedAt), countedByUserId: l.countedByUserId }) },
      });
    }
  }

  async countScope(tenantId: string, id: string) {
    return (await this.prisma.db().stockCounts.findFirst({ where: { tenantId, id }, select: { scopeClassIds: true } }))?.scopeClassIds ?? [];
  }

  private async mapCounts(tenantId: string, rows: Prisma.StockCountsGetPayload<object>[], full: boolean): Promise<StockCount[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const lines = full ? await db.stockCountLines.findMany({ where: { tenantId, countId: { in: rows.map((r) => r.id) } }, orderBy: { lineNo: 'asc' } }) : [];
    const [r, users, vouchers] = await Promise.all([
      refs(db, tenantId, { warehouses: rows.map((x) => x.warehouseId), products: lines.map((l) => l.itemId), batches: lines.map((l) => l.batchId) }),
      userRefs(db, tenantId, rows.flatMap((x) => [x.ownerUserId, x.approverUserId])),
      voucherRefs(db, tenantId, rows.map((x) => x.journalEntryId)),
    ]);
    return rows.map((x) => ({
      id: x.id, docNo: x.docNo, name: x.name, docDate: day(x.docDate)!, warehouse: ref(r.warehouses, x.warehouseId), scopeLabel: x.scopeLabel, abcAOnly: x.abcAOnly, isBlind: x.isBlind,
      status: x.status, frozenAt: iso(x.frozenAt), owner: users.get(x.ownerUserId ?? '') ?? null, lineCount: x.lineCount, countedCount: x.countedCount, shortageValue: num(x.shortageValue),
      excessValue: num(x.excessValue), netVarianceValue: num(x.netVarianceValue), approver: users.get(x.approverUserId ?? '') ?? null, approvedAt: iso(x.approvedAt),
      approvalComment: x.approvalComment, voucher: vouchers.get(x.journalEntryId ?? '') ?? null, createdAt: x.createdAt.toISOString(), rowVersion: x.rowVersion,
      lines: lines.filter((l) => l.countId === x.id).map((l) => ({
        id: l.id, lineNo: l.lineNo, item: r.item(l.itemId), batchNo: find(r.batches, l.batchId)?.batchNo ?? null, expectedQty: num(l.expectedQty),
        countedQty: l.countedQty === null ? null : num(l.countedQty), varianceQty: l.varianceQty === null ? null : num(l.varianceQty), unitCost: num(l.unitCost),
        varianceValue: l.varianceValue === null ? null : num(l.varianceValue), reason: l.reason,
      })),
    }));
  }

  // ---------------------------------------------------------------- writes
  save(fn: OpsSave, data: Record<string, unknown>) {
    return addUpdate(this.prisma, fn, data);
  }

  async set(doc: OpsDoc, tenantId: string, id: string, data: Record<string, unknown>) {
    const db = this.prisma.db();
    const where = { tenantId, id };
    if (doc === 'entry') await db.stockInOut.updateMany({ where, data });
    else if (doc === 'transfer') await db.stockTransfers.updateMany({ where, data });
    else if (doc === 'adjustment') await db.stockAdjustments.updateMany({ where, data });
    else await db.stockCounts.updateMany({ where, data });
  }

  async run(fn: OpsLifecycle, id: string, text: string | null = null) {
    const db = this.prisma.db();
    if (TEXT_ARG.includes(fn)) await db.$queryRawUnsafe(`select "Inventory"."${fn}"($1::uuid, $2::text)::text`, id, text);
    else await db.$queryRawUnsafe(`select "Inventory"."${fn}"($1::uuid)::text`, id);
  }

  async deleteDraft(doc: OpsDoc, tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    if (doc === 'entry') {
      if (!(await db.stockInOut.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.stockInOutEntryLines.deleteMany({ where: { tenantId, entryId: id } });
      return (await db.stockInOut.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (doc === 'transfer') {
      if (!(await db.stockTransfers.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
      await db.stockTransferLines.deleteMany({ where: { tenantId, transferId: id } });
      return (await db.stockTransfers.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (doc === 'adjustment') {
      if (!(await db.stockAdjustments.count({ where: { tenantId, id, rowVersion, status: 'DRAFT', submittedAt: null } }))) return false;
      await db.stockAdjustmentLines.deleteMany({ where: { tenantId, adjustmentId: id } });
      return (await db.stockAdjustments.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
    }
    if (!(await db.stockCounts.count({ where: { tenantId, id, rowVersion, status: 'DRAFT' } }))) return false;
    await db.stockCountLines.deleteMany({ where: { tenantId, countId: id } });
    return (await db.stockCounts.deleteMany({ where: { tenantId, id, rowVersion } })).count > 0;
  }
}
