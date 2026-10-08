import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ChangeRequestsService } from './change-requests.service.js';

const HOUR = 3_600_000;

/**
 * Phase 43 ops job (BillingJob-style): hourly, approved change requests whose applyNotBefore has passed are applied and
 * PLANNED rollout steps whose date has come (PKT) open a change request. OPS_JOB=off disables it. Runs as
 * "system: flag-schedule job" (no signed-in user); requests it opens are requested by the step's author or the flag owner.
 */
@Injectable()
export class OpsJob implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('OpsJob');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly changeRequests: ChangeRequestsService) {}

  onModuleInit() {
    if (process.env.OPS_JOB === 'off') return;
    setTimeout(() => void this.tick(), 90_000).unref();
    this.timer = setInterval(() => void this.tick(), HOUR);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.changeRequests.runSchedule({ userId: null, tenantId: null, correlationId: randomUUID(), actorLabel: 'flag-schedule job' });
    } catch (e) {
      this.log.error(`Ops job failed: ${String(e)}`);
    } finally {
      this.running = false;
    }
  }
}
