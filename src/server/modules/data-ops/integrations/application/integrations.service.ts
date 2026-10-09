import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { IntegrationsOverview, SessionUser, TenantWebhook, TenantWebhookInput } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { SecretBox } from '../../../../core/application/ports/secret-box.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { DataOpsStore, WebhookSender } from '../../common/application/data-ops-store.js';

/** Providers a company can mark connected / disconnected here (FBR, bank feeds and biometric devices have their own screens). */
const SELF_SERVE: Record<string, string> = { GOOGLE_WORKSPACE: 'SSO', MICROSOFT_365: 'SSO', WHATSAPP_BUSINESS: 'MESSAGING', SMTP: 'EMAIL', DARAZ: 'COMMERCE', SHOPIFY: 'COMMERCE' };

/**
 * Integrations: the provider catalogue with each one's status; API keys are issued by the Super Admin only (decided
 * 2026-10-08), so companies see a read-only list of the keys issued to them; outgoing webhooks are managed here — the
 * signing secret is shown once and kept encrypted, a test sends a signed `ping`, every attempt is logged and can be
 * redelivered.
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly store: DataOpsStore, private readonly box: SecretBox, private readonly sender: WebhookSender, private readonly unitOfWork: UnitOfWork) {}

  async overview(user: SessionUser): Promise<IntegrationsOverview> {
    const [cards, apiKeys, webhooks] = await Promise.all([this.store.integrationCards(user.tenantId), this.store.issuedKeys(user.tenantId), this.store.listWebhooks(user.tenantId)]);
    return { cards, apiKeys, webhooks };
  }

  async setConnection(user: SessionUser, meta: RequestMeta, provider: string, connect: boolean) {
    const category = SELF_SERVE[provider];
    if (!category) throw new ValidationError('This integration is set up on its own screen.', { provider: ['Not managed here'] });
    const card = (await this.store.integrationCards(user.tenantId)).find((c) => c.provider === provider);
    if (!card) throw new NotFoundError('Integration not found');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setIntegration(user.tenantId, provider, category, card.label, connect ? 'CONNECTED' : 'NOT_CONNECTED', user.id));
    return this.overview(user);
  }

  // ---------------------------------------------------------------- webhooks
  async createWebhook(user: SessionUser, meta: RequestMeta, input: TenantWebhookInput): Promise<TenantWebhook> {
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const sealed = this.box.seal(secret);
    const enc = Buffer.from(JSON.stringify(sealed), 'utf8');
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.createWebhook(user.tenantId, { url: input.url, events: [...input.events], isActive: input.isActive ?? true, signingSecretEnc: enc }));
    return { ...(await this.webhook(user, id)), secret };
  }

  async updateWebhook(user: SessionUser, meta: RequestMeta, id: string, input: TenantWebhookInput & { rowVersion: number }) {
    await this.webhook(user, id);
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.updateWebhook(user.tenantId, id, Number(input.rowVersion), { url: input.url, events: [...input.events], isActive: input.isActive ?? true }));
    if (!ok) throw new ConcurrencyError('This webhook was changed. Reload and try again.');
    return this.webhook(user, id);
  }

  async deleteWebhook(user: SessionUser, meta: RequestMeta, id: string) {
    await this.webhook(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteWebhook(user.tenantId, id));
  }

  deliveries(user: SessionUser, id: string) {
    return this.store.deliveries(user.tenantId, id);
  }

  /** Sends a signed `ping` and logs the attempt; 409 WEBHOOK_TEST_FAILED when the endpoint doesn't answer 2xx. */
  async test(user: SessionUser, meta: RequestMeta, id: string) {
    const w = await this.secretOf(user, id);
    const payload = { id: `evt_${randomBytes(8).toString('hex')}`, type: 'ping', createdAt: new Date().toISOString(), data: { message: 'Accountex webhook test' } };
    const res = await this.sender.send(w.url, w.secret, 'ping', payload);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.recordDelivery(user.tenantId, { endpointId: id, event: 'ping', payload, attempt: 1, responseStatus: res.status, isSuccess: res.ok, error: res.error, durationMs: res.durationMs }));
    if (!res.ok) throw new ConflictError(`The endpoint didn’t accept the test event (${res.error ?? 'no answer'}).`, undefined, { code: 'WEBHOOK_TEST_FAILED' });
    return this.deliveries(user, id);
  }

  /** Re-sends a logged delivery with the same event id (attempt + 1). */
  async redeliver(user: SessionUser, meta: RequestMeta, deliveryId: string) {
    const d = await this.store.getDelivery(user.tenantId, deliveryId);
    if (!d) throw new NotFoundError('Delivery not found');
    const w = await this.secretOf(user, d.endpointId);
    const res = await this.sender.send(w.url, w.secret, d.event, d.payload);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.recordDelivery(user.tenantId, { endpointId: d.endpointId, event: d.event, payload: d.payload, attempt: d.attempt + 1, responseStatus: res.status, isSuccess: res.ok, error: res.error, durationMs: res.durationMs }));
    return this.deliveries(user, d.endpointId);
  }

  private async webhook(user: SessionUser, id: string) {
    const w = await this.store.getWebhook(user.tenantId, id);
    if (!w) throw new NotFoundError('TenantWebhook not found');
    const { signingSecretEnc, ...rest } = w;
    void signingSecretEnc;
    return rest;
  }

  private async secretOf(user: SessionUser, id: string) {
    const w = await this.store.getWebhook(user.tenantId, id);
    if (!w) throw new NotFoundError('TenantWebhook not found');
    if (!w.isActive) throw new ConflictError('This webhook is disabled.', undefined, { code: 'WEBHOOK_TEST_FAILED' });
    return { url: w.url, secret: this.box.open(JSON.parse(w.signingSecretEnc.toString('utf8'))) };
  }
}
