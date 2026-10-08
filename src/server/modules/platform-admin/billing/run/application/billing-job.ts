import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { AdminSession, BillingRunResult } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import type { AuditContext, RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConflictError } from '../../../../../core/domain/errors.js';
import { todayPk } from '../../../tenants/subscriptions/domain/billing.js';
import { DunningService } from '../../dunning/application/dunning.service.js';
import { InvoicesService } from '../../invoices/application/invoices.service.js';

const HOUR = 3_600_000;

/**
 * The daily billing run (Phase 41), the same pattern as the usage snapshot job (the app has no job scheduler): an
 * in-process timer checks every hour and runs once per Pakistan business day.
 *  1. bills every live paid subscription whose current period has no invoice yet (generate + issue);
 *  2. opens a dunning case for every overdue invoice without one (active policy, its retry plan);
 *  3. advances every open case by the policy, moving the company PAST_DUE → READ_ONLY → SUSPENDED (sessions revoked).
 * Recorded in row history as "system: billing-job". "Run now" (POST /api/admin/billing/run) does the same as the
 * Super Admin. BILLING_JOB=off disables the timer (Run now still works).
 */
@Injectable()
export class BillingJob implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('BillingJob');
  private timer: NodeJS.Timeout | null = null;
  private ranDay: string | null = null;
  private running = false;

  constructor(
    private readonly invoices: InvoicesService,
    private readonly dunning: DunningService,
  ) {}

  onModuleInit() {
    if (process.env.BILLING_JOB === 'off') return;
    setTimeout(() => void this.daily(), 7 * 60_000).unref();
    this.timer = setInterval(() => void this.daily(), HOUR);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async daily(): Promise<void> {
    const day = todayPk();
    if (this.ranDay === day || this.running) return;
    try {
      const context: AuditContext = { userId: null, tenantId: null, correlationId: `billing-job-${day}`, actorLabel: 'billing-job' };
      const r = await this.run(context, 'all');
      this.ranDay = day;
      this.log.log(`Billing run ${day}: ${r.invoicesIssued} invoices issued, ${r.casesOpened} cases opened, ${r.casesAdvanced} advanced, ` +
        `${r.casesRecovered} recovered, ${r.statusChanges.length} company status changes, ${r.errors.length} errors`);
      for (const e of r.errors) this.log.warn(`${e.subject}: ${e.message}`);
    } catch (e) {
      this.log.error(`Billing run failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** "Run now" as the Super Admin: invoices + dunning ('all') or dunning only. */
  runNow(admin: AdminSession, meta: RequestMeta, scope: 'all' | 'dunning'): Promise<BillingRunResult> {
    return this.run(adminActorContext(admin, meta), scope);
  }

  private async run(context: AuditContext, scope: 'all' | 'dunning'): Promise<BillingRunResult> {
    if (this.running) throw new ConflictError('A billing run is already in progress. Try again in a minute.');
    this.running = true;
    try {
      const asOf = todayPk();
      const result: BillingRunResult = { asOf, invoicesGenerated: 0, invoicesIssued: 0, casesOpened: 0, casesAdvanced: 0, casesRecovered: 0, statusChanges: [], errors: [] };
      if (scope === 'all') await this.invoices.run(context, asOf, result);
      await this.dunning.run(context, asOf, result);
      return result;
    } finally {
      this.running = false;
    }
  }
}
