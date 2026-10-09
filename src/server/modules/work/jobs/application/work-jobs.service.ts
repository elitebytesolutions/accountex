import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UnitOfWork, type AuditContext } from '../../../../core/application/ports/unit-of-work.js';
import { WorkStore } from '../../common/application/work-store.js';

const EVERY = 5 * 60_000;
/** Due-item notifications go out once a day, from this hour (company time). */
const DUE_HOUR = 8;

/**
 * Background work for the work queue (actor "work-queue"): every 5 minutes, task reminders for every company; once a
 * day from 08:00 company time, notifications for overdue invoices, bills due and cheques maturing (deduplicated per
 * document and user, so a restart does not repeat them).
 */
@Injectable()
export class WorkJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('WorkQueue');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly dueDone = new Map<string, string>();

  constructor(private readonly store: WorkStore, private readonly unitOfWork: UnitOfWork) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(() => void this.tick(), 90_000).unref();
    this.timer = setInterval(() => void this.tick(), EVERY);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      let reminders = 0;
      let due = 0;
      for (const t of await this.store.activeTenants()) {
        const ctx = (): AuditContext => ({ userId: null, tenantId: t.id, correlationId: randomUUID(), actorLabel: 'work-queue' });
        try {
          reminders += await this.unitOfWork.run(ctx(), () => this.store.runTaskReminders(t.id));
          const parts = new Intl.DateTimeFormat('en-CA', { timeZone: t.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
          const part = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
          const today = `${part('year')}-${part('month')}-${part('day')}`;
          if (Number(part('hour')) >= DUE_HOUR && this.dueDone.get(t.id) !== today) {
            due += await this.unitOfWork.run(ctx(), () => this.store.runDueItems(t.id, today));
            this.dueDone.set(t.id, today);
          }
        } catch (err) {
          this.log.warn(`tenant ${t.id}: ${(err as Error).message}`);
        }
      }
      if (reminders || due) this.log.log(`${reminders} reminder(s), ${due} due-item notification(s)`);
    } catch (err) {
      this.log.error(`work queue: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
