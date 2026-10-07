import { Injectable } from '@nestjs/common';
import {
  fillPlaceholders, ruleErrors, smsSegments, type ReminderPreview, type ReminderPreviewInput, type ReminderRule, type ReminderRuleCreate, type ReminderRuleUpdate,
  type ReminderTemplate, type ReminderTemplateCreate, type ReminderTemplateUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { ReminderStore } from './reminder-store.js';

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Payment-reminder messages and the schedule. Sending, the sent log and credit holds come with receivables (later phases). */
@Injectable()
export class RemindersService {
  constructor(
    private readonly store: ReminderStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // ---------------------------------------------------------------- templates
  templates(user: SessionUser) {
    return this.store.templates(user.tenantId);
  }

  async createTemplate(user: SessionUser, meta: RequestMeta, input: ReminderTemplateCreate): Promise<ReminderTemplate> {
    await this.checkCode(user, input.code);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveTemplate(input));
    return this.template(user, id);
  }

  async updateTemplate(user: SessionUser, meta: RequestMeta, id: string, input: ReminderTemplateUpdate): Promise<ReminderTemplate> {
    const t = await this.template(user, id);
    if (t.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this message. Reload and try again.');
    if (input.code && input.code !== t.code) await this.checkCode(user, input.code);
    if (input.isActive === false && t.ruleCount > 0 && (await this.store.rules(user.tenantId)).some((r) => r.template.id === id && r.isActive)) {
      throw new ValidationError('Active rules send this message. Switch them to another message first.', { isActive: ['Used by active rules'] });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveTemplate({ ...input, id }));
    return this.template(user, id);
  }

  async deleteTemplate(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const t = await this.template(user, id);
    if (t.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this message. Reload and try again.');
    if (await this.store.templateInUse(id)) throw new ConflictError('Reminder rules or sent reminders use this message. Deactivate it instead.', undefined, { code: 'REMINDER_TEMPLATE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteTemplate(user.tenantId, id, rowVersion));
  }

  /** The message as a customer would receive it, with sample invoice values (real ones once invoices exist). */
  async preview(user: SessionUser, id: string, input: ReminderPreviewInput): Promise<ReminderPreview> {
    const t = await this.template(user, id);
    const names = await this.store.previewNames(user.tenantId, input.customerId ?? null);
    const due = new Date(Date.now() + 3 * 864e5);
    const values = {
      customer: names.customer ?? 'City Mart Superstores', invoice: `INV-${due.getUTCFullYear()}-000874`, amount: 'Rs 318,290', due_date: fmtDate(due), company: names.company,
    };
    const body = input.language === 'ur' && t.bodyUr ? t.bodyUr : t.bodyEn;
    const text = fillPlaceholders(body, values);
    return { text, subject: input.channel === 'EMAIL' && t.emailSubject ? fillPlaceholders(t.emailSubject, values) : null, segments: smsSegments(text), values };
  }

  // ---------------------------------------------------------------- rules
  rules(user: SessionUser) {
    return this.store.rules(user.tenantId);
  }

  async createRule(user: SessionUser, meta: RequestMeta, input: ReminderRuleCreate): Promise<ReminderRule> {
    await this.checkRule(user, input);
    if ((await this.store.rules(user.tenantId)).some((r) => r.offsetDays === input.offsetDays)) {
      throw new ConflictError('A rule already runs on that day.', { offsetDays: ['Already has a rule'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveRule(input));
    return this.rule(user, id);
  }

  async updateRule(user: SessionUser, meta: RequestMeta, id: string, input: ReminderRuleUpdate): Promise<ReminderRule> {
    const r = await this.rule(user, id);
    if (r.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
    const merged = { ...r, templateId: r.template.id, escalateToUserId: r.escalateTo?.id ?? null, ...input };
    const e = ruleErrors(merged);
    if (Object.keys(e).length) throw new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, v]) => [k, [v]])));
    await this.checkRule(user, merged);
    if (input.offsetDays !== undefined && input.offsetDays !== r.offsetDays && (await this.store.rules(user.tenantId)).some((x) => x.id !== id && x.offsetDays === input.offsetDays)) {
      throw new ConflictError('A rule already runs on that day.', { offsetDays: ['Already has a rule'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveRule({ ...input, id, ...(input.escalate === false && { escalateToUserId: null }) }));
    return this.rule(user, id);
  }

  async setRuleActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<ReminderRule> {
    const r = await this.rule(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveRule({ id, rowVersion, isActive: active }));
    return this.rule(user, id);
  }

  async deleteRule(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const r = await this.rule(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
    if (await this.store.ruleInUse(id)) throw new ConflictError('Reminders have been sent with this rule. Pause it instead.', undefined, { code: 'REMINDER_RULE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteRule(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- helpers
  private async checkRule(user: SessionUser, r: { templateId?: string; escalateToUserId?: string | null; dunningLevel?: string; action?: string }) {
    if (r.templateId) {
      const t = (await this.store.templates(user.tenantId)).find((x) => x.id === r.templateId);
      if (!t || !t.isActive) throw new ValidationError('Choose an active message', { templateId: ['Unknown or inactive message'] });
    }
    if (r.escalateToUserId && !(await this.store.activeUser(user.tenantId, r.escalateToUserId))) throw new ValidationError('Choose an active user', { escalateToUserId: ['Unknown or inactive user'] });
    if (r.dunningLevel && !(await this.store.lookupCodes('DunningLevel')).includes(r.dunningLevel)) throw new ValidationError('Choose a level', { dunningLevel: ['Unknown level'] });
    if (r.action && !(await this.store.lookupCodes('PaymentReminderRuleAction')).includes(r.action)) throw new ValidationError('Choose an action', { action: ['Unknown action'] });
  }

  private async checkCode(user: SessionUser, code: string) {
    const hit = (await this.store.templateCodes(user.tenantId)).find((c) => c.code === code);
    if (!hit) return;
    throw hit.deleted
      ? new ConflictError(`Code ${code} belonged to a deleted message and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async template(user: SessionUser, id: string) {
    const t = (await this.store.templates(user.tenantId)).find((x) => x.id === id);
    if (!t) throw new NotFoundError('Reminder message not found');
    return t;
  }

  private async rule(user: SessionUser, id: string) {
    const r = (await this.store.rules(user.tenantId)).find((x) => x.id === id);
    if (!r) throw new NotFoundError('Reminder rule not found');
    return r;
  }
}
