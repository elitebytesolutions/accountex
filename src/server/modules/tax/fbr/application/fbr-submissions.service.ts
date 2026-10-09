import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FbrAuthority, FbrSendingState, FbrSubmissionQuery, FbrSyncResult, FbrTestResult, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError } from '../../../../core/domain/errors.js';
import { FbrService } from '../../../treasury/fbr/application/fbr.service.js';
import { TaxStore, type FbrTenantConfig } from '../../common/application/tax-store.js';
import { nextRetryAt, syncDue } from '../domain/retry.js';
import { FbrGateway, type FbrConnection } from './fbr-gateway.js';

const MINUTE = 60_000;
const BATCH = 50;
const notConnected = () => new ConflictError('FBR is not connected: sending is switched off for this company.', undefined, { code: 'FBR_NOT_CONNECTED' });

/**
 * FBR / PRA submissions. Posting queues a PENDING submission (Phase 23 invoices, credit notes); nothing is sent until
 * the company switches sending on (FbrSettings.sendingEnabled, off by default). Then a job every minute sends each
 * company's due submissions (every syncIntervalMinutes), one attempt per send on the same row (attempts + 1, the row
 * history keeps every attempt), with backoff for transient failures. Accepted invoices get the FBR invoice number / QR.
 * Going live: the backlog is sent, or a date range is marked "not reported" (SKIPPED) and can be re-queued later.
 */
