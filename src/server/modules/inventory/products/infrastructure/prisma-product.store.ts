import { Injectable } from '@nestjs/common';
import type { ListResult, PriceLog, Product, ProductDetail, ProductListQuery } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { addUpdate, type AddUpdateFunction } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { ProductStore, type ProductChild, type ProductFormOptions, type ProductSummary } from '../application/product-store.js';

type Row = Prisma.ProductsGetPayload<object>;
const SORTABLE = new Set(['name', 'sku', 'price', 'cost', 'defaultShelf', 'createdAt', 'updatedAt', 'manufacturerId', 'productClassId']);
const num = (d: { toNumber(): number } | null | undefined) => (d === null || d === undefined ? null : d.toNumber());
const some = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
const CHILD_FN: Record<ProductChild, AddUpdateFunction> = { unit: 'productUnitAddUpdate', barcode: 'productBarcodeAddUpdate', supplier: 'productSupplierAddUpdate' };

@Injectable()
export class PrismaProductStore extends ProductStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: ProductListQuery): Promise<ListResult<Product>> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const attr: Prisma.ProductsWhereInput = q.attr === 'short' ? { isShort: true } : q.attr === 'expiry' ? { trackExpiry: true } : q.attr === 'precious' ? { isPrecious: true } : q.attr === 'controlled' ? { isControlled: true } : {};
    const where: Prisma.ProductsWhereInput = {
      tenantId, deletedAt: null, ...attr,
      ...(q.status && { status: q.status }),
      ...(q.company && { manufacturerId: q.company }),
      ...(q.class && { productClassId: q.class }),
      ...(q.subclass && { productSubclassId: q.subclass }),
      ...(q.shelf && { defaultShelf: q.shelf }),
      ...(s && { OR: [{ sku: { contains: s, mode: 'insensitive' } }, { name: { contains: s, mode: 'insensitive' } }, { upc: { contains: s } }, { nameUrdu: { contains: s } }] }),
    };
    if (q.minStock !== undefined || q.maxStock !== undefined || q.low) where.id = { in: await this.stockMatches(tenantId, q) };
    const field = q.sort?.replace(/^-/, '');
    const dir = q.sort?.startsWith('-') ? 'desc' : 'asc';
    const orderBy = field && SORTABLE.has(field) ? [{ [field]: dir }, { name: 'asc' as const }] : [{ name: 'asc' as const }];
    const [rows, total] = await Promise.all([
      db.products.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.products.count({ where }),
    ]);
    return { items: await this.map(tenantId, rows), total };
  }

  /** Products whose on-hand quantity (all warehouses; none = 0) is in the range, or at / below their low level. */
  private async stockMatches(tenantId: string, q: ProductListQuery): Promise<string[]> {
    const db = this.prisma.db();
    const [products, stock] = await Promise.all([
      db.products.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, lowLevel: true } }),
      db.stockBalances.groupBy({ by: ['itemId'], where: { tenantId }, _sum: { qtyOnHand: true } }),
    ]);
    const onHand = new Map(stock.map((s) => [s.itemId, s._sum.qtyOnHand?.toNumber() ?? 0]));
    return products.filter((p) => {
      const qty = onHand.get(p.id) ?? 0;
      return (q.minStock === undefined || qty >= q.minStock) && (q.maxStock === undefined || qty <= q.maxStock) && (!q.low || qty <= p.lowLevel.toNumber());
    }).map((p) => p.id);
  }

  async summary(tenantId: string): Promise<ProductSummary> {
    const db = this.prisma.db();
    const live = { tenantId, deletedAt: null };
    const [byStatus, companies, classes, shelves, short, expiry, precious, controlled] = await Promise.all([
      db.products.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      db.products.findMany({ where: { ...live, manufacturerId: { not: null } }, select: { manufacturerId: true }, distinct: ['manufacturerId'] }),
      db.products.findMany({ where: { ...live, productClassId: { not: null } }, select: { productClassId: true }, distinct: ['productClassId'] }),
      db.products.findMany({ where: { ...live, defaultShelf: { not: null } }, select: { defaultShelf: true }, distinct: ['defaultShelf'], orderBy: { defaultShelf: 'asc' } }),
      db.products.count({ where: { ...live, isShort: true } }),
      db.products.count({ where: { ...live, trackExpiry: true } }),
      db.products.count({ where: { ...live, isPrecious: true } }),
      db.products.count({ where: { ...live, isControlled: true } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    return {
      total: Object.values(counts).reduce((a, b) => a + b, 0), byStatus: counts, companies: companies.length, classes: classes.length,
      shelves: shelves.map((x) => x.defaultShelf!), short, expiry, precious, controlled,
    };
  }

  async formOptions(tenantId: string): Promise<ProductFormOptions> {
    const db = this.prisma.db();
    const [companies, vendors, classes, subs, units, taxes, warehouses] = await Promise.all([
      db.productCompanies.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, brandColour: true }, orderBy: { name: 'asc' } }),
      db.vendors.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.productClasses.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, name: true, icon: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      db.productSubclasses.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, productClassId: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      db.unitsOfMeasure.findMany({ where: { tenantId, isActive: true }, select: { id: true, code: true, name: true, kind: true, decimals: true }, orderBy: [{ kind: 'asc' }, { code: 'asc' }] }),
      db.taxCodes.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, description: true }, orderBy: { code: 'asc' } }),
      db.warehouses.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      companies, vendors, units, warehouses,
      classes: classes.map((c) => ({ ...c, subclasses: subs.filter((s) => s.productClassId === c.id).map((s) => ({ id: s.id, name: s.name })) })),
      taxCodes: taxes.map((t) => ({ id: t.id, code: t.code, name: t.description ?? t.code })),
    };
  }

  async detail(tenantId: string, id: string): Promise<ProductDetail | null> {
    const db = this.prisma.db();
    const row = await db.products.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!row) return null;
    const [[p], units, barcodes, suppliers] = await Promise.all([
      this.map(tenantId, [row]),
      db.productUnits.findMany({ where: { tenantId, itemId: id }, orderBy: [{ isBase: 'desc' }, { factor: 'asc' }] }),
      db.productBarcodes.findMany({ where: { tenantId, itemId: id }, orderBy: [{ kind: 'desc' }, { isPrimary: 'desc' }, { barcode: 'asc' }] }),
      db.productSuppliers.findMany({ where: { tenantId, itemId: id }, orderBy: [{ isPreferred: 'desc' }, { createdAt: 'asc' }] }),
    ]);
    const [uoms, vendors] = await Promise.all([
      db.unitsOfMeasure.findMany({ where: { tenantId, id: { in: units.map((u) => u.uomId) } } }),
      db.vendors.findMany({ where: { tenantId, id: { in: suppliers.map((v) => v.vendorId) } }, select: { id: true, code: true, name: true } }),
    ]);
    return {
      ...p!,
      units: units.map((u) => {
        const m = uoms.find((x) => x.id === u.uomId)!;
        return { id: u.id, uom: { id: m.id, code: m.code, name: m.name, decimals: m.decimals }, factor: u.factor.toNumber(), isBase: u.isBase, isPurchaseDefault: u.isPurchaseDefault, isSalesDefault: u.isSalesDefault, rowVersion: u.rowVersion };
      }),
      barcodes: barcodes.map((b) => ({ id: b.id, barcode: b.barcode, kind: b.kind, qtyPerScan: b.qtyPerScan.toNumber(), isPrimary: b.isPrimary, rowVersion: b.rowVersion })),
      suppliers: suppliers.map((v) => ({
        id: v.id, vendor: vendors.find((x) => x.id === v.vendorId) ?? { id: v.vendorId, code: '?', name: 'Unknown vendor' }, vendorItemCode: v.vendorItemCode,
        lastPrice: num(v.lastPrice), lastPurchaseDate: v.lastPurchaseDate?.toISOString().slice(0, 10) ?? null, leadDays: v.leadDays, sharePct: num(v.sharePct),
        isPreferred: v.isPreferred, rowVersion: v.rowVersion,
      })),
    };
  }

  async allSkus(tenantId: string) {
    const rows = await this.prisma.db().products.findMany({ where: { tenantId }, select: { sku: true, deletedAt: true } });
    return rows.map((r) => ({ sku: r.sku, deleted: r.deletedAt !== null }));
  }

  async byBarcode(tenantId: string, barcode: string) {
    const db = this.prisma.db();
    const b = await db.productBarcodes.findFirst({ where: { tenantId, barcode } });
    if (b) return { itemId: b.itemId, kind: b.kind, qtyPerScan: b.qtyPerScan.toNumber() };
    const p = await db.products.findFirst({ where: { tenantId, upc: barcode, deletedAt: null }, select: { id: true } });
    return p ? { itemId: p.id, kind: 'PIECE', qtyPerScan: 1 } : null;
  }

  async priceLog(tenantId: string, itemId: string): Promise<PriceLog[]> {
    const db = this.prisma.db();
    const rows = await db.productPriceLogs.findMany({ where: { tenantId, itemId }, orderBy: { changedAt: 'desc' }, take: 200 });
    const users = await db.users.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.changedByUserId)) } }, select: { id: true, fullName: true } });
    return rows.map((r) => ({
      id: r.id, priceField: r.priceField, oldValue: num(r.oldValue), newValue: r.newValue.toNumber(), changedAt: r.changedAt.toISOString(),
      changedBy: users.find((u) => u.id === r.changedByUserId)?.fullName ?? null, source: r.source,
    }));
  }

  async activeRef(tenantId: string, kind: 'uom' | 'company' | 'class' | 'vendor' | 'taxCode', id: string) {
    const db = this.prisma.db();
    switch (kind) {
      case 'uom': return (await db.unitsOfMeasure.count({ where: { tenantId, id, isActive: true } })) > 0;
      case 'company': return (await db.productCompanies.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) > 0;
      case 'class': return (await db.productClasses.count({ where: { tenantId, id, deletedAt: null } })) > 0;
      case 'vendor': return (await db.vendors.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) > 0;
      case 'taxCode': return (await db.taxCodes.count({ where: { tenantId, id, deletedAt: null, isActive: true } })) > 0;
    }
  }

  async subclassOf(tenantId: string, subclassId: string) {
    const s = await this.prisma.db().productSubclasses.findFirst({ where: { tenantId, id: subclassId, deletedAt: null }, select: { productClassId: true } });
    return s?.productClassId ?? null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'productAddUpdate', data);
  }

  saveChild(kind: ProductChild, data: Record<string, unknown>) {
    return addUpdate(this.prisma, CHILD_FN[kind], data);
  }

  addPriceLog(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'productPriceLogAdd', data);
  }

  async childOwner(tenantId: string, kind: ProductChild, id: string) {
    const db = this.prisma.db();
    const where = { tenantId, id };
    const select = { itemId: true, rowVersion: true };
    if (kind === 'unit') return db.productUnits.findFirst({ where, select });
    if (kind === 'barcode') return db.productBarcodes.findFirst({ where, select });
    return db.productSuppliers.findFirst({ where, select });
  }

  async deleteChild(tenantId: string, kind: ProductChild, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const where = { tenantId, id, rowVersion };
    const { count } = kind === 'unit' ? await db.productUnits.deleteMany({ where }) : kind === 'barcode' ? await db.productBarcodes.deleteMany({ where }) : await db.productSuppliers.deleteMany({ where });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this row. Reload and try again.');
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'products', id, ['productUnits', 'productBarcodes', 'productSuppliers', 'productPriceLogs']);
  }

  unitInUse(id: string) {
    return isReferenced(this.prisma, 'productUnits', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().products.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this product. Reload and try again.');
  }

  private async map(tenantId: string, rows: Row[]): Promise<Product[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const ids = rows.map((r) => r.id);
    const [companies, vendors, classes, subs, uoms, taxes, kits, stock] = await Promise.all([
      db.productCompanies.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.manufacturerId)) } }, select: { id: true, code: true, name: true, brandColour: true } }),
      db.vendors.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.distributorVendorId)) } }, select: { id: true, name: true } }),
      db.productClasses.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.productClassId)) } }, select: { id: true, code: true, name: true, icon: true } }),
      db.productSubclasses.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.productSubclassId)) } }, select: { id: true, name: true } }),
      db.unitsOfMeasure.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.uomId)) } }, select: { id: true, code: true, name: true, decimals: true } }),
      db.taxCodes.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.taxCodeId)) } }, select: { id: true, code: true, description: true } }),
      db.kitsAndBundles.findMany({ where: { tenantId, kitItemId: { in: ids }, deletedAt: null }, select: { kitItemId: true } }),
      db.stockBalances.groupBy({ by: ['itemId'], where: { tenantId, itemId: { in: ids } }, _sum: { qtyOnHand: true, value: true } }),
    ]);
    const ref = <T extends { id: string }>(xs: T[], id: string | null) => (id ? (xs.find((x) => x.id === id) ?? null) : null);
    return rows.map((p) => {
      const st = stock.find((x) => x.itemId === p.id);
      const tax = ref(taxes, p.taxCodeId);
      return {
        id: p.id, sku: p.sku, upc: p.upc, name: p.name, nameUrdu: p.nameUrdu, description: p.description, status: p.status,
        company: ref(companies, p.manufacturerId), distributor: ref(vendors, p.distributorVendorId), productClass: ref(classes, p.productClassId),
        subclass: ref(subs, p.productSubclassId), uom: ref(uoms, p.uomId) ?? { id: p.uomId, code: '?', name: '?', decimals: 0 }, ctn: p.ctn,
        defaultShelf: p.defaultShelf, cost: p.cost.toNumber(), avgCost: p.avgCost.toNumber(), price: p.price.toNumber(), wprice: num(p.wprice),
        gstRate: p.gstRate.toNumber(), taxCode: tax ? { id: tax.id, code: tax.code, name: tax.description ?? tax.code } : null, finDiscPct: p.finDiscPct.toNumber(),
        lowLevel: p.lowLevel.toNumber(), highLevel: p.highLevel.toNumber(), isShort: p.isShort, trackExpiry: p.trackExpiry, isControlled: p.isControlled,
        isPrecious: p.isPrecious, hsCode: p.hsCode, weightKg: num(p.weightKg), leadDays: p.leadDays, isKit: kits.some((k) => k.kitItemId === p.id),
        onHand: st?._sum.qtyOnHand?.toNumber() ?? 0, stockValue: st?._sum.value?.toNumber() ?? 0, rowVersion: p.rowVersion,
      };
    });
  }
}
