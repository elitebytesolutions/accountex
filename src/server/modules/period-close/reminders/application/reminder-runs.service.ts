import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { fillPlaceholders, type ReminderRunResult, type ReminderRunsOverview, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError } from '../../../../core/domain/errors.js';
import { PeriodCloseStore } from '../../common/application/period-close-store.js';

const HOUR = 60 * 60 * 1000;
const money = (n: number) => `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Payment reminder runs (outbox only, decided 2026-10-08): the due queue (Sales.getPaymentReminderQueue) becomes one
 * PaymentReminderLogs row per channel the rule sends on (WhatsApp / SMS to the customer's mobile, email to their
 * address), status QUEUED: no email / SMS provider is connected yet, so nothing leaves the system — a provider
 * picks QUEUED rows up later. "Send due reminders", per-customer "Send now", and an hourly job (actor reminder-runs).
 */
@Injectable()
export class ReminderRunsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('ReminderRuns');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: PeriodCloseStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), HOUR);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async overview(user: SessionUser): Promise<ReminderRunsOverview> {
    const [kpis, due, log] = await Promise.all([this.store.reminderKpis(user.tenantId), this.store.reminderQueue(user.tenantId, null), this.store.reminderLog(user.tenantId, 200)]);
    return { kpis, due, log, outboxOnly: true };
  }

  async run(user: SessionUser, meta: RequestMeta, p: { customerId?: string | null; invoiceIds?: string[] }): Promise<ReminderRunResult> {
    const r = await this.unitOfWork.run(actorContext(user, meta), () => this.queue(user.tenantId, p.customerId ?? null, p.invoiceIds ?? null, user.id, 'MANUAL'));
    if (!r.queued && !r.skipped) throw new ConflictError('No reminder is due right now.', undefined, { code: 'REMINDER_NOTHING_DUE' });
    return { ...r, overview: await this.overview(user) };
  }

  /** Hourly: due reminders of every company go to the outbox. */
  async tick() {
    try {
      const tenants = await this.unitOfWork.run({ userId: null, tenantId: null, correlationId: randomUUID(), actorLabel: 'reminder-runs' }, () => this.store.tenants());
      for (const tenantId of tenants) {
        const ctx: AuditContext = { userId: null, tenantId, correlationId: randomUUID(), actorLabel: 'reminder-runs' };
        try {
          const r = await this.unitOfWork.run(ctx, () => this.queue(tenantId, null, null, null, 'AUTO'));
          if (r.queued) this.log.log(`tenant ${tenantId}: ${r.queued} reminder(s) queued`);
        } catch (err) {
          this.log.warn(`tenant ${tenantId}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.log.error(`reminder runs: ${(err as Error).message}`);
    }
  }

  private async queue(tenantId: string, customerId: string | null, invoiceIds: string[] | null, userId: string | null, mode: 'MANUAL' | 'AUTO') {
    const [work, company] = await Promise.all([this.store.reminderWork(tenantId, customerId, invoiceIds), this.store.companyName(tenantId)]);
    const rows: Record<string, unknown>[] = [];
    let skipped = 0;
    for (const w of work) {
      const channels = w.channels.length ? w.channels : ['SMS'];
      for (const ch of channels) {
        const to = ch === 'EMAIL' ? w.email : w.mobile;
        if (!to) { skipped++; continue; }
        const text = w.bodyEn ? fillPlaceholders(w.bodyEn, { customer: w.customerName, invoice: w.docNo, amount: money(w.balance), due_date: fmtDate(w.dueDate), company }) : null;
        rows.push({
          sentAt: new Date(), customerId: w.customerId, invoiceId: w.invoiceId, reminderRuleId: w.ruleId, templateId: w.templateId, channel: ch, language: 'EN', recipient: to,
          triggerMode: mode, amount: w.balance, daysOverdue: w.daysOverdue, status: 'QUEUED', sentByUserId: userId,
          // the outbox keeps the rendered message for the provider to send
          providerMessageId: null, errorMessage: text ? null : null,
        });
      }
    }
    await this.store.addReminderLogs(tenantId, rows);
    return { queued: rows.length, skipped };
  }
}
