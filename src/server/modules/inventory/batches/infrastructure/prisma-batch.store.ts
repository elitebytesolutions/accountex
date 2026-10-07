import { Injectable } from '@nestjs/common';
import { expiryWindow, type Batch, type BatchListQuery, type ListResult } from '../../../../../shared/index.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { BatchStore, type BatchSummary } from '../application/batch-store.js';

type Row = Prisma.ProductBatchesGetPayload<object>;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000);
const SORTABLE = new Set(['expiryDate', 'batchNo', 'createdAt']);

@Injectable()
export class PrismaBatchStore extends BatchStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: BatchListQuery, today: string): Promise<ListResult<Batch>> {
    const db = this.prisma.db();
    const t0 = new Date(`${today}T00:00:00Z`);
    const win: Record<string, Prisma.ProductBatchesWhereInput> = {
      expired: { expiryDate: { lt: t0 } },
      '30': { expiryDate: { gte: t0, lte: addDays(today, 30) } },
      '90': { expiryDate: { gte: t0, lte: addDays(today, 90) } },
      '180': { expiryDate: { gte: t0, lte: addDays(today, 180) } },
      later: { expiryDate: { gt: addDays(today, 180) } },
      none: { expiryDate: null },
    };
    const s = q.search?.trim();
    const matching = s ? await db.products.findMany({ where: { tenantId, OR: [{ name: { contains: s, mode: 'insensitive' } }, { sku: { contains: s, mode: 'insensitive' } }] }, select: { id: true } }) : [];
    const where: Prisma.ProductBatchesWhereInput = {
      tenantId,
      ...(q.product && { itemId: q.product }),
      ...(q.window && win[q.window]),
      ...(q.disposition && { disposition: q.disposition }),
      ...(s && { OR: [{ batchNo: { contains: s, mode: 'insensitive' } }, { itemId: { in: matching.map((m) => m.id) } }] }),
    };
    const field = q.sort?.replace(/^-/, '');
    const orderBy: Prisma.ProductBatchesOrderByWithRelationInput[] = field && SORTABLE.has(field) ? [{ [field]: q.sort!.startsWith('-') ? 'desc' : 'asc' }] : [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { batchNo: 'asc' }];
    const [rows, total] = await Promise.all([db.productBatches.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), db.productBatches.count({ where })]);
    return { items: await this.map(tenantId, rows), total };
  }

  async summary(tenantId: string, today: string): Promise<BatchSummary> {
    const db = this.prisma.db();
    const rows = await db.productBatches.findMany({ where: { tenantId }, select: { id: true, expiryDate: true } });
    const stock = await db.stockBalances.groupBy({ by: ['batchId'], where: { tenantId, batchId: { in: rows.map((r) => r.id) } }, _sum: { value: true } });
    const value = (id: string) => stock.find((x) => x.batchId === id)?._sum.value?.toNumber() ?? 0;
    const windows: BatchSummary['windows'] = {};
    const months = new Map<string, { value: number; count: number }>();
    for (const r of rows) {
      const w = expiryWindow(day(r.expiryDate), today);
      windows[w] = { count: (windows[w]?.count ?? 0) + 1, value: (windows[w]?.value ?? 0) + value(r.id) };
      if (r.expiryDate) {
        const m = w === 'expired' ? 'expired' : day(r.expiryDate)!.slice(0, 7);
        const cur = months.get(m) ?? { value: 0, count: 0 };
        months.set(m, { value: cur.value + value(r.id), count: cur.count + 1 });
      }
    }
    return {
      windows,
      total: { count: rows.length, value: rows.reduce((s, r) => s + value(r.id), 0) },
      byMonth: [...months.entries()].sort(([a], [b]) => (a === 'expired' ? -1 : b === 'expired' ? 1 : a.localeCompare(b))).map(([month, v]) => ({ month, ...v })),
    };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().productBatches.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async productExists(tenantId: string, itemId: string) {
    return (await this.prisma.db().products.count({ where: { tenantId, id: itemId, deletedAt: null } })) > 0;
  }

  async batchNoTaken(tenantId: string, itemId: string, batchNo: string) {
    return (await this.prisma.db().productBatches.count({ where: { tenantId, itemId, batchNo: { equals: batchNo, mode: 'insensitive' } } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'productBatchAddUpdate', data);
  }

  private async map(tenantId: string, rows: Row[]): Promise<Batch[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [products, stock] = await Promise.all([
      db.products.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.itemId))] } }, select: { id: true, sku: true, name: true } }),
      db.stockBalances.groupBy({ by: ['batchId'], where: { tenantId, batchId: { in: rows.map((r) => r.id) } }, _sum: { qtyOnHand: true, value: true } }),
    ]);
    return rows.map((b) => {
      const st = stock.find((x) => x.batchId === b.id);
      return {
        id: b.id, product: products.find((p) => p.id === b.itemId) ?? { id: b.itemId, sku: '?', name: 'Unknown product' }, batchNo: b.batchNo,
        expiryDate: day(b.expiryDate), mfgDate: day(b.mfgDate), unitCost: b.unitCost?.toNumber() ?? null, disposition: b.disposition,
        dispositionAt: b.dispositionAt?.toISOString() ?? null, notes: b.notes, onHand: st?._sum.qtyOnHand?.toNumber() ?? 0, value: st?._sum.value?.toNumber() ?? 0,
        rowVersion: b.rowVersion,
      };
    });
  }
}
