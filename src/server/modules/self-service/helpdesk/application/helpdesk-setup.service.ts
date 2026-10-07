import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import type {
  HelpdeskCategory, HelpdeskCategoryCreate, HelpdeskCategoryUpdate, HelpdeskFaq, HelpdeskFaqCreate, HelpdeskFaqUpdate,
} from '../../../../../shared/self-service/helpdesk.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { assertCodeFree } from '../../../hr/domain/codes.js';
import { HelpdeskStore } from './helpdesk-store.js';

/** HR's helpdesk setup: the desks (category, SLA, routing keywords) and the "Quick answers" FAQs employees search. */
@Injectable()
export class HelpdeskSetupService {
  constructor(
    private readonly store: HelpdeskStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  categories(user: SessionUser) {
    return this.store.categories(user.tenantId);
  }

  faqs(user: SessionUser) {
    return this.store.faqs(user.tenantId);
  }

  mine(user: SessionUser) {
    return this.store.published(user.tenantId);
  }

  async createCategory(user: SessionUser, meta: RequestMeta, input: HelpdeskCategoryCreate): Promise<HelpdeskCategory> {
    assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'helpdesk category');
    await this.checkOwner(user, input.ownerEmployeeId);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCategory({ ...input, status: 'ACTIVE' }));
    return this.category(user, id);
  }

  async updateCategory(user: SessionUser, meta: RequestMeta, id: string, input: HelpdeskCategoryUpdate): Promise<HelpdeskCategory> {
    const c = await this.currentCategory(user, id, input.rowVersion);
    if (input.code && input.code !== c.code) assertCodeFree(await this.store.allCodes(user.tenantId), input.code, 'helpdesk category');
    if (input.ownerEmployeeId && input.ownerEmployeeId !== c.ownerEmployeeId) await this.checkOwner(user, input.ownerEmployeeId);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCategory({ ...input, id }));
    return this.category(user, id);
  }

  async setCategoryActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<HelpdeskCategory> {
    await this.currentCategory(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveCategory({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.category(user, id);
  }

  async deleteCategory(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.currentCategory(user, id, rowVersion);
    if (await this.store.categoryInUse(id)) {
      throw new ConflictError('FAQs or tickets use this helpdesk category. Deactivate it instead.', undefined, { code: 'HELPDESK_CATEGORY_IN_USE' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteCategory(user.tenantId, id, rowVersion));
  }

  private async checkOwner(user: SessionUser, id: string | null | undefined) {
    if (id && !(await this.store.activeEmployee(user.tenantId, id))) throw new ValidationError('Choose an active employee', { ownerEmployeeId: ['Unknown or exited employee'] });
  }

  async createFaq(user: SessionUser, meta: RequestMeta, input: HelpdeskFaqCreate): Promise<HelpdeskFaq> {
    await this.checkCategory(user, input.categoryId);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveFaq({ ...input }));
    return this.faq(user, id);
  }

  async updateFaq(user: SessionUser, meta: RequestMeta, id: string, input: HelpdeskFaqUpdate): Promise<HelpdeskFaq> {
    const f = await this.currentFaq(user, id, input.rowVersion);
    if (input.categoryId && input.categoryId !== f.category.id) await this.checkCategory(user, input.categoryId);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveFaq({ ...input, id }));
    return this.faq(user, id);
  }

  /** Publish / unpublish an answer (the FAQ's activate / deactivate). */
  async setFaqPublished(user: SessionUser, meta: RequestMeta, id: string, published: boolean, rowVersion: number): Promise<HelpdeskFaq> {
    await this.currentFaq(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveFaq({ id, rowVersion, isPublished: published }));
    return this.faq(user, id);
  }

  async deleteFaq(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.currentFaq(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteFaq(user.tenantId, id, rowVersion));
  }

  private async checkCategory(user: SessionUser, categoryId: string) {
    const c = (await this.store.categories(user.tenantId)).find((x) => x.id === categoryId);
    if (!c || c.status !== 'ACTIVE') throw new ValidationError('Choose an active desk', { categoryId: ['Unknown or inactive desk'] });
  }

  private async category(user: SessionUser, id: string) {
    const c = (await this.store.categories(user.tenantId)).find((x) => x.id === id);
    if (!c) throw new NotFoundError('Helpdesk category not found');
    return c;
  }

  private async currentCategory(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.category(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this helpdesk category. Reload and try again.');
    return c;
  }

  private async faq(user: SessionUser, id: string) {
    const f = (await this.store.faqs(user.tenantId)).find((x) => x.id === id);
    if (!f) throw new NotFoundError('FAQ not found');
    return f;
  }

  private async currentFaq(user: SessionUser, id: string, rowVersion: number) {
    const f = await this.faq(user, id);
    if (f.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this FAQ. Reload and try again.');
    return f;
  }
}
