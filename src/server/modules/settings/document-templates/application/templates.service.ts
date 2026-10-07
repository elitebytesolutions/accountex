import { Injectable } from '@nestjs/common';
import type { DocumentTemplate, DocumentTemplateSave, DocumentTemplateUpdate, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError } from '../../../../core/domain/errors.js';
import { TemplateStore } from './template-store.js';

/** Settings › Document Templates. One default per category / document type / letter kind (database rule). */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly store: TemplateStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser): Promise<DocumentTemplate[]> {
    return this.store.list(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<DocumentTemplate> {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw new NotFoundError('Template not found');
    return t;
  }

  async create(user: SessionUser, meta: RequestMeta, input: DocumentTemplateSave): Promise<DocumentTemplate> {
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(input));
    return this.get(user, id);
  }

  /** Every saved change is a new version of the layout. */
  async update(user: SessionUser, meta: RequestMeta, id: string, input: DocumentTemplateUpdate): Promise<DocumentTemplate> {
    const t = await this.current(user, id, input.rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id, version: t.version + 1 }));
    return this.get(user, id);
  }

  async setDefault(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<DocumentTemplate> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setDefault(id));
    return this.get(user, id);
  }

  /** The database keeps the default template active (DOC_TEMPLATE_DEFAULT_LOCKED). */
  async setStatus(user: SessionUser, meta: RequestMeta, id: string, status: 'ACTIVE' | 'ARCHIVED', rowVersion: number): Promise<DocumentTemplate> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setStatus(id, rowVersion, status));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(id, rowVersion));
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.get(user, id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
    return t;
  }
}
