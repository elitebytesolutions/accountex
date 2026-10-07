import { Injectable } from '@nestjs/common';
import { sodConflicts, type SessionUser, type SodRule, type SodRuleCreate, type SodRuleUpdate } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { SodRuleStore } from './sod-rule-store.js';

/** Segregation-of-duties rules (Company.SegregationOfDutiesRules) and the check roles must pass. */
@Injectable()
export class SodRulesService {
  constructor(
    private readonly store: SodRuleStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  /** Refuses a role whose grants break a BLOCK rule (the Admin role is never blocked). */
  async assertRoleAllowed(tenantId: string, permissions: string[], isAdmin: boolean) {
    const blocked = sodConflicts(permissions, await this.store.list(tenantId), isAdmin).filter((c) => c.severity === 'BLOCK');
    if (blocked.length) {
      throw new ValidationError(`Blocked by segregation of duties: ${blocked.map((c) => c.title).join('; ')}`, { permissions: blocked.map((c) => `${c.title}: remove ${c.code}`) }, { code: 'SOD_CONFLICT_BLOCKED' });
    }
  }

  async create(user: SessionUser, meta: RequestMeta, input: SodRuleCreate): Promise<SodRule> {
    if ((await this.store.retiredCodes(user.tenantId)).includes(input.code)) {
      throw new ConflictError(`Code ${input.code} belonged to a deleted rule and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
    await this.checkPermissions(input.permissionA, input.permissionB);
    // Rules added by a company are CUSTOM; the standard kinds belong to the seeded rules.
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, kind: 'CUSTOM', isActive: true }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: SodRuleUpdate): Promise<SodRule> {
    const r = await this.current(user, id, input.rowVersion);
    // The kind is fixed: standard kinds belong to the seeded rules, company rules stay CUSTOM.
    const changes: Omit<SodRuleUpdate, 'kind'> = { ...input };
    delete (changes as Partial<SodRuleUpdate>).kind;
    if (r.isStandard && ((changes.permissionA && changes.permissionA !== r.permissionA) || (changes.permissionB && changes.permissionB !== r.permissionB) || (changes.code && changes.code !== r.code))) {
      throw new ValidationError('Standard rules keep their code and permissions', { permissionA: ['Standard rule'] });
    }
    const a = changes.permissionA ?? r.permissionA, b = changes.permissionB ?? r.permissionB;
    if (a === b) throw new ValidationError('Choose two different permissions', { permissionB: ['Choose two different permissions'] });
    await this.checkPermissions(a, b);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...changes, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, isActive: boolean, rowVersion: number): Promise<SodRule> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const r = await this.current(user, id, rowVersion);
    if (r.isStandard) throw new ConflictError('Standard segregation-of-duties rules can be deactivated, not deleted.', undefined, { code: 'SOD_RULE_SEEDED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.delete(user.tenantId, id, rowVersion));
  }

  private async checkPermissions(a: string, b: string) {
    const known = await this.store.knownPermissions();
    const bad = [a, b].filter((p) => !known.has(p));
    if (bad.length) throw new ValidationError('Unknown permissions', { permissionA: bad });
  }

  private async get(user: SessionUser, id: string) {
    const r = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!r) throw new NotFoundError('Rule not found');
    return r;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
    return r;
  }
}
