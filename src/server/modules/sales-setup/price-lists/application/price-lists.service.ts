import { Injectable } from '@nestjs/common';
import {
  breakFor, roundTo, type PriceList, type PriceListBulk, type PriceListCopy, type PriceListCreate, type PriceListRowsQuery, type PriceListUpdate,
  type PriceResolution, type PriceResolveQuery, type QuantityBreaksQuery, type QuantityBreaksSave, type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PriceListStore, type PriceListPage } from './price-list-store.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Price lists (dated prices per product), their quantity breaks, and the price a customer pays. */
@Injectable()
export class PriceListsService {
  constructor(
    private readonly store: PriceListStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: PriceListPage) {
    return this.store.page(user.tenantId, q, today());
  }

  async get(user: SessionUser, id: string): Promise<PriceList> {
    const l = await this.store.get(user.tenantId, id, today());
    if (!l) throw new NotFoundError('Price list not found');
    return l;
  }

  async rows(user: SessionUser, id: string, q: PriceListRowsQuery) {
    await this.get(user, id);
    return this.store.rows(user.tenantId, id, q, q.date ?? today());
  }

  async create(user: SessionUser, meta: RequestMeta, input: PriceListCreate): Promise<PriceList> {
    await this.checkCode(user, input.code);
    if (!(await this.store.activeCurrency(input.currencyCode))) throw new ValidationError('Choose a currency', { currencyCode: ['Unknown currency'] });
    const { fill, copyFromId, ...header } = input;
    const source = fill === 'COPY' ? await this.get(user, copyFromId!) : null;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isDefault) await this.clearDefault(user.tenantId);
      const lid = await this.store.save({ ...header, status: 'ACTIVE' });
      if (source) await this.store.upsertItems({ priceListId: lid, effectiveFrom: today(), items: [...(await this.store.currentPrices(user.tenantId, source.id, today()))].map(([itemId, price]) => ({ itemId, price })) });
      if (fill === 'MARKUP') await this.store.upsertItems({ priceListId: lid, effectiveFrom: today(), items: await this.markupPrices(user, input.markupPct!, input.roundingTo) });
      return lid;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: PriceListUpdate): Promise<PriceList> {
    const l = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== l.code) await this.checkCode(user, input.code);
    if (input.currencyCode && !(await this.store.activeCurrency(input.currencyCode))) throw new ValidationError('Choose a currency', { currencyCode: ['Unknown currency'] });
    const from = input.validFrom !== undefined ? input.validFrom : l.validFrom, to = input.validTo !== undefined ? input.validTo : l.validTo;
    if (from && to && to < from) throw new ValidationError('Ends before it starts', { validTo: ['Ends before it starts'] });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isDefault && !l.isDefault) await this.clearDefault(user.tenantId, id);
      await this.store.save({ ...input, id });
    });
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<PriceList> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  /** Saves changed prices, or reprices every product at cost + markup (also stored as the list's markup), from a date. */
  async bulk(user: SessionUser, meta: RequestMeta, id: string, input: PriceListBulk) {
    const l = await this.get(user, id);
    const effectiveFrom = input.effectiveFrom ?? today();
    const items = input.markupPct !== undefined ? await this.markupPrices(user, input.markupPct, l.roundingTo) : input.items!;
    for (const i of input.markupPct !== undefined ? [] : items) if (!(await this.store.productExists(user.tenantId, i.itemId))) throw new ValidationError('Unknown product', { items: ['A product no longer exists'] });
    const saved = await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.markupPct !== undefined && input.markupPct !== l.markupPct) await this.store.save({ id, markupPct: input.markupPct });
      return this.store.upsertItems({ priceListId: id, effectiveFrom, items });
    });
    return { saved, effectiveFrom };
  }

  async copy(user: SessionUser, meta: RequestMeta, id: string, input: PriceListCopy): Promise<PriceList> {
    const l = await this.get(user, id);
    return this.create(user, meta, {
      code: input.code, name: input.name, markupPct: l.markupPct, roundingTo: l.roundingTo, isDefault: false, currencyCode: l.currencyCode,
      validFrom: l.validFrom, validTo: l.validTo, remarks: l.remarks, fill: 'COPY', copyFromId: id,
    });
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Customer groups, customers or documents use this price list. Deactivate it instead.', undefined, { code: 'PRICE_LIST_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- quantity breaks
  async breaks(user: SessionUser, q: QuantityBreaksQuery) {
    const listId = q.priceList || null;
    if (listId) await this.get(user, listId);
    return this.store.breaks(user.tenantId, listId, q.product);
  }

  async breakItems(user: SessionUser, priceList: string | undefined) {
    if (priceList) await this.get(user, priceList);
    return this.store.breakItems(user.tenantId, priceList || null);
  }

  async saveBreaks(user: SessionUser, meta: RequestMeta, input: QuantityBreaksSave) {
    if (input.priceListId) await this.get(user, input.priceListId);
    if (!(await this.store.productExists(user.tenantId, input.itemId))) throw new ValidationError('Choose a product', { itemId: ['Unknown product'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.replaceBreaks(input));
    return this.store.breaks(user.tenantId, input.priceListId, input.itemId);
  }

  // ---------------------------------------------------------------- price lookup
  /**
   * The customer's own list, else their group's, else the default list (each only while active and in its date window);
   * the list's price in force on the date, else the product's retail price; then the quantity break for the quantity
   * (the list's slabs, else the slabs for every list).
   */
  async resolve(user: SessionUser, q: PriceResolveQuery): Promise<PriceResolution> {
    const date = q.date ?? today();
    const inp = await this.store.resolveInputs(user.tenantId, q.customer, q.product);
    if (!inp) throw new NotFoundError(q.customer ? 'Customer or product not found' : 'Product not found');
    const usable = (id: string | null) => {
      const l = id ? inp.lists.find((x) => x.id === id) : null;
      return l && l.status === 'ACTIVE' && (!l.validFrom || l.validFrom <= date) && (!l.validTo || l.validTo >= date) ? l : null;
    };
    const candidates: [string | null, PriceResolution['listFrom']][] = [[inp.customer?.priceListId ?? null, 'CUSTOMER'], [inp.customer?.groupListId ?? null, 'GROUP'], [inp.defaultListId, 'DEFAULT']];
    const [list, listFrom] = candidates.map(([id, from]) => [usable(id), from] as const).find(([l]) => l) ?? [null, 'NONE' as const];
    const listPrice = list ? (await this.store.currentPrices(user.tenantId, list.id, date)).get(q.product) : undefined;
    const basePrice = listPrice ?? inp.productPrice;
    const slabs = list ? await this.store.breaks(user.tenantId, list.id, q.product) : [];
    const hit = breakFor(slabs.length ? slabs : await this.store.breaks(user.tenantId, null, q.product), q.qty);
    return {
      priceList: list ? { id: list.id, code: list.code, name: list.name } : null, listFrom,
      basePrice, price: hit ? hit.unitPrice : basePrice, source: hit ? 'BREAK' : listPrice !== undefined ? 'LIST' : 'PRODUCT', tierNo: hit?.tierNo ?? null,
    };
  }

  private async markupPrices(user: SessionUser, markupPct: number, rounding: number) {
    return (await this.store.productCosts(user.tenantId)).filter((p) => p.cost > 0).map((p) => ({ itemId: p.id, price: roundTo(p.cost * (1 + markupPct / 100), rounding) }));
  }

  /** Inside the unit of work: the previous default stops being the default (one default per company). */
  private async clearDefault(tenantId: string, exceptId?: string) {
    for (const d of await this.store.defaultIds(tenantId)) if (d.id !== exceptId) await this.store.save({ id: d.id, isDefault: false });
  }

  private async checkCode(user: SessionUser, code: string) {
    const hit = (await this.store.allCodes(user.tenantId)).find((c) => c.code === code);
    if (!hit) return;
    throw hit.deleted
      ? new ConflictError(`Code ${code} belonged to a deleted price list and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const l = await this.get(user, id);
    if (l.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this price list. Reload and try again.');
    return l;
  }
}
