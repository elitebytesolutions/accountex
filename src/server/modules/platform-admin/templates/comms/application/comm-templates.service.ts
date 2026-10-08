import { Injectable } from '@nestjs/common';
import {
  COMM_SAMPLE, COMM_VARIABLES, commSmsSegments, commTemplateErrors, renderTemplate, templateVariables,
  type AdminSession, type CommPreview, type CommPreviewInput, type CommTemplate, type CommTemplateCreate, type CommTemplateUpdate,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { CommTemplateStore } from './comm-template-store.js';

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const CONTENT = ['subjectEn', 'bodyEn', 'subjectUr', 'bodyUr'] as const;

/**
 * Communication templates (Operations › Support › Communications): English / Urdu lifecycle messages for email, SMS
 * and WhatsApp. A change to a subject or body raises `version`. Sending (and "Send a test") arrives with Phase 29.
 */
@Injectable()
export class CommTemplatesService {
  constructor(
    private readonly store: CommTemplateStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  async get(id: string): Promise<CommTemplate> {
    const t = (await this.store.list()).find((x) => x.id === id);
    if (!t) throw new NotFoundError('Template not found');
    return t;
  }

  async create(admin: AdminSession, meta: RequestMeta, input: CommTemplateCreate): Promise<CommTemplate> {
    await this.assertCodeFree(input.code, null);
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...defined(input), version: 1 }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: CommTemplateUpdate): Promise<CommTemplate> {
    const t = await this.current(id, input.rowVersion);
    const { rowVersion, ...rest } = input;
    const patch = defined(rest) as Partial<CommTemplateUpdate>;
    const e = commTemplateErrors({ ...t, ...patch });
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    if (patch.code && patch.code !== t.code) await this.assertCodeFree(patch.code, id);
    const contentChanged = CONTENT.some((f) => patch[f] !== undefined && patch[f] !== t[f]);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...patch, id, rowVersion, ...(contentChanged && { version: t.version + 1 }) }));
    return this.get(id);
  }

  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Messages or broadcasts were sent with this template. Deactivate it instead.', undefined, { code: 'COMM_TEMPLATE_IN_USE' });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.remove(id, rowVersion));
  }

  /** The saved template filled with sample values (or the given ones), with its SMS segment count. */
  async preview(id: string, input: CommPreviewInput): Promise<CommPreview> {
    const t = await this.get(id);
    const ur = input.lang === 'ur';
    if (ur && !t.bodyUr) throw new ValidationError('This template has no Urdu version yet.', { lang: ['No Urdu version'] });
    const subject = (ur ? t.subjectUr : t.subjectEn) ?? '';
    const body = (ur ? t.bodyUr : t.bodyEn) ?? '';
    const values = { ...COMM_SAMPLE[input.lang], ...input.values };
    const variables = templateVariables(`${subject}\n${body}`);
    const filled = renderTemplate(body, values);
    return {
      lang: input.lang, subject: renderTemplate(subject, values), body: filled, variables,
      unknownVariables: variables.filter((v) => !(COMM_VARIABLES as readonly string[]).includes(v)),
      smsSegments: commSmsSegments(filled, ur),
    };
  }

  private async assertCodeFree(code: string, id: string | null) {
    if ((await this.store.allCodes()).some((c) => c.id !== id && c.code === code)) {
      throw new ConflictError(`A template with code ${code} already exists.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const t = await this.get(id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
    return t;
  }
}
