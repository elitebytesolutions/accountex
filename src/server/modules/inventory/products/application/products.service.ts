import { Injectable } from '@nestjs/common';
import {
  productErrors,
  type ProductBarcodeCreate,
  type ProductBarcodeUpdate,
  type ProductCreate,
  type ProductDetail,
  type ProductListQuery,
  type ProductPriceChange,
  type ProductSupplierCreate,
  type ProductSupplierUpdate,
  type ProductUnitCreate,
  type ProductUnitUpdate,
  type ProductUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ProductStore, type ProductChild } from './product-store.js';

const FIELD = { cost: 'COST', price: 'PRICE', wprice: 'WPRICE' } as const;
type Links = { uomId?: string; manufacturerId?: string | null; productClassId?: string | null; productSubclassId?: string | null; distributorVendorId?: string | null; taxCodeId?: string | null };

/**
 * Products with their pack sizes, barcodes and suppliers. Every price change writes a price-log line in the same unit of
 * work; one base unit (factor 1), one primary barcode per kind and one preferred supplier (setting a new one moves the flag).
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly store: ProductStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: ProductListQuery) {
    return this.store.page(user.tenantId, q);
  }

  summary(user: SessionUser) {
    return this.store.summary(user.tenantId);
  }

  formOptions(user: SessionUser) {
    return this.store.formOptions(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<ProductDetail> {
    const p = await this.store.detail(user.tenantId, id);
    if (!p) throw new NotFoundError('Product not found');
    return p;
  }

  priceLog(user: SessionUser, id: string) {
    return this.store.priceLog(user.tenantId, id);
  }

  /** Next free SKU for a prefix: FD → FD-1001, FD-1002, … (deleted SKUs count as used). */
  async nextSku(user: SessionUser, prefix: string): Promise<string> {
    const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'SKU';
    const used = new Set((await this.store.allSkus(user.tenantId)).map((s) => s.sku));
    let n = 1001;
    while (used.has(`${p}-${n}`)) n++;
    return `${p}-${n}`;
  }

  async lookup(user: SessionUser, barcode: string) {
    const hit = await this.store.byBarcode(user.tenantId, barcode);
    if (!hit) throw new NotFoundError(`No product has barcode ${barcode}`);
    return { ...hit, product: await this.get(user, hit.itemId) };
  }

  async create(user: SessionUser, meta: RequestMeta, input: ProductCreate): Promise<ProductDetail> {
    await this.checkSku(user, input.sku);
    await this.checkLinks(user, input);
    if (input.units.some((u) => u.uomId === input.uomId)) throw new ValidationError('The base unit is added automatically', { units: ['Remove the base unit from the pack sizes'] });
    const { units, barcodes, suppliers, ...product } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const pid = await this.store.save({
        ...product,
        units: [{ uomId: input.uomId, factor: 1, isBase: true, isPurchaseDefault: !units.some((u) => u.isPurchaseDefault), isSalesDefault: !units.some((u) => u.isSalesDefault) }, ...units],
        barcodes: this.onePrimary(barcodes),
        suppliers: suppliers.map((s, i) => ({ ...s, isPreferred: suppliers.some((x) => x.isPreferred) ? s.isPreferred && suppliers.findIndex((x) => x.isPreferred) === i : i === 0 })),
      });
      for (const [k, f] of Object.entries(FIELD)) {
        const v = product[k as keyof typeof FIELD];
        if (v !== null && v !== undefined) await this.store.addPriceLog({ itemId: pid, priceField: f, oldValue: null, newValue: v, changedByUserId: user.id, source: 'MANUAL' });
      }
      return pid;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ProductUpdate): Promise<ProductDetail> {
    const p = await this.current(user, id, input.rowVersion);
    if (input.sku && input.sku !== p.sku) await this.checkSku(user, input.sku);
    await this.checkLinks(user, { ...input, productClassId: input.productClassId !== undefined ? input.productClassId : p.productClass?.id ?? null, productSubclassId: input.productSubclassId !== undefined ? input.productSubclassId : p.subclass?.id ?? null });
    this.checkPrices({
      status: input.status ?? p.status, cost: input.cost ?? p.cost, price: input.price ?? p.price, lowLevel: input.lowLevel ?? p.lowLevel, highLevel: input.highLevel ?? p.highLevel,
      manufacturerId: input.manufacturerId !== undefined ? input.manufacturerId : p.company?.id ?? null, productClassId: input.productClassId !== undefined ? input.productClassId : p.productClass?.id ?? null,
    });
    const base = p.units.find((u) => u.isBase);
    if (input.uomId && input.uomId !== p.uom.id && p.units.some((u) => !u.isBase && u.uom.id === input.uomId)) {
      throw new ValidationError('That unit is already a pack size of this product', { uomId: ['Remove the pack size first'] });
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ ...input, id });
      if (input.uomId && input.uomId !== p.uom.id && base) await this.store.saveChild('unit', { id: base.id, rowVersion: base.rowVersion, uomId: input.uomId });
      await this.logPrices(user, p, input, 'MANUAL');
    });
    return this.get(user, id);
  }

  /** Inline price edit from the catalogue. */
  async setPrice(user: SessionUser, meta: RequestMeta, id: string, input: ProductPriceChange): Promise<ProductDetail> {
    const p = await this.current(user, id, input.rowVersion);
    const key = input.field === 'COST' ? 'cost' : input.field === 'PRICE' ? 'price' : 'wprice';
    this.checkPrices({ ...this.shape(p), cost: key === 'cost' ? input.value : p.cost, price: key === 'price' ? input.value : p.price });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ id, rowVersion: input.rowVersion, [key]: input.value });
      await this.logPrices(user, p, { [key]: input.value }, 'INLINE_EDIT');
    });
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<ProductDetail> {
    const p = await this.current(user, id, rowVersion);
    if (active) this.checkPrices({ ...this.shape(p), status: 'ACTIVE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Stock, kits or documents use this product. Deactivate it instead.', undefined, { code: 'PRODUCT_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- pack sizes
  async addUnit(user: SessionUser, meta: RequestMeta, itemId: string, input: ProductUnitCreate): Promise<ProductDetail> {
    const p = await this.get(user, itemId);
    if (!(await this.store.activeRef(user.tenantId, 'uom', input.uomId))) throw new ValidationError('Choose an active unit', { uomId: ['Unknown or inactive unit'] });
    if (p.units.some((u) => u.uom.id === input.uomId)) throw new ConflictError('This product already has that unit', { uomId: ['Already a pack size'] }, { code: 'DB_UNIQUE_VIOLATION' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.clearUnitDefaults(p, input);
      await this.store.saveChild('unit', { ...input, itemId, isBase: false });
    });
    return this.get(user, itemId);
  }

  async updateUnit(user: SessionUser, meta: RequestMeta, unitId: string, input: ProductUnitUpdate): Promise<ProductDetail> {
    const owner = await this.child(user, 'unit', unitId, input.rowVersion);
    const p = await this.get(user, owner.itemId);
    const u = p.units.find((x) => x.id === unitId)!;
    if (u.isBase && input.factor !== undefined && input.factor !== 1) throw new ValidationError('The base unit is always 1', { factor: ['The base unit is always 1'] });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.clearUnitDefaults(p, input, unitId);
      await this.store.saveChild('unit', { ...input, id: unitId });
    });
    return this.get(user, owner.itemId);
  }

  async deleteUnit(user: SessionUser, meta: RequestMeta, unitId: string, rowVersion: number): Promise<void> {
    const owner = await this.child(user, 'unit', unitId, rowVersion);
    const p = await this.get(user, owner.itemId);
    const u = p.units.find((x) => x.id === unitId)!;
    if (u.isBase) throw new ValidationError("The base unit can't be removed; change the product's unit instead", { uomId: ['Base unit'] });
    if (await this.store.unitInUse(unitId)) throw new ConflictError('Barcodes or documents use this pack size.', undefined, { code: 'UNIT_IN_USE_BY_PRODUCT' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteChild(user.tenantId, 'unit', unitId, rowVersion));
  }

  // ---------------------------------------------------------------- barcodes
  async addBarcode(user: SessionUser, meta: RequestMeta, itemId: string, input: ProductBarcodeCreate): Promise<ProductDetail> {
    const p = await this.get(user, itemId);
    const isPrimary = input.isPrimary || !p.barcodes.some((b) => b.kind === input.kind);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (isPrimary) await this.clearPrimaryBarcode(p, input.kind);
      await this.store.saveChild('barcode', { ...input, isPrimary, itemId });
    });
    return this.get(user, itemId);
  }

  async updateBarcode(user: SessionUser, meta: RequestMeta, barcodeId: string, input: ProductBarcodeUpdate): Promise<ProductDetail> {
    const owner = await this.child(user, 'barcode', barcodeId, input.rowVersion);
    const p = await this.get(user, owner.itemId);
    const b = p.barcodes.find((x) => x.id === barcodeId)!;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isPrimary) await this.clearPrimaryBarcode(p, input.kind ?? b.kind, barcodeId);
      await this.store.saveChild('barcode', { ...input, id: barcodeId });
    });
    return this.get(user, owner.itemId);
  }

  async deleteBarcode(user: SessionUser, meta: RequestMeta, barcodeId: string, rowVersion: number): Promise<void> {
    await this.child(user, 'barcode', barcodeId, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteChild(user.tenantId, 'barcode', barcodeId, rowVersion));
  }

  // ---------------------------------------------------------------- suppliers
  async addSupplier(user: SessionUser, meta: RequestMeta, itemId: string, input: ProductSupplierCreate): Promise<ProductDetail> {
    const p = await this.get(user, itemId);
    if (!(await this.store.activeRef(user.tenantId, 'vendor', input.vendorId))) throw new ValidationError('Choose an active vendor', { vendorId: ['Unknown or inactive vendor'] });
    if (p.suppliers.some((s) => s.vendor.id === input.vendorId)) throw new ConflictError('This vendor already supplies the product', { vendorId: ['Already a supplier'] }, { code: 'DB_UNIQUE_VIOLATION' });
    const isPreferred = input.isPreferred || p.suppliers.length === 0;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (isPreferred) await this.clearPreferred(p);
      await this.store.saveChild('supplier', { ...input, isPreferred, itemId });
    });
    return this.get(user, itemId);
  }

  async updateSupplier(user: SessionUser, meta: RequestMeta, supplierId: string, input: ProductSupplierUpdate): Promise<ProductDetail> {
    const owner = await this.child(user, 'supplier', supplierId, input.rowVersion);
    const p = await this.get(user, owner.itemId);
    if (input.vendorId && input.vendorId !== p.suppliers.find((s) => s.id === supplierId)!.vendor.id) {
      throw new ValidationError("A supplier row's vendor doesn't change; add the other vendor instead", { vendorId: ['Fixed once added'] });
    }
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isPreferred) await this.clearPreferred(p, supplierId);
      await this.store.saveChild('supplier', { ...input, id: supplierId });
    });
    return this.get(user, owner.itemId);
  }

  async deleteSupplier(user: SessionUser, meta: RequestMeta, supplierId: string, rowVersion: number): Promise<void> {
    await this.child(user, 'supplier', supplierId, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteChild(user.tenantId, 'supplier', supplierId, rowVersion));
  }

  // ---------------------------------------------------------------- helpers
  /** Inside the unit of work: one price-log line per changed price field. */
  private async logPrices(user: SessionUser, before: ProductDetail, after: { cost?: number; price?: number; wprice?: number | null }, source: string) {
    for (const [k, f] of Object.entries(FIELD)) {
      const next = after[k as keyof typeof FIELD];
      const prev = before[k as keyof typeof FIELD];
      if (next !== undefined && next !== null && next !== prev) await this.store.addPriceLog({ itemId: before.id, priceField: f, oldValue: prev, newValue: next, changedByUserId: user.id, source });
    }
  }

  private shape(p: ProductDetail) {
    return { status: p.status, cost: p.cost, price: p.price, lowLevel: p.lowLevel, highLevel: p.highLevel, manufacturerId: p.company?.id ?? null, productClassId: p.productClass?.id ?? null };
  }

  private checkPrices(p: Parameters<typeof productErrors>[0]) {
    const e = productErrors(p);
    const missing = (['manufacturerId', 'productClassId', 'cost'] as const).filter((k) => e[k]);
    if (missing.length || (e.price && !(p.price > 0))) {
      const details = Object.fromEntries([...missing, ...(e.price && !(p.price > 0) ? ['price'] : [])].map((k) => [k, [e[k]!]]));
      throw new ValidationError('An active product needs a company, a class, a purchase price and a retail price. Complete it or save it as a draft.', details, { code: 'PRODUCT_INCOMPLETE' });
    }
    if (e.price) throw new ValidationError('The retail price is below cost. Save it as a draft or raise the price.', { price: [e.price] }, { code: 'PRODUCT_PRICE_BELOW_COST' });
    if (e.lowLevel) throw new ValidationError(e.lowLevel, { lowLevel: [e.lowLevel] });
  }

  private onePrimary<T extends { kind: string; isPrimary: boolean }>(rows: T[]): T[] {
    return rows.map((b, i) => {
      const sameKind = rows.filter((x) => x.kind === b.kind);
      const chosen = sameKind.find((x) => x.isPrimary) ?? sameKind[0];
      return { ...b, isPrimary: chosen === rows[i] };
    });
  }

  private async clearUnitDefaults(p: ProductDetail, input: { isPurchaseDefault?: boolean; isSalesDefault?: boolean }, exceptId?: string) {
    for (const u of p.units.filter((x) => x.id !== exceptId)) {
      const patch: Record<string, unknown> = {};
      if (input.isPurchaseDefault && u.isPurchaseDefault) patch.isPurchaseDefault = false;
      if (input.isSalesDefault && u.isSalesDefault) patch.isSalesDefault = false;
      if (Object.keys(patch).length) await this.store.saveChild('unit', { id: u.id, rowVersion: u.rowVersion, ...patch });
    }
  }

  private async clearPrimaryBarcode(p: ProductDetail, kind: string, exceptId?: string) {
    for (const b of p.barcodes.filter((x) => x.isPrimary && x.kind === kind && x.id !== exceptId)) await this.store.saveChild('barcode', { id: b.id, rowVersion: b.rowVersion, isPrimary: false });
  }

  private async clearPreferred(p: ProductDetail, exceptId?: string) {
    for (const s of p.suppliers.filter((x) => x.isPreferred && x.id !== exceptId)) await this.store.saveChild('supplier', { id: s.id, rowVersion: s.rowVersion, isPreferred: false });
  }

  private async child(user: SessionUser, kind: ProductChild, id: string, rowVersion: number) {
    const owner = await this.store.childOwner(user.tenantId, kind, id);
    if (!owner) throw new NotFoundError(`${kind[0]!.toUpperCase()}${kind.slice(1)} not found`);
    if (owner.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this row. Reload and try again.');
    return owner;
  }

  private async checkLinks(user: SessionUser, l: Links) {
    const t = user.tenantId;
    if (l.uomId && !(await this.store.activeRef(t, 'uom', l.uomId))) throw new ValidationError('Choose an active unit', { uomId: ['Unknown or inactive unit'] });
    if (l.manufacturerId && !(await this.store.activeRef(t, 'company', l.manufacturerId))) throw new ValidationError('Choose an active company', { manufacturerId: ['Unknown or inactive company'] });
    if (l.distributorVendorId && !(await this.store.activeRef(t, 'vendor', l.distributorVendorId))) throw new ValidationError('Choose an active vendor', { distributorVendorId: ['Unknown or inactive vendor'] });
    if (l.taxCodeId && !(await this.store.activeRef(t, 'taxCode', l.taxCodeId))) throw new ValidationError('Choose an active tax code', { taxCodeId: ['Unknown or inactive tax code'] });
    if (l.productClassId && !(await this.store.activeRef(t, 'class', l.productClassId))) throw new ValidationError('Choose a class', { productClassId: ['Unknown class'] });
    if (l.productSubclassId) {
      const cls = await this.store.subclassOf(t, l.productSubclassId);
      if (!cls || cls !== l.productClassId) throw new ValidationError('The sub type belongs to another class', { productSubclassId: ['Choose a sub type of the chosen class'] });
    }
  }

  private async checkSku(user: SessionUser, sku: string) {
    const hit = (await this.store.allSkus(user.tenantId)).find((s) => s.sku === sku);
    if (!hit) return;
    throw hit.deleted
      ? new ConflictError(`SKU ${sku} belonged to a deleted product and can't be reused.`, { sku: ['SKUs are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`SKU ${sku} is already used.`, { sku: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const p = await this.get(user, id);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this product. Reload and try again.');
    return p;
  }
}
