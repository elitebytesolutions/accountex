import { Injectable } from '@nestjs/common';
import { reorderSuggestion, type ReorderRule, type ReorderRuleCreate, type ReorderRuleUpdate, type ReorderSuggestion, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ReorderStore } from './reorder-store.js';

/** Reorder rules (one per product per warehouse; null = all warehouses) and the live reorder suggestions. */
@Injectable()
export class ReorderService {
  constructor(
    private readonly store: ReorderStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, itemId?: string) {
    return this.store.list(user.tenantId, itemId);
  }

  /** Products below their low level (or under the cover-alert days), with the cartons to order to reach the high level. */
  async suggestions(user: SessionUser): Promise<ReorderSuggestion[]> {
    const out: ReorderSuggestion[] = [];
    for (const r of await this.store.inputs(user.tenantId)) {
      const s = reorderSuggestion({ ...r, avgDaily: r.product.avgDaily, ctn: r.product.ctn });
      if (!s) continue;
      out.push({
        product: { id: r.product.id, sku: r.product.sku, name: r.product.name, ctn: r.product.ctn, uomCode: r.product.uomCode, cost: r.product.cost },
        supplier: r.supplier, warehouse: r.warehouse, onHand: r.onHand, lowLevel: r.lowLevel, highLevel: r.highLevel, avgDaily: r.product.avgDaily,
        coverDays: s.coverDays, suggestCartons: s.suggestCartons, suggestQty: s.suggestQty, value: Math.round(s.suggestQty * r.product.cost * 100) / 100,
      });
    }
    return out.sort((a, b) => (a.supplier?.name ?? '~').localeCompare(b.supplier?.name ?? '~') || a.product.name.localeCompare(b.product.name));
  }

  async create(user: SessionUser, meta: RequestMeta, input: ReorderRuleCreate): Promise<ReorderRule> {
    if (!(await this.store.productExists(user.tenantId, input.itemId))) throw new ValidationError('Choose a product', { itemId: ['Unknown product'] });
    await this.checkWarehouse(user, input.warehouseId);
    if ((await this.store.list(user.tenantId, input.itemId)).some((r) => (r.warehouse?.id ?? null) === input.warehouseId)) {
      throw new ConflictError('This product already has a rule for that warehouse.', { warehouseId: ['Already has a rule'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(input));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ReorderRuleUpdate): Promise<ReorderRule> {
    const r = await this.current(user, id, input.rowVersion);
    if (input.warehouseId !== undefined && input.warehouseId !== (r.warehouse?.id ?? null)) {
      await this.checkWarehouse(user, input.warehouseId);
      if ((await this.store.list(user.tenantId, r.product.id)).some((x) => x.id !== id && (x.warehouse?.id ?? null) === input.warehouseId)) {
        throw new ConflictError('This product already has a rule for that warehouse.', { warehouseId: ['Already has a rule'] }, { code: 'DB_UNIQUE_VIOLATION' });
      }
    }
    const low = input.lowLevel ?? r.lowLevel, high = input.highLevel ?? r.highLevel;
    if (low > high) throw new ValidationError('Low level is above the high level', { lowLevel: ['Low level is above the high level'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.delete(user.tenantId, id, rowVersion));
  }

  private async checkWarehouse(user: SessionUser, id: string | null) {
    if (id && !(await this.store.activeWarehouse(user.tenantId, id))) throw new ValidationError('Choose an active warehouse', { warehouseId: ['Unknown or inactive warehouse'] });
  }

  private async get(user: SessionUser, id: string) {
    const r = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!r) throw new NotFoundError('Reorder rule not found');
    return r;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
    return r;
  }
}
