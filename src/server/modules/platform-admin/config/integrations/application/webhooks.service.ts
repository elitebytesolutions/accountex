import { createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AdminSession, WebhookCreate, WebhookDelivery, WebhookEndpoint, WebhookUpdate, WebhookWithSecret } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { SecretBox, type Sealed } from '../../../../../core/application/ports/secret-box.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { deliveryStatus, newWebhookSecret, signedContent } from '../domain/credentials.js';
import { WebhookSender, WebhookStore } from './integration-store.js';

const TIMEOUT_MS = 10_000;
export const SIGNATURE_HEADER = 'x-accountex-signature';

/**
 * Per-tenant webhook endpoints and their delivery log (System › API & Webhooks). The signing secret is shown once and
 * stored sealed (SecretBox). "Send test event" is a signed HTTPS POST of a `ping` event with a 10 s timeout, recorded as
 * a delivery; replay re-sends a recorded delivery's payload (new signature) as a new delivery linked by replayOfId.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly store: WebhookStore,
    private readonly sender: WebhookSender,
    private readonly secrets: SecretBox,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(tenantId: string) {
    return this.store.list(tenantId);
  }

  async get(id: string): Promise<WebhookEndpoint> {
    const w = await this.store.get(id);
    if (!w) throw new NotFoundError('Webhook endpoint not found');
    return w;
  }

  async create(admin: AdminSession, meta: RequestMeta, input: WebhookCreate): Promise<WebhookWithSecret> {
    if (!(await this.store.tenantName(input.tenantId))) throw new ValidationError('Choose a tenant', { tenantId: ['Unknown tenant'] });
    if ((await this.store.list(input.tenantId)).some((w) => w.url === input.url)) {
      throw new ValidationError('This tenant already has that endpoint', { url: ['Already added'] });
    }
    const secret = newWebhookSecret(randomBytes(32));
    const sealed = Buffer.from(JSON.stringify(this.secrets.seal(secret)), 'utf8');
    const id = await this.unitOfWork.run(this.context(admin, meta, input.tenantId), () => this.store.save(input.tenantId, {
      url: input.url, events: input.events, isEnabled: true, signingSecretEnc: `\\x${sealed.toString('hex')}`, secretLast4: secret.slice(-4),
    }));
    return { endpoint: await this.get(id), secret };
  }

  /** URL, events, or pause / resume (a paused endpoint gets no events; pausedAt records when). */
  async update(admin: AdminSession, meta: RequestMeta, id: string, input: WebhookUpdate): Promise<WebhookEndpoint> {
    const w = await this.current(id, input.rowVersion);
    const data: Record<string, unknown> = { id, rowVersion: input.rowVersion };
    if (input.url !== undefined) data.url = input.url;
    if (input.events !== undefined) data.events = input.events;
    if (input.isEnabled !== undefined && input.isEnabled !== w.isEnabled) {
      data.isEnabled = input.isEnabled;
      data.pausedAt = input.isEnabled ? null : new Date();
    }
    await this.unitOfWork.run(this.context(admin, meta, w.tenantId), () => this.store.save(w.tenantId, data));
    return this.get(id);
  }

  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    const w = await this.current(id, rowVersion);
    await this.unitOfWork.run(this.context(admin, meta, w.tenantId), () => this.store.remove(id, rowVersion));
  }

  async deliveries(filter: { endpointId?: string; tenantId?: string }): Promise<WebhookDelivery[]> {
    if (filter.endpointId) await this.get(filter.endpointId);
    return this.store.deliveries(filter, 100);
  }

  /** Sends a signed `ping` event now and records the delivery. */
  async test(admin: AdminSession, meta: RequestMeta, id: string): Promise<WebhookDelivery> {
    const w = await this.get(id);
    const tenant = await this.store.tenantName(w.tenantId);
    const eventId = `evt_${randomBytes(12).toString('hex')}`;
    const payload = {
      id: eventId, type: 'ping', created: new Date().toISOString(), tenant,
      data: { message: 'Test event from the Accountex Super Admin console', endpoint: w.url },
    };
    return this.deliver(admin, meta, w, eventId, 'ping', payload, null);
  }

  /** Re-sends a recorded delivery's payload to its endpoint (same event id, fresh signature). */
  async replay(admin: AdminSession, meta: RequestMeta, deliveryId: string): Promise<WebhookDelivery> {
    const d = await this.store.delivery(deliveryId);
    if (!d) throw new NotFoundError('Delivery not found');
    const w = await this.get(d.webhookEndpointId);
    return this.deliver(admin, meta, w, d.eventId, d.eventType, d.requestPayload, d.id);
  }

  private async deliver(admin: AdminSession, meta: RequestMeta, w: WebhookEndpoint, eventId: string, eventType: string, payload: unknown, replayOfId: string | null) {
    const sealed = await this.store.sealedSecret(w.id);
    if (!sealed) throw new NotFoundError('Webhook endpoint not found');
    const secret = this.secrets.open(JSON.parse(sealed.toString('utf8')) as Sealed);
    const body = JSON.stringify(payload);
    const t = Math.floor(Date.now() / 1000);
    const signature = `t=${t},v1=${createHmac('sha256', secret).update(signedContent(t, body)).digest('hex')}`;
    const res = await this.sender.post(w.url, body, {
      'content-type': 'application/json', 'user-agent': 'Accountex-Webhooks/1.0', [SIGNATURE_HEADER]: signature, 'x-accountex-event': eventType,
    }, TIMEOUT_MS);
    const status = deliveryStatus(res.responseCode, res.timedOut);
    const id = await this.unitOfWork.run(this.context(admin, meta, w.tenantId), () => this.store.addDelivery({
      tenantId: w.tenantId, webhookEndpointId: w.id, eventId, eventType, requestPayload: payload, requestSignature: signature,
      responseCode: res.timedOut ? null : res.responseCode, responseBody: (res.responseBody ?? res.error)?.slice(0, 2000) ?? null,
      latencyMs: res.latencyMs, status, replayOfId, deliveredAt: status === 'DELIVERED' ? new Date() : null,
    }));
    const [saved] = (await this.store.deliveries({ endpointId: w.id }, 100)).filter((x) => x.id === id);
    return saved!;
  }

  private context(admin: AdminSession, meta: RequestMeta, tenantId: string): AuditContext {
    return { ...adminActorContext(admin, meta), tenantId };
  }

  private async current(id: string, rowVersion: number) {
    const w = await this.get(id);
    if (w.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this endpoint. Reload and try again.');
    return w;
  }
}