@Injectable()
export class FbrSubmissionsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('FbrSync');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: TaxStore,
    private readonly gateway: FbrGateway,
    private readonly settings: FbrService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), MINUTE);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  list(user: SessionUser, q: FbrSubmissionQuery) {
    return this.store.listSubmissions(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const s = await this.store.getSubmission(user.tenantId, id);
    if (!s) throw new NotFoundError('Submission not found');
    return s;
  }

  async events(user: SessionUser, authority: FbrAuthority) {
    const cfg = await this.store.fbrConfig(user.tenantId, authority);
    return cfg ? this.store.events(user.tenantId, cfg.configId, 20) : [];
  }

  async state(user: SessionUser, authority: FbrAuthority): Promise<FbrSendingState> {
    const cfg = await this.store.fbrConfig(user.tenantId, authority);
    if (!cfg) return { configured: false, sendingEnabled: false, simulated: false, connectionStatus: 'NOT_CONFIGURED', lastSyncAt: null, backlog: { pending: 0, failed: 0, oldest: null, newest: null, amount: 0 } };
    return {
      configured: true, sendingEnabled: cfg.sendingEnabled, simulated: this.gateway.simulated(cfg.tenantCode), connectionStatus: cfg.connectionStatus,
      lastSyncAt: cfg.lastSyncAt?.toISOString() ?? null, backlog: await this.store.backlog(user.tenantId, cfg.configId),
    };
  }

  private async config(tenantId: string, authority: string) {
    const cfg = await this.store.fbrConfig(tenantId, authority);
    if (!cfg) throw new ConflictError('Set up the FBR settings first.', undefined, { code: 'FBR_NOT_CONFIGURED' });
    return cfg;
  }

  private async connection(cfg: FbrTenantConfig): Promise<FbrConnection> {
    return {
      authority: cfg.authority, environment: cfg.environment, posId: cfg.posId, ntn: cfg.ntn, tenantCode: cfg.tenantCode,
      token: await this.settings.token(cfg.tenantId, cfg.authority as FbrAuthority),
    };
  }

  /** Test connection: with sending off it answers "not connected" (and logs that); otherwise a health check. */
  async test(user: SessionUser, meta: RequestMeta, authority: FbrAuthority): Promise<FbrTestResult> {
    const cfg = await this.config(user.tenantId, authority);
    if (!cfg.sendingEnabled) {
      await this.unitOfWork.run(actorContext(user, meta), () => this.store.addEvent(user.tenantId, cfg.configId, {
        event: 'TEST', ok: false, latencyMs: null, details: 'Not connected: sending is switched off', actorUserId: user.id,
      }));
      throw notConnected();
    }
    const h = await this.gateway.health(await this.connection(cfg));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.addEvent(user.tenantId, cfg.configId, { event: 'TEST', ok: h.ok, latencyMs: h.latencyMs, details: h.message, actorUserId: user.id });
      await this.store.setConnection(user.tenantId, cfg.configId, { connectionStatus: h.ok ? 'CONNECTED' : 'DISCONNECTED', lastHealthCheckAt: new Date(), lastLatencyMs: h.latencyMs });
    });
    return { ok: h.ok, latencyMs: h.latencyMs, message: h.message };
  }

  /** Sync now / Send backlog: every open submission (backlog) or the due ones. */
  async sync(user: SessionUser, meta: RequestMeta, authority: FbrAuthority, all: boolean): Promise<FbrSyncResult> {
    const cfg = await this.config(user.tenantId, authority);
    if (!cfg.sendingEnabled) throw notConnected();
    return this.syncCompany(cfg, () => actorContext(user, meta), { all, actorUserId: user.id });
  }

  async retry(user: SessionUser, meta: RequestMeta, id: string) {
    const s = await this.get(user, id);
    if (s.status === 'ACCEPTED') throw new ConflictError('FBR already accepted this document.', undefined, { code: 'FBR_SUBMISSION_ACCEPTED' });
    if (s.status === 'SKIPPED') throw new ConflictError('Put this document back in the queue first.', undefined, { code: 'FBR_NOT_CONNECTED' });
    const cfg = await this.config(user.tenantId, s.authority);
    if (!cfg.sendingEnabled) throw notConnected();
    await this.syncCompany(cfg, () => actorContext(user, meta), { ids: [id], actorUserId: user.id });
    return this.get(user, id);
  }

  /** A document marked "not reported" goes back to the queue. */
  async requeue(user: SessionUser, meta: RequestMeta, id: string) {
    const s = await this.get(user, id);
    if (s.status !== 'SKIPPED') throw new ConflictError('Only documents marked "not reported" can be re-queued.', undefined, { code: 'FBR_SUBMISSION_ACCEPTED' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.requeue(user.tenantId, id));
    return this.get(user, id);
  }

  /** Going live: open submissions for documents dated in the range are marked "not reported". */
  async skip(user: SessionUser, meta: RequestMeta, authority: FbrAuthority, from: string, to: string) {
    const cfg = await this.config(user.tenantId, authority);
    const skipped = await this.unitOfWork.run(actorContext(user, meta), () => this.store.skipRange(user.tenantId, cfg.configId, from, to));
    return { skipped };
  }

  /** Every minute: each company whose sending is on and whose sync interval has passed. */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const configs = await this.store.sendingConfigs();
      for (const cfg of configs.filter((c) => syncDue(c.lastSyncAt, c.syncIntervalMinutes))) {
        const ctx = (): AuditContext => ({ userId: null, tenantId: cfg.tenantId, correlationId: randomUUID(), actorLabel: 'fbr-sync' });
        try {
          await this.syncCompany(cfg, ctx, { actorUserId: null });
        } catch (err) {
          this.log.warn(`${cfg.tenantCode} ${cfg.authority}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.log.error(`FBR sync: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Sends a company's submissions. The network call happens outside any transaction; each result is recorded in its
   * own transaction (submission + invoice), then the connection status, last sync and a SYNC event.
   */
  private async syncCompany(cfg: FbrTenantConfig, ctx: () => AuditContext, opts: { ids?: string[]; all?: boolean; actorUserId: string | null }): Promise<FbrSyncResult> {
    const due = await this.store.dueSubmissions(cfg.tenantId, cfg.configId, opts.ids ? opts.ids.length : BATCH, { ids: opts.ids, all: opts.all });
    const conn = due.length ? await this.connection(cfg) : null;
    let accepted = 0;
    let failed = 0;
    let transient = 0;
    for (const sub of due) {
      const doc = await this.store.fbrDocument(cfg.tenantId, sub);
      if (!doc || !conn) continue;
      const result = await this.gateway.send(conn, doc);
      if (result.accepted) accepted++;
      else {
        failed++;
        if (result.transient) transient++;
      }
      await this.unitOfWork.run(ctx(), () => this.store.recordAttempt(cfg.tenantId, sub, result, nextRetryAt(sub.attempts + 1, result.transient)));
    }
    const down = due.length > 0 && transient === due.length;
    const status = due.length === 0 ? cfg.connectionStatus : down ? 'DISCONNECTED' : 'CONNECTED';
    await this.unitOfWork.run(ctx(), async () => {
      await this.store.setConnection(cfg.tenantId, cfg.configId, { lastSyncAt: new Date(), ...(status !== cfg.connectionStatus && { connectionStatus: status }) });
      if (status !== cfg.connectionStatus && cfg.connectionStatus === 'CONNECTED' && down) {
        await this.store.addEvent(cfg.tenantId, cfg.configId, { event: 'TIMEOUT', ok: false, latencyMs: null, details: `FBR unreachable · ${due.length} document(s) will be retried`, actorUserId: opts.actorUserId });
      } else if (status === 'CONNECTED' && cfg.connectionStatus === 'DISCONNECTED') {
        await this.store.addEvent(cfg.tenantId, cfg.configId, { event: 'RECOVERED', ok: true, latencyMs: null, details: 'FBR reachable again', actorUserId: opts.actorUserId });
      }
      if (due.length) {
        await this.store.addEvent(cfg.tenantId, cfg.configId, {
          event: 'SYNC', ok: failed === 0, latencyMs: null, retriedCount: due.filter((s) => s.attempts > 0).length,
          details: `${due.length} sent · ${accepted} accepted · ${failed} failed`, actorUserId: opts.actorUserId,
        });
      }
    });
    return { sent: due.length, accepted, failed };
  }
}
