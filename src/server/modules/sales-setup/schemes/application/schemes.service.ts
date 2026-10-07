import { Injectable } from '@nestjs/common';
import { schemeErrors, type Scheme, type SchemeCreate, type SchemeListQuery, type SchemeUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { SchemeStore } from './scheme-store.js';

const today = () => new Date().toISOString().slice(0, 10);
/** SC-001, SC-002…: one past the highest number ever used (deleted schemes included). */
export const nextSchemeCode = (codes: string[]) => `SC-${String(Math.max(0, ...codes.map((c) => Number(c.match(/^SC-(\d+)$/)?.[1] ?? 0))) + 1).padStart(3, '0')}`;
const TERMS = ['buyQty', 'freeQty', 'discountPct', 'discountAmount', 'minInvoiceAmount', 'minLineQty', 'bundlePrice', 'settlementDays'] as const;

/** Trade schemes with their products and audience. Applying them to invoices (usedCount, valueGiven) comes with Phase 21. */
@Injectable()
export class SchemesService {
  constructor(
    private readonly store: SchemeStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: SchemeListQuery) {
    return this.store.page(user.tenantId, q, today());
  }

  summary(user: SessionUser) {
    return this.store.summary(user.tenantId, today());
  }

  async get(user: SessionUser, id: string): Promise<Scheme> {
    const s = await this.store.get(user.tenantId, id);
    if (!s) throw new NotFoundError('Scheme not found');
    return s;
  }

  async create(user: SessionUser, meta: RequestMeta, input: SchemeCreate): Promise<Scheme> {
    await this.checkRefs(user, input);
    const data = this.clean(input);
    const id = await this.unitOfWork.run(actorContext(user, meta), async () =>
      this.store.save({ ...data, code: nextSchemeCode(await this.store.allCodes(user.tenantId)), isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: SchemeUpdate): Promise<Scheme> {
    const s = await this.current(user, id, input.rowVersion);
    const merged = {
      ...s, ...input,
      items: input.items ?? s.items.map((i) => ({ itemId: i.product.id, itemRole: i.itemRole, qty: i.qty })),
      eligibility: input.eligibility ?? s.eligibility.map((e) => ({
        customerGroupId: e.kind === 'GROUP' ? e.refId : null, customerId: e.kind === 'CUSTOMER' ? e.refId : null, priceTier: e.kind === 'TIER' ? e.refId : null, isExcluded: e.isExcluded,
      })),
    };
    const e = schemeErrors(merged);
    if (Object.keys(e).length) throw new ValidationError('This scheme type needs different terms. Check the highlighted fields.', Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])), { code: 'SCHEME_FIELDS' });
    await this.checkRefs(user, merged);
    const data = this.clean(merged);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      ...data, id, rowVersion: input.rowVersion,
      ...(input.items === undefined && { items: undefined }), ...(input.eligibility === undefined && { eligibility: undefined }),
    }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Scheme> {
    const s = await this.current(user, id, rowVersion);
    if (active && s.validTo < today()) throw new ValidationError('This scheme has ended. Extend its end date first.', { validTo: ['Already ended'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Documents have used this scheme. Deactivate it instead.', undefined, { code: 'SCHEME_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  /** Terms that don't belong to the type are cleared (the DB check accepts only the type's fields). */
  private clean<T extends { schemeType: string; appliesToAll?: boolean; eligibility?: unknown[] } & Partial<Record<(typeof TERMS)[number], number | null>>>(s: T) {
    const keep: Record<string, readonly string[]> = {
      FREE_GOODS: ['buyQty', 'freeQty'], INVOICE_DISCOUNT: ['minInvoiceAmount', 'discountPct', 'discountAmount'], BUNDLE_PRICE: ['bundlePrice'],
      LINE_DISCOUNT: ['discountPct', 'discountAmount', 'minLineQty'], SETTLEMENT: ['settlementDays', 'discountPct'], SERVICE: [],
    };
    const out: Record<string, unknown> = { ...s };
    for (const t of TERMS) if (!keep[s.schemeType]?.includes(t)) out[t] = null;
    for (const k of ['id', 'code', 'usedCount', 'valueGiven', 'rowVersion', 'isActive']) delete out[k];
    if (s.appliesToAll) out.eligibility = (s.eligibility as { isExcluded?: boolean }[] | undefined)?.filter((x) => x.isExcluded) ?? [];
    return out;
  }

  private async checkRefs(user: SessionUser, s: { items?: { itemId: string }[]; eligibility?: { customerGroupId?: string | null; customerId?: string | null; priceTier?: string | null }[] }) {
    if (!(await this.store.productsExist(user.tenantId, (s.items ?? []).map((i) => i.itemId)))) throw new ValidationError('Choose live products', { items: ['A product no longer exists'] });
    const el = s.eligibility ?? [];
    if (!(await this.store.groupsExist(user.tenantId, el.map((e) => e.customerGroupId).filter((x): x is string => !!x)))) throw new ValidationError('Choose existing customer groups', { eligibility: ['A group no longer exists'] });
    if (!(await this.store.customersExist(user.tenantId, el.map((e) => e.customerId).filter((x): x is string => !!x)))) throw new ValidationError('Choose existing customers', { eligibility: ['A customer no longer exists'] });
    const tiers = await this.store.tierCodes();
    if (el.some((e) => e.priceTier && !tiers.includes(e.priceTier))) throw new ValidationError('Choose a price tier', { eligibility: ['Unknown price tier'] });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this scheme. Reload and try again.');
    return s;
  }
}
