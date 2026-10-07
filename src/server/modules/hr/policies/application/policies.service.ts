import { Injectable } from '@nestjs/common';
import { nextPolicyVersion, type CompanyPolicy, type CompanyPolicyCreate, type CompanyPolicyUpdate, type SessionUser, type TalentListQuery } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { PolicyStore } from './policy-store.js';

const immutable = (p: CompanyPolicy) => new ConflictError(
  p.status === 'PUBLISHED' ? 'A published policy can\'t be changed. Create a new version, or retire it.' : 'A retired policy can\'t be changed. Create a new version instead.',
  undefined, { code: 'POLICY_PUBLISHED_IMMUTABLE' });
/** Numeric order of versions ("2.1" < "10"). */
const versionKey = (v: string) => { const [a, b] = v.split('.'); return (Number(a) || 0) * 1000 + (Number(b) || 0); };

/**
 * Company policies, versioned by code: a DRAFT version is edited, then published (the code's previous published version
 * is retired in the same transaction); a published version never changes (DB trigger) except to be retired.
 * Acknowledgements are never sent from here (Phase 34).
 */
@Injectable()
export class PoliciesService {
  constructor(
    private readonly store: PolicyStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: TalentListQuery) {
    return this.store.page(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<CompanyPolicy> {
    const p = await this.store.get(user.tenantId, id);
    if (!p) throw new NotFoundError('Policy not found');
    return p;
  }

  async create(user: SessionUser, meta: RequestMeta, input: CompanyPolicyCreate): Promise<CompanyPolicy> {
    await this.assertVersionFree(user, input.code, input.version, null);
    await this.checkOwner(user, input.ownerEmployeeId);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, status: 'DRAFT' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: CompanyPolicyUpdate): Promise<CompanyPolicy> {
    const p = await this.current(user, id, input.rowVersion);
    if (p.status !== 'DRAFT') throw immutable(p);
    if (input.code && input.code !== p.code && p.supersedes) throw new ValidationError('A new version keeps its policy\'s code', { code: ['Fixed for a new version'] });
    const code = input.code ?? p.code, version = input.version ?? p.version;
    if (code !== p.code || version !== p.version) await this.assertVersionFree(user, code, version, id);
    if (input.ownerEmployeeId && input.ownerEmployeeId !== p.owner?.id) await this.checkOwner(user, input.ownerEmployeeId);
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...patch, id }));
    return this.get(user, id);
  }

  /** Publishes a draft; the code's currently published version is retired in the same transaction. */
  async publish(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<CompanyPolicy> {
    const p = await this.current(user, id, rowVersion);
    if (p.status !== 'DRAFT') throw immutable(p);
    if (!p.body?.trim()) throw new ValidationError('Write the policy text before publishing', { body: ['Required to publish'] });
    const live = (await this.store.versions(user.tenantId, p.code)).filter((v) => v.status === 'PUBLISHED' && !v.deleted && v.id !== id);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const v of live) await this.store.save({ id: v.id, status: 'RETIRED' });
      await this.store.save({ id, rowVersion, status: 'PUBLISHED', publishedAt: new Date().toISOString() });
    });
    return this.get(user, id);
  }

  /** A DRAFT copy of this version with the next version number, superseding it. */
  async newVersion(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<CompanyPolicy> {
    const p = await this.current(user, id, rowVersion);
    if (p.status === 'DRAFT') throw new ValidationError('This version is still a draft: edit it instead', { status: ['Draft'] });
    const versions = await this.store.versions(user.tenantId, p.code);
    const draft = versions.find((v) => v.status === 'DRAFT' && !v.deleted);
    if (draft) throw new ValidationError(`Version ${draft.version} of ${p.code} is already a draft: edit it instead`, { status: ['Draft exists'] });
    const taken = new Set(versions.map((v) => v.version));
    let version = nextPolicyVersion(versions.map((v) => v.version).sort((a, b) => versionKey(b) - versionKey(a))[0] ?? p.version);
    while (taken.has(version)) version = nextPolicyVersion(version);
    const today = new Date().toISOString().slice(0, 10);
    const newId = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({
      code: p.code, title: p.title, version, category: p.category, effectiveDate: p.effectiveDate > today ? p.effectiveDate : today,
      ownerEmployeeId: p.owner?.id ?? null, body: p.body, readMinutes: p.readMinutes, attachmentId: p.attachmentId,
      requiresAcknowledgement: p.requiresAcknowledgement, supersedesPolicyId: p.id, status: 'DRAFT',
    }));
    return this.get(user, newId);
  }

  async retire(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<CompanyPolicy> {
    const p = await this.current(user, id, rowVersion);
    if (p.status !== 'PUBLISHED') throw new ValidationError('Only a published version can be retired', { status: ['Not published'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: 'RETIRED' }));
    return this.get(user, id);
  }

  /** Only a draft can be deleted (soft delete), and only when nothing refers to it. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const p = await this.current(user, id, rowVersion);
    if (p.status !== 'DRAFT') throw immutable(p);
    if (await this.store.inUse(id)) throw new ConflictError('Acknowledgements, announcements or later versions refer to this policy. Retire it instead.', undefined, { code: 'POLICY_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkOwner(user: SessionUser, id: string | null | undefined) {
    if (id && !(await this.store.activeEmployee(user.tenantId, id))) throw new ValidationError('Choose an active employee', { ownerEmployeeId: ['Unknown or exited employee'] });
  }

  private async assertVersionFree(user: SessionUser, code: string, version: string, id: string | null) {
    const hit = (await this.store.versions(user.tenantId, code)).find((v) => v.id !== id && v.version === version);
    if (hit) {
      throw new ConflictError(hit.deleted ? `Version ${version} of ${code} was deleted and can't be reused.` : `${code} already has a version ${version}.`,
        { version: ['Already used for this code'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const p = await this.get(user, id);
    if (p.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this policy. Reload and try again.');
    return p;
  }
}
