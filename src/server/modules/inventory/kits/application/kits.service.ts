import { Injectable } from '@nestjs/common';
import type { Kit, KitCreate, KitUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ProductStore } from '../../products/application/product-store.js';
import { KitStore } from './kit-store.js';

/** Next free KIT-001 (codes ever used, deleted ones included, are skipped). */
function nextKitCode(used: string[]) {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(`KIT-${String(n).padStart(3, '0')}`)) n++;
  return `KIT-${String(n).padStart(3, '0')}`;
}

/**
 * Kits & bundles. A kit sells as its own product (SKU = kit code): it's created with the kit and kept in step (name,
 * selling price, cost = sum of component costs; price changes go to the price log). Assembling from stock is Phase 22.
 */
@Injectable()
export class KitsService {
  constructor(
    private readonly store: KitStore,
    private readonly products: ProductStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: KitCreate): Promise<Kit> {
    const cost = await this.componentCost(user, input.components);
    const links = await this.links(user, input.components);
    const code = nextKitCode([...(await this.store.allCodes(user.tenantId)), ...(await this.products.allSkus(user.tenantId)).map((s) => s.sku)]);
    const uomId = await this.store.pieceUnit(user.tenantId);
    if (!uomId) throw new ValidationError('Add a count unit (e.g. PCS) first', { name: ['No count unit to sell kits in'] });
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const kitItemId = await this.products.save({
        sku: code, name: input.name, uomId, ctn: 1, cost, price: input.sellingPrice, ...links, status: live(links, cost, input.sellingPrice) ? 'ACTIVE' : 'DRAFT',
        units: [{ uomId, factor: 1, isBase: true, isPurchaseDefault: true, isSalesDefault: true }],
      });
      for (const [f, v] of [['COST', cost], ['PRICE', input.sellingPrice]] as const) {
        await this.products.addPriceLog({ itemId: kitItemId, priceField: f, oldValue: null, newValue: v, changedByUserId: user.id, source: 'MANUAL' });
      }
      return this.store.save({ ...input, code, kitItemId, status: 'ACTIVE', components: input.components.map((c, i) => ({ ...c, sortOrder: (i + 1) * 10 })) });
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: KitUpdate): Promise<Kit> {
    const k = await this.current(user, id, input.rowVersion);
    if (input.components) await this.checkComponents(input.components.map((c) => c.itemId), k.kitItem.id, user);
    const cost = input.components ? await this.componentCost(user, input.components, k.kitItem.id) : k.components.reduce((s, c) => s + c.product.cost * c.qtyPerKit, 0);
    const price = input.sellingPrice ?? k.sellingPrice;
    const item = await this.products.detail(user.tenantId, k.kitItem.id);
    const links = input.components ? await this.links(user, input.components) : { manufacturerId: item?.company?.id ?? null, productClassId: item?.productClass?.id ?? null };
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ ...input, id, ...(input.components && { components: input.components.map((c, i) => ({ ...c, sortOrder: (i + 1) * 10 })) }) });
      if (item) {
        await this.products.save({ id: item.id, rowVersion: item.rowVersion, name: input.name ?? item.name, cost, price, ...links, status: item.status === 'INACTIVE' && live(links, cost, price) ? 'INACTIVE' : live(links, cost, price) ? 'ACTIVE' : 'DRAFT' });
        if (cost !== item.cost) await this.products.addPriceLog({ itemId: item.id, priceField: 'COST', oldValue: item.cost, newValue: cost, changedByUserId: user.id, source: 'MANUAL' });
        if (price !== item.price) await this.products.addPriceLog({ itemId: item.id, priceField: 'PRICE', oldValue: item.price, newValue: price, changedByUserId: user.id, source: 'MANUAL' });
      }
    });
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Kit> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  /** Deletes the kit and, when nothing else uses it, its kit product. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const k = await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Documents use this kit. Deactivate it instead.', undefined, { code: 'KIT_IN_USE' });
    const item = await this.products.detail(user.tenantId, k.kitItem.id);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.softDelete(user.tenantId, id, rowVersion);
      if (item && !(await this.products.inUse(item.id))) await this.products.softDelete(user.tenantId, item.id, item.rowVersion);
    });
  }

  private async componentCost(user: SessionUser, components: { itemId: string; qtyPerKit: number }[], selfId?: string) {
    await this.checkComponents(components.map((c) => c.itemId), selfId, user);
    const rows = await this.store.products(user.tenantId, components.map((c) => c.itemId));
    return Math.round(components.reduce((s, c) => s + rows.find((r) => r.id === c.itemId)!.cost * c.qtyPerKit, 0) * 100) / 100;
  }

  /** The kit product sells under the company and class of its first component that has both (a live product needs them). */
  private async links(user: SessionUser, components: { itemId: string }[]) {
    for (const c of components) {
      const d = await this.products.detail(user.tenantId, c.itemId);
      if (d?.company && d.productClass) return { manufacturerId: d.company.id, productClassId: d.productClass.id };
    }
    return { manufacturerId: null, productClassId: null };
  }

  private async checkComponents(ids: string[], selfId: string | undefined, user: SessionUser) {
    if (selfId && ids.includes(selfId)) throw new ValidationError("A kit can't contain itself", { components: ["A kit can't contain itself"] });
    const rows = await this.store.products(user.tenantId, ids);
    if (rows.length !== ids.length) throw new ValidationError('Choose active products as components', { components: ['Unknown or deleted product'] });
  }

  private async get(user: SessionUser, id: string) {
    const k = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!k) throw new NotFoundError('Kit not found');
    return k;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const k = await this.get(user, id);
    if (k.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this kit. Reload and try again.');
    return k;
  }
}

/** Same rule as productErrors / itemCompleteWhenLiveChk: company, class, cost and price above 0, price ≥ cost. */
const live = (l: { manufacturerId: string | null; productClassId: string | null }, cost: number, price: number) =>
  !!l.manufacturerId && !!l.productClassId && cost > 0 && price > 0 && price >= cost;
