import { Injectable } from '@nestjs/common';
import { assetCategoryErrors, type AssetCategory, type AssetCategoryCreate, type AssetCategoryUpdate, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../../treasury/gl-links/application/gl-links.js';
import { AssetCategoryStore } from './asset-category-store.js';

const fieldErrors = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]]));
type Accounts = { costAccountId: string; accumDepAccountId: string | null; depExpenseAccountId: string | null };

/** Fixed asset categories: depreciation defaults (method, yearly rate) and the three GL accounts assets post to. */
@Injectable()
export class AssetCategoriesService {
  constructor(
    private readonly store: AssetCategoryStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  async create(user: SessionUser, meta: RequestMeta, input: AssetCategoryCreate): Promise<AssetCategory> {
    await this.checkRetired(user, input.code);
    await this.checkAccounts(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, status: 'ACTIVE' }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: AssetCategoryUpdate): Promise<AssetCategory> {
    const c = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== c.code) await this.checkRetired(user, input.code);
    const merged = {
      defaultMethod: input.defaultMethod ?? c.defaultMethod,
      defaultRatePct: input.defaultRatePct !== undefined ? input.defaultRatePct : c.defaultRatePct,
      costAccountId: input.costAccountId ?? c.costAccount.id,
      accumDepAccountId: input.accumDepAccountId !== undefined ? input.accumDepAccountId : (c.accumDepAccount?.id ?? null),
      depExpenseAccountId: input.depExpenseAccountId !== undefined ? input.depExpenseAccountId : (c.depExpenseAccount?.id ?? null),
    };
    const errors = assetCategoryErrors(merged);
    if (Object.keys(errors).length) throw new ValidationError('Check the highlighted fields', fieldErrors(errors));
    await this.checkAccounts(user, merged);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<AssetCategory> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Assets use this category. Deactivate it instead.', undefined, { code: 'ASSET_CATEGORY_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  /** Cost and accumulated depreciation are asset accounts (class 1); depreciation expense is an expense account (class 5). */
  private async checkAccounts(user: SessionUser, a: Accounts) {
    await this.gl.postable(user, a.costAccountId, 'costAccountId', [1]);
    if (a.accumDepAccountId) await this.gl.postable(user, a.accumDepAccountId, 'accumDepAccountId', [1]);
    if (a.depExpenseAccountId) await this.gl.postable(user, a.depExpenseAccountId, 'depExpenseAccountId', [5]);
  }

  private async checkRetired(user: SessionUser, code: string) {
    if ((await this.store.retiredCodes(user.tenantId)).includes(code)) {
      throw new ConflictError(`Code ${code} belonged to a deleted category and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' });
    }
  }

  private async get(user: SessionUser, id: string) {
    const c = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!c) throw new NotFoundError('Asset category not found');
    return c;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this category. Reload and try again.');
    return c;
  }
}
