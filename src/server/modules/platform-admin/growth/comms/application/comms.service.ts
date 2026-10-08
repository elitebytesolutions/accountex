import { Injectable } from '@nestjs/common';
import {
  COMM_LOG_RETRYABLE, SMS_SEGMENT_COST, commSmsSegments, renderTemplate,
  type AdminSession, type BroadcastInput, type BroadcastResult, type CommLog, type CommLogList, type CommLogQuery,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { CommStore, type BroadcastCompany, type NewCommLog } from './comm-store.js';

const audienceError = (message: string, field = 'audience') => new ValidationError(message, { [field]: [message] }, { code: 'BROADCAST_AUDIENCE_INVALID' });

/** The {{variables}} a broadcast can fill for one company (the rest stay as written). */
const valuesFor = (c: BroadcastCompany) => ({
  owner_name: c.ownerName ?? c.name, tenant_name: c.name, plan: c.planName ?? '', login_url: `${c.code}.accountex.pk`,
});

/**
 * Broadcasts and the communication log (Super Admin › Communications). A broadcast resolves its audience, renders the
 * template (or override) per company and language, and writes one log row per company and channel: IN_APP is
 * delivered now as notifications to the company's admins, EMAIL / SMS / WHATSAPP are QUEUED until delivery exists
 * (Phase 29). Logs are append-only; a retry writes a new row pointing at the original.
 */
@Injectable()
export class CommsService {
  constructor(
    private readonly store: CommStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  logs(q: CommLogQuery): Promise<CommLogList> {
    return this.store.listLogs(q);
  }

  async broadcast(admin: AdminSession, meta: RequestMeta, input: BroadcastInput): Promise<BroadcastResult> {
    const tpl = input.commTemplateId ? await this.store.template(input.commTemplateId) : null;
    if (input.commTemplateId && (!tpl || !tpl.isActive)) {
      throw new ValidationError('Choose an active template or write a message.', { commTemplateId: ['Unknown or inactive template'] }, { code: 'BROADCAST_TEMPLATE_INVALID' });
    }
    if (!tpl && !input.messageOverride) {
      throw new ValidationError('Choose an active template or write a message.', { messageOverride: ['Write the message'] }, { code: 'BROADCAST_TEMPLATE_INVALID' });
    }
    const companies = await this.store.resolveAudience(input);
    if (!companies.length) throw audienceError('This audience has no companies to send to.');

    // one message per company and channel; a company without an address for a channel is skipped for it
    const messages: (NewCommLog & { company: BroadcastCompany })[] = [];
    const byChannel = input.channels.map((channel) => ({ channel, recipients: 0, skipped: 0 }));
    let smsSegments = 0;
    for (const c of companies) {
      const lang = input.languageMode === 'TENANT_PREFERENCE' ? (c.language === 'UR' && tpl?.bodyUr ? 'UR' : 'EN') : input.languageMode;
      const ur = lang === 'UR' && !!tpl?.bodyUr;
      const subjectSrc = input.subject ?? (tpl ? (ur ? tpl.subjectUr ?? tpl.subjectEn : tpl.subjectEn) : 'Message from Accountex');
      const bodySrc = input.messageOverride ?? (ur ? tpl!.bodyUr! : tpl!.bodyEn);
      const subject = renderTemplate(subjectSrc, valuesFor(c));
      const body = renderTemplate(bodySrc, valuesFor(c));
      for (const ch of byChannel) {
        const to = ch.channel === 'EMAIL' ? c.ownerEmail : ch.channel === 'IN_APP' ? 'Company admins' : c.ownerMobile;
        if (!to) { ch.skipped++; continue; }
        ch.recipients++;
        if (ch.channel === 'SMS') smsSegments += commSmsSegments(body, ur);
        messages.push({
          company: c, commTemplateId: tpl?.id ?? null, commBroadcastId: null, tenantId: c.tenantId, recipient: to, channel: ch.channel,
          language: ur ? 'UR' : 'EN', subject, body, status: 'QUEUED',
        });
      }
    }
    if (!messages.length) throw audienceError('None of these companies has an address for the chosen channels.', 'channels');
    const estimatedSmsCost = Math.round(smsSegments * SMS_SEGMENT_COST * 100) / 100;
    const base: BroadcastResult = { broadcastId: null, companies: companies.length, recipients: messages.length, byChannel, delivered: 0, queued: 0, estimatedSmsCost };
    if (input.preview) return { ...base, queued: messages.filter((m) => m.channel !== 'IN_APP').length };

    return this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      let delivered = 0;
      const now = new Date();
      for (const m of messages.filter((x) => x.channel === 'IN_APP')) {
        const n = await this.store.deliverInApp(m.company.tenantId, m.subject ?? 'Message from Accountex', m.body ?? '', 'INFO');
        if (n > 0) {
          m.status = 'DELIVERED'; m.sentAt = now; m.deliveredAt = now; m.recipient = `Company admins (${n})`; delivered++;
        } else {
          m.status = 'FAILED'; m.errorMessage = 'The company has no active admin user';
        }
      }
      const queued = messages.filter((m) => m.status === 'QUEUED').length;
      const broadcastId = await this.store.saveBroadcast({
        commTemplateId: tpl?.id ?? null, audience: input.audience, audienceValue: input.audienceValue, segmentId: input.segmentId,
        tenantIds: input.audience === 'SELECTED_TENANTS' ? input.tenantIds : null, languageMode: input.languageMode, channels: input.channels,
        messageOverride: input.messageOverride, scheduledAt: now.toISOString(), status: queued ? 'QUEUED' : 'SENT', recipientsCount: messages.length,
        estimatedSmsCost, sentByStaffId: admin.staffId,
      });
      await this.store.insertLogs(messages.map(({ company, ...m }) => ({ ...m, tenantId: company.tenantId, commBroadcastId: broadcastId })));
      return { ...base, broadcastId, delivered, queued };
    });
  }

  /** Resend a queued, failed or bounced message: a new row (retryOfId). IN_APP is delivered again at once. */
  async retry(admin: AdminSession, meta: RequestMeta, id: string): Promise<CommLog> {
    const log = await this.store.getLog(id);
    if (!log) throw new NotFoundError('Message not found');
    if (!COMM_LOG_RETRYABLE.includes(log.status) || log.retried) {
      throw new ConflictError(log.retried ? 'This message has already been resent.' : 'Only queued, failed or bounced messages can be resent.', undefined, { code: 'COMM_LOG_NOT_RETRYABLE' });
    }
    const newId = await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const row: NewCommLog = {
        commTemplateId: log.commTemplateId, commBroadcastId: log.broadcastId, tenantId: log.tenantId, recipient: log.recipient, channel: log.channel,
        language: log.language, subject: log.subject, body: log.body, status: 'QUEUED', retryOfId: log.id,
        relatedDocType: log.relatedDocType, relatedDocId: log.relatedDocId,
      };
      if (log.channel === 'IN_APP' && log.tenantId) {
        const n = await this.store.deliverInApp(log.tenantId, log.subject ?? 'Message from Accountex', log.body ?? '', 'INFO');
        const now = new Date();
        Object.assign(row, n > 0
          ? { status: 'DELIVERED', sentAt: now, deliveredAt: now, recipient: `Company admins (${n})` }
          : { status: 'FAILED', errorMessage: 'The company has no active admin user' });
      }
      return (await this.store.insertLogs([row]))[0]!;
    });
    return (await this.store.getLog(newId))!;
  }

  /** "Email tenant admins" of a published announcement: one QUEUED email per company reached (inside the caller's transaction). */
  async queueEmails(rows: { tenantId: string; email: string | null; language: string; subject: string; body: string }[]): Promise<number> {
    const logs: NewCommLog[] = rows.filter((r) => r.email).map((r) => ({
      commTemplateId: null, commBroadcastId: null, tenantId: r.tenantId, recipient: r.email!, channel: 'EMAIL', language: r.language === 'UR' ? 'UR' : 'EN',
      subject: r.subject, body: r.body, status: 'QUEUED',
    }));
    if (logs.length) await this.store.insertLogs(logs);
    return logs.length;
  }
}
