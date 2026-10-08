import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { overrideExpiry, type AdminSession, type UsageOverride, type UsageOverrideCreate, type UsageOverview } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { todayPk } from '../../subscriptions/domain/billing.js';
import { UsageStore } from './usage-store.js';

/**
 * Usage & Quotas (Super Admin › Billing › Usage & Quotas): per-company meters from the latest snapshots, a refresh
 * that captures today's snapshot, and limit overrides (one live override per company and meter). A new override is
 * captured into today's snapshot straight away, so the meters table shows it.
 *
 * Nightly capture: an in-process job (the same pattern as the recurring-voucher job; the app has no job scheduler)
 * checks every hour and captures every company's snapshot once per day. USAGE_JOB=off disables it.
 */
const HOUR = 3_600_000;
const JOB_CONTEXT: AuditContext = { userId: null, tenantId: null, correlationId: 'usage-snapshot-job', actorLabel: 'usage-snapshot-job' };

@Injectable()
export class UsageService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('UsageSnapshots');
  private timer: NodeJS.Timeout | null = null;
  /** The (database, UTC) day the job last captured; captureUsageSnapshots writes current_date. */
  private capturedDay: string | null = null;

  constructor(
    private readonly store: UsageStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    if (process.env.USAGE_JOB === 'off') return;
    setTimeout(() => void this.nightly(), 5 * 60_000).unref();
    this.timer = setInterval(() => void this.nightly(), HOUR);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Captures today's snapshot of every company once per day (unchanged values are not rewritten). */
  async nightly(): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    if (this.capturedDay === day) return;
    try {
      const n = await this.unitOfWork.run(JOB_CONTEXT, () => this.store.capture());
      this.capturedDay = day;
      this.log.log(`Captured ${n} usage snapshot rows for ${day}`);
    } catch (e) {
      this.log.error(`Usage snapshot capture failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async overview(tenantId?: string): Promise<UsageOverview> {
    const [meters, rows, overrides] = await Promise.all([this.store.meters(), this.store.current(tenantId), this.store.overrides(true)]);
    const tenants = new Set(rows.map((r) => r.tenantId));
    const worst = new Map<string, string>();
    for (const r of rows) {
      const rank = (b: string) => ['OK', 'NEAR', 'AT', 'OVER'].indexOf(b);
      if (rank(r.band) > rank(worst.get(r.tenantId) ?? 'OK')) worst.set(r.tenantId, r.band);
    }
    return {
      meters, rows, overrides: tenantId ? overrides.filter((o) => o.tenantId === tenantId) : overrides,
      kpis: {
        tenants: tenants.size,
        near: [...worst.values()].filter((b) => b === 'NEAR').length,
        over: [...worst.values()].filter((b) => b === 'AT' || b === 'OVER').length,
        overrides: overrides.length,
        lastSnapshot: rows.reduce<string | null>((a, r) => (a && a > r.snapshotDate ? a : r.snapshotDate), null),
      },
    };
  }

  async refresh(admin: AdminSession, meta: RequestMeta, tenantId?: string): Promise<{ captured: number }> {
    if (tenantId && !(await this.store.tenantExists(tenantId))) throw new NotFoundError('Company not found');
    const captured = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.capture(tenantId));
    return { captured };
  }

  async addOverride(admin: AdminSession, meta: RequestMeta, input: UsageOverrideCreate): Promise<UsageOverride> {
    if (!(await this.store.tenantExists(input.tenantId))) throw new ValidationError('Choose an existing company', { tenantId: ['Unknown company'] });
    if (!(await this.store.meters()).some((m) => m.id === input.usageMeterId)) throw new ValidationError('Choose a meter', { usageMeterId: ['Unknown meter'] });
    if (await this.store.liveOverride(input.tenantId, input.usageMeterId)) {
      throw new ConflictError('This meter already has a live override for the company. Revoke it first.', undefined, { code: 'USAGE_OVERRIDE_EXISTS' });
    }
    const expiresOn = overrideExpiry(input.expiryMode, todayPk(), await this.store.periodEnd(input.tenantId));
    const previousLimit = await this.store.currentLimit(input.tenantId, input.usageMeterId);
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      const newId = await this.store.addOverride({
        tenantId: input.tenantId, usageMeterId: input.usageMeterId, previousLimit, limitValue: input.limitValue, expiryMode: input.expiryMode, expiresOn,
        billOverage: input.billOverage, customPrice: input.billOverage === 'CUSTOM' ? input.customPrice : null, reason: input.reason, appliedByStaffId: admin.staffId!,
      });
      await this.store.capture(input.tenantId);
      return newId;
    });
    return (await this.store.override(id))!;
  }

  async revokeOverride(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<UsageOverride> {
    const o = await this.store.override(id);
    if (!o) throw new NotFoundError('Override not found');
    if (o.revokedAt) throw new ConflictError('This override is already revoked.', undefined, { code: 'USAGE_OVERRIDE_EXISTS' });
    await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      if (!(await this.store.revokeOverride(id, rowVersion))) throw new ConcurrencyError('Someone else changed this override. Reload and try again.');
      await this.store.capture(o.tenantId);
    });
    return (await this.store.override(id))!;
  }
}
