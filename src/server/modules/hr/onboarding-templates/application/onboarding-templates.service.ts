import { Injectable } from '@nestjs/common';
import type { OnboardingTaskInput, OnboardingTemplate, OnboardingTemplateCreate, OnboardingTemplateUpdate, SessionUser, TalentListQuery } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { OnboardingTemplateStore } from './onboarding-template-store.js';

/** Tasks in the order given; existing rows keep their id (the save function syncs the set). */
const taskRows = (tasks: OnboardingTaskInput[]) => tasks.map((t, i) => ({ ...t, sortOrder: i + 1 }));

/** Onboarding checklist templates: tasks grouped and ordered, one default template per track. Onboardings copy them (Phase 31). */
@Injectable()
export class OnboardingTemplatesService {
  constructor(
    private readonly store: OnboardingTemplateStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: TalentListQuery) {
    return this.store.page(user.tenantId, q);
  }

  async get(user: SessionUser, id: string): Promise<OnboardingTemplate> {
    const t = await this.store.get(user.tenantId, id);
    if (!t) throw new NotFoundError('Onboarding template not found');
    return t;
  }

  async create(user: SessionUser, meta: RequestMeta, input: OnboardingTemplateCreate): Promise<OnboardingTemplate> {
    await this.assertNameFree(user, input.name, null);
    const first = (await this.store.defaults(user.tenantId, input.track)).length === 0;
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.save({ name: input.name, track: input.track, isDefault: first, isActive: true, tasks: taskRows(input.tasks) }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: OnboardingTemplateUpdate): Promise<OnboardingTemplate> {
    const t = await this.current(user, id, input.rowVersion);
    if (input.name && input.name !== t.name) await this.assertNameFree(user, input.name, id);
    const data: Record<string, unknown> = { id, rowVersion: input.rowVersion };
    if (input.name !== undefined) data.name = input.name;
    if (input.track !== undefined && input.track !== t.track) {
      data.track = input.track;
      // The default of one track can't stay the default when moved into a track that already has one.
      if (t.isDefault && (await this.store.defaults(user.tenantId, input.track)).length) data.isDefault = false;
    }
    if (input.tasks !== undefined) data.tasks = taskRows(input.tasks);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(data));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<OnboardingTemplate> {
    const t = await this.current(user, id, rowVersion);
    if (!active && t.isDefault) throw new ValidationError('This is the default template. Make another template the default first.', { isDefault: ['Default template'] });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, isActive: active }));
    return this.get(user, id);
  }

  /** The default of its track (new onboardings start from it); the track's previous default stops being the default. */
  async makeDefault(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<OnboardingTemplate> {
    const t = await this.current(user, id, rowVersion);
    if (!t.isActive) throw new ValidationError('Activate the template first', { isActive: ['Inactive template'] });
    const others = (await this.store.defaults(user.tenantId, t.track)).filter((x) => x.id !== id);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      for (const o of others) await this.store.save({ id: o.id, isDefault: false });
      await this.store.save({ id, rowVersion, isDefault: true });
    });
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Onboardings were started from this template. Deactivate it instead.', undefined, { code: 'ONBOARDING_TEMPLATE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  private async assertNameFree(user: SessionUser, name: string, id: string | null) {
    const hit = (await this.store.allNames(user.tenantId)).find((n) => n.id !== id && n.name.toLowerCase() === name.toLowerCase());
    if (hit) {
      throw new ConflictError(hit.deleted ? `${name} belonged to a deleted template and can't be reused.` : `A template named ${name} already exists.`,
        { name: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const t = await this.get(user, id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
    return t;
  }
}
