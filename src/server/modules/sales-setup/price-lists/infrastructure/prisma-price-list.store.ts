import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { marginPct, type ListResult, type PriceList, type PriceListRow, type PriceListRowsQuery, type QuantityBreak } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { PriceListStore, type PriceListPage, type ResolveInputs } from '../application/price-list-store.js';

const SORTABLE = new Set(['code', 'name', 'createdAt', 'updatedAt']);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
type Row = Prisma.PriceListsGetPayload<object>;

@Injectable()
export class PrismaPriceListStore extends PriceListStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: PriceListPage, today: string): Promise<ListResult<PriceList>> {
    const s = q.search?.trim();
    const where: Prisma.PriceListsWhereInput = {
      tenantId, deletedAt: null,
      ...(q.status && { status: q.status }),
      ...(s && { OR: [{ code: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }] }),
    };
    const field = q.sort?.replace(/^-/, '');
    const orderBy: Prisma.PriceListsOrderByWithRelationInput[] = field && SORTABLE.has(field) ? [{ [field]: q.sort!.startsWith('-') ? 'desc' : 'asc' }] : [{ isDefault: 'desc' }, { name: 'asc' }];
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([db.priceLists.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), db.priceLists.count({ where })]);
    return { items: await this.map(tenantId, rows, today), total };
  }

  async get(tenantId: string, id: string, today: string) {
    const row = await this.prisma.db().priceLists.findFirst({ where: { tenantId, id, deletedAt: null } });
    return row ? (await this.map(tenantId, [row], today))[0]! : null;
  }

  async rows(tenantId: string, listId: string, q: PriceListRowsQuery, date: string): Promise<ListResult<PriceListRow>> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const where: Prisma.ProductsWhereInput = {
      tenantId, deletedAt: null,
      ...(q.class && { productClassId: q.class }),
      ...(s && { OR: [{ sku: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }] }),
    };
    const [products, total] = await Promise.all([
      db.products.findMany({ where, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.products.count({ where }),
    ]);
    const ids = products.map((p) => p.id);
    const [prices, uoms, classes, cos] = await Promise.all([
      ids.length ? db.priceListItems.findMany({ where: { tenantId, priceListId: listId, itemId: { in: ids } }, orderBy: { effectiveFrom: 'asc' } }) : [],
      db.unitsOfMeasure.findMany({ where: { tenantId, id: { in: [...new Set(products.map((p) => p.uomId))] } }, select: { id: true, code: true } }),
      db.productClasses.findMany({ where: { tenantId, id: { in: products.map((p) => p.productClassId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
      db.productCompanies.findMany({ where: { tenantId, id: { in: products.map((p) => p.manufacturerId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    ]);
    return {
      total,
      items: products.map((p) => {
        const mine = prices.filter((x) => x.itemId === p.id);
        const cur = mine.filter((x) => day(x.effectiveFrom)! <= date).at(-1) ?? null;
        const next = mine.find((x) => day(x.effectiveFrom)! > date) ?? null;
        return {
          product: {
            id: p.id, sku: p.sku, name: p.name, uomCode: uoms.find((u) => u.id === p.uomId)?.code ?? '',
            className: classes.find((c) => c.id === p.productClassId)?.name ?? null, companyName: cos.find((c) => c.id === p.manufacturerId)?.name ?? null,
          },
          cost: p.cost.toNumber(), retail: p.price.toNumber(),
          price: cur ? cur.price.toNumber() : null, effectiveFrom: cur ? day(cur.effectiveFrom) : null,
          next: next ? { price: next.price.toNumber(), effectiveFrom: day(next.effectiveFrom)! } : null,
        };
      }),
    };
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().priceLists.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  defaultIds(tenantId: string) {
    return this.prisma.db().priceLists.findMany({ where: { tenantId, isDefault: true, deletedAt: null }, select: { id: true, rowVersion: true } });
  }

  async activeCurrency(code: string) {
    const rows = await this.prisma.db().$queryRaw<{ n: number }[]>`select count(*)::int as n from "Company"."Currencies" where code = ${code}`;
    return (rows[0]?.n ?? 0) > 0;
  }

  async currentPrices(tenantId: string, listId: string, date: string) {
    const rows = await this.prisma.db().$queryRaw<{ itemId: string; price: string }[]>`
      select distinct on (i."itemId") i."itemId"::text as "itemId", i.price::text as price
        from "Sales"."PriceListItems" i
       where i."tenantId" = ${tenantId}::uuid and i."priceListId" = ${listId}::uuid and i."effectiveFrom" <= ${date}::date
       order by i."itemId", i."effectiveFrom" desc`;
    return new Map(rows.map((r) => [r.itemId, Number(r.price)]));
  }

  async productCosts(tenantId: string) {
    const rows = await this.prisma.db().products.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, cost: true } });
    return rows.map((r) => ({ id: r.id, cost: r.cost.toNumber() }));
  }

  async productExists(tenantId: string, itemId: string) {
    return (await this.prisma.db().products.count({ where: { tenantId, id: itemId, deletedAt: null } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'priceListAddUpdate', data);
  }

  async upsertItems(data: { priceListId: string; effectiveFrom: string; items: { itemId: string; price: number }[] }) {
    return Number(await addUpdate(this.prisma, 'priceListItemsUpsert', data));
  }

  async breaks(tenantId: string, listId: string | null, itemId: string): Promise<QuantityBreak[]> {
    const rows = await this.prisma.db().priceListQuantityBreaks.findMany({ where: { tenantId, priceListId: listId, itemId }, orderBy: { tierNo: 'asc' } });
    return rows.map((r) => ({ id: r.id, tierNo: r.tierNo, minQty: r.minQty.toNumber(), maxQty: r.maxQty?.toNumber() ?? null, unitPrice: r.unitPrice.toNumber() }));
  }

  async breakItems(tenantId: string, listId: string | null) {
    const db = this.prisma.db();
    const counts = await db.priceListQuantityBreaks.groupBy({ by: ['itemId'], where: { tenantId, priceListId: listId }, _count: { _all: true } });
    const products = await db.products.findMany({ where: { tenantId, deletedAt: null, id: { in: counts.map((c) => c.itemId) } }, select: { id: true, sku: true, name: true }, orderBy: { name: 'asc' } });
    return products.map((p) => ({ ...p, slabs: counts.find((c) => c.itemId === p.id)?._count._all ?? 0 }));
  }

  async replaceBreaks(data: { priceListId: string | null; itemId: string; slabs: { minQty: number; maxQty: number | null; unitPrice: number }[] }) {
    await addUpdate(this.prisma, 'quantityBreaksReplace', data);
  }

  async resolveInputs(tenantId: string, customerId: string | undefined, itemId: string): Promise<ResolveInputs | null> {
    const db = this.prisma.db();
    const product = await db.products.findFirst({ where: { tenantId, id: itemId, deletedAt: null }, select: { price: true } });
    if (!product) return null;
    let customer: ResolveInputs['customer'] = null;
    if (customerId) {
      const c = await db.customers.findFirst({ where: { tenantId, id: customerId, deletedAt: null }, select: { priceListId: true, customerGroupId: true } });
      if (!c) return null;
      const g = c.customerGroupId ? await db.customerGroups.findFirst({ where: { tenantId, id: c.customerGroupId }, select: { priceListId: true } }) : null;
      customer = { priceListId: c.priceListId, groupListId: g?.priceListId ?? null };
    }
    const lists = await db.priceLists.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, name: true, status: true, validFrom: true, validTo: true, isDefault: true } });
    return {
      customer,
      defaultListId: lists.find((l) => l.isDefault)?.id ?? null,
      lists: lists.map((l) => ({ id: l.id, code: l.code, name: l.name, status: l.status, validFrom: day(l.validFrom), validTo: day(l.validTo) })),
      productPrice: product.price.toNumber(),
    };
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'priceLists', id, ['priceListItems', 'quantityBreaks']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().priceLists.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isDefault: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this price list. Reload and try again.');
  }

  /** Header + assigned groups, effective customer count, current item count and average margin on cost. */
  private async map(tenantId: string, rows: Row[], today: string): Promise<PriceList[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const ids = rows.map((r) => r.id);
    const [groups, own, byGroup, prices, products] = await Promise.all([
      db.customerGroups.findMany({ where: { tenantId, deletedAt: null, priceListId: { not: null } }, select: { id: true, name: true, priceListId: true } }),
      db.customers.groupBy({ by: ['priceListId'], where: { tenantId, deletedAt: null, priceListId: { not: null } }, _count: { _all: true } }),
      db.customers.groupBy({ by: ['customerGroupId'], where: { tenantId, deletedAt: null, priceListId: null }, _count: { _all: true } }),
      this.prisma.db().$queryRaw<{ priceListId: string; itemId: string; price: string }[]>`
        select distinct on (i."priceListId", i."itemId") i."priceListId"::text as "priceListId", i."itemId"::text as "itemId", i.price::text as price
          from "Sales"."PriceListItems" i
         where i."tenantId" = ${tenantId}::uuid and i."priceListId" = any(${ids}::uuid[]) and i."effectiveFrom" <= ${today}::date
         order by i."priceListId", i."itemId", i."effectiveFrom" desc`,
      db.products.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, cost: true } }),
    ]);
    const cost = new Map(products.map((p) => [p.id, p.cost.toNumber()]));
    const listOfGroup = new Map(groups.map((g) => [g.id, g.priceListId]));
    const defaultId = rows.find((r) => r.isDefault)?.id ?? (await db.priceLists.findFirst({ where: { tenantId, isDefault: true, deletedAt: null }, select: { id: true } }))?.id ?? null;
    return rows.map((r) => {
      const mine = prices.filter((p) => p.priceListId === r.id && cost.has(p.itemId));
      const margins = mine.filter((p) => Number(p.price) > 0).map((p) => marginPct(Number(p.price), cost.get(p.itemId)!));
      const viaGroups = byGroup.filter((g) => (g.customerGroupId ? listOfGroup.get(g.customerGroupId) ?? null : null) === r.id).reduce((s, g) => s + g._count._all, 0);
      const viaDefault = r.id === defaultId ? byGroup.filter((g) => !g.customerGroupId || !listOfGroup.get(g.customerGroupId)).reduce((s, g) => s + g._count._all, 0) : 0;
      return {
        id: r.id, code: r.code, name: r.name, markupPct: r.markupPct?.toNumber() ?? null, roundingTo: r.roundingTo.toNumber(), isDefault: r.isDefault,
        currencyCode: r.currencyCode.trim(), validFrom: day(r.validFrom), validTo: day(r.validTo), status: r.status, remarks: r.remarks,
        groups: groups.filter((g) => g.priceListId === r.id).map((g) => ({ id: g.id, name: g.name })),
        customerCount: (own.find((o) => o.priceListId === r.id)?._count._all ?? 0) + viaGroups + viaDefault,
        itemCount: mine.length,
        avgMargin: margins.length ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10 : null,
        lowCount: margins.filter((m) => m < 10).length,
        rowVersion: r.rowVersion,
      };
    });
  }
}
