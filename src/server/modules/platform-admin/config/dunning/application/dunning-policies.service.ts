import { Injectable } from '@nestjs/common';
import type { AdminSession, DunningPolicy, DunningPolicyCreate, DunningPolicyUpdate } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { dayOrderErrors, type PolicyTimeline } from '../domain/dunning-policy.rules.js';
import { DunningPolicyStore } from './dunning-policy-store.js';

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Dunning policies (Super Admin › Billing › Dunning & Collections, policy panels). One policy is active at a time;
 * activating one deactivates the other in the same transaction. Dunning cases (Phase 41) follow the active policy.
 */
@Injectable()
export class DunningPoliciesService {
  constructor(
    private readonly store: DunningPolicyStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  async get(id: string): Promise<DunningPolicy> {
    const p = await this.store.get(id);
    if (!p) throw new NotFoundError('Dunning policy not found');
    return p;
  }

  /** The first policy becomes the active one; later ones start inactive until activated. */
  async create(admin: AdminSession, meta: RequestMeta, input: DunningPolicyCreate): Promise<DunningPolicy> {
    this.assertDayOrder(input);
    const isActive = (await this.store.list()).length === 0;
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...input, isActive }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: DunningPolicyUpdate): Promise<DunningPolicy> {
    const p = await this.current(id, input.rowVersion);
    const { rowVersion, ...rest } = input;
    const patch = defined(rest);
    this.assertDayOrder({ ...p, ...patch } as PolicyTimeline);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...patch, id, rowVersion }));
    return this.get(id);
  }

  async activate(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<DunningPolicy> {
    const p = await this.current(id, rowVersion);
    if (p.isActive) return p;
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.deactivateOthers(id);
      await this.store.save({ id, rowVersion, isActive: true });
    });
    return this.get(id);
  }

  /** Only an inactive policy that no dunning case follows. */
  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const p = await this.current(id, rowVersion);
    if (p.isActive || p.casesCount > 0) {
      throw new ConflictError(p.isActive ? 'This is the active policy. Activate another policy first.' : 'Dunning cases follow this policy, so it can\'t be deleted.',
        undefined, { code: 'DUNNING_POLICY_IN_USE' });
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.remove(id, rowVersion));
  }

  private assertDayOrder(p: PolicyTimeline) {
    const e = dayOrderErrors(p);
    if (Object.keys(e).length) {
      throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])), { code: 'DUNNING_POLICY_DAY_ORDER' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const p = await this.get(id);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this policy. Reload and try again.');
    return p;
  }
}
