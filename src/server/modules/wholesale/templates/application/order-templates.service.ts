import { Injectable } from '@nestjs/common';
import type { OrderTemplate, OrderTemplateInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { WholesaleStore } from '../../common/application/wholesale-store.js';

/** Order templates: named line sets (shared, or one user's / one shop's) merged into wholesale bills and bookings. */
@Injectable()
export class OrderTemplatesService {
  constructor(private readonly store: WholesaleStore, private readonly unitOfWork: UnitOfWork) {}

  list(user: SessionUser, customerId: string | null) {
    return this.store.listTemplates(user.tenantId, user.id, customerId);
  }

  async get(user: SessionUser, id: string): Promise<OrderTemplate> {
    const t = await this.store.getTemplate(user.tenantId, id);
    if (!t) throw new NotFoundError('Order template not found');
    return t;
  }

  async create(user: SessionUser, meta: RequestMeta, input: OrderTemplateInput) {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('orderTemplateAddUpdate', { ...this.payload(input), ownerUserId: user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: OrderTemplateInput & { rowVersion: number }) {
    const t = await this.get(user, id);
    if (t.rowVersion !== input.rowVersion) throw new ConcurrencyError('This template was changed. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('orderTemplateAddUpdate', { ...this.payload(input), id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async archive(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    await this.get(user, id);
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.archiveTemplate(user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This template was changed. Reload and try again.');
  }

  /** Lines in order, one per product (the same product twice adds up). */
  private payload(p: OrderTemplateInput) {
    const merged = new Map<string, { itemId: string; qtyCtn: number; qtyLoose: number }>();
    for (const l of p.lines) {
      const m = merged.get(l.itemId) ?? { itemId: l.itemId, qtyCtn: 0, qtyLoose: 0 };
      m.qtyCtn += Number(l.qtyCtn ?? 0);
      m.qtyLoose += Number(l.qtyLoose ?? 0);
      merged.set(l.itemId, m);
    }
    if (!merged.size) throw new ValidationError('Add at least one line', { lines: ['Add at least one line'] });
    return { name: p.name, customerId: p.customerId ?? null, isShared: p.isShared ?? true, status: 'ACTIVE', lines: [...merged.values()].map((l, i) => ({ ...l, lineNo: i + 1 })) };
  }
}
