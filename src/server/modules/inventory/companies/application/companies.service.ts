import { Injectable } from '@nestjs/common';
import type { ProductCompany, ProductCompanyCreate, ProductCompanyUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { CompanyStore } from './company-store.js';

/** Product companies / brands (manufacturers and principals products belong to). */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly store: CompanyStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId);
  }

  /** The next free CO-NN (deleted codes count as used). */
  async nextCode(user: SessionUser): Promise<string> {
    const used = new Set((await this.store.allCodes(user.tenantId)).map((c) => c.code));
    let n = 1;
    while (used.has(`CO-${String(n).padStart(2, '0')}`)) n++;
    return `CO-${String(n).padStart(2, '0')}`;
  }

  async create(user: SessionUser, meta: RequestMeta, input: ProductCompanyCreate): Promise<ProductCompany> {
    const code = input.code ?? (await this.nextCode(user));
    await this.checkCode(user, code);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, code }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: ProductCompanyUpdate): Promise<ProductCompany> {
    const c = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== c.code) await this.checkCode(user, input.code);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<ProductCompany> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Products belong to this company. Deactivate it instead.', undefined, { code: 'PRODUCT_COMPANY_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async checkCode(user: SessionUser, code: string) {
    const hit = (await this.store.allCodes(user.tenantId)).find((c) => c.code === code);
    if (!hit) return;
    throw hit.deleted
      ? new ConflictError(`Code ${code} belonged to a deleted company and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async get(user: SessionUser, id: string) {
    const c = (await this.store.list(user.tenantId)).find((x) => x.id === id);
    if (!c) throw new NotFoundError('Company not found');
    return c;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this company. Reload and try again.');
    return c;
  }
}
