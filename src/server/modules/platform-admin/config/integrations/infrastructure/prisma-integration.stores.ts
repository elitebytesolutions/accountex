import { Injectable } from '@nestjs/common';
import type { ApiKey, WebhookDelivery, WebhookEndpoint } from '../../../../../../shared/index.js';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { maskKey } from '../domain/credentials.js';
import { ApiKeyStore, WebhookStore, type StoredApiKey } from '../application/integration-store.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Runs a save with app.tenantId = the key's / endpoint's tenant (Platform.platformApiKeyAddUpdate and
 * webhookEndpointAddUpdate read it), then restores the previous value: safe even when the save joins a wider transaction.
 */
async function inTenant<T>(prisma: PrismaService, tenantId: string, work: () => Promise<T>): Promise<T> {
  const db = prisma.db();
  const [prev] = await db.$queryRaw<{ v: string | null }[]>`select current_setting('app.tenantId', true) as v`;
  await db.$executeRaw`select set_config('app.tenantId', ${tenantId}, true)`;
  try {
    return await work();
  } finally {
    await db.$executeRaw`select set_config('app.tenantId', ${prev?.v ?? ''}, true)`;
  }
}

type KeyRow = {
  id: string; tenantId: string; name: string; environment: string; keyPrefix: string; keyHash: string; keyLast4: string; scopes: string[];
  allowedCidrs: string[] | null; expiresAt: Date | null; lastUsedAt: Date | null; status: string; previousValidUntil: Date | null;
  rotatedAt: Date | null; revokedAt: Date | null; createdAt: Date; rowVersion: number;
};

/** API keys: allowedCidrs is cidr[] (Unsupported in Prisma), so keys are read with SQL. */
@Injectable()
export class PrismaApiKeyStore extends ApiKeyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async tenants() {
    const rows = await this.prisma.db().tenants.findMany({ select: { id: true, code: true, displayName: true }, orderBy: { displayName: 'asc' } });
    return rows.map((t) => ({ id: t.id, code: t.code, name: t.displayName }));
  }

  async tenantExists(id: string) {
    return (await this.prisma.db().tenants.count({ where: { id } })) > 0;
  }

  async list(tenantId: string): Promise<ApiKey[]> {
    return (await this.read(tenantId, null)).map((k) => {
      const out: Partial<StoredApiKey> = { ...k };
      delete out.keyHash;
      return out as ApiKey;
    });
  }

  async get(id: string): Promise<StoredApiKey | null> {
    return (await this.read(null, id))[0] ?? null;
  }

  save(tenantId: string, data: Record<string, unknown>) {
    return inTenant(this.prisma, tenantId, () => addUpdate(this.prisma, 'platformApiKeyAddUpdate', data));
  }

  private async read(tenantId: string | null, id: string | null): Promise<StoredApiKey[]> {
    const rows = await this.prisma.db().$queryRaw<KeyRow[]>`
      select id::text as id, "tenantId"::text as "tenantId", name, environment, "keyPrefix", "keyHash", "keyLast4", scopes,
             "allowedCidrs"::text[] as "allowedCidrs", "expiresAt", "lastUsedAt", status, "previousValidUntil", "rotatedAt", "revokedAt",
             "createdAt", "rowVersion"
        from "Platform"."PlatformApiKeys"
       where (${tenantId}::uuid is null or "tenantId" = ${tenantId}::uuid) and (${id}::uuid is null or id = ${id}::uuid)
       order by (status = 'ACTIVE') desc, "createdAt" desc`;
    return rows.map((r) => ({
      id: r.id, tenantId: r.tenantId, name: r.name, environment: r.environment, masked: maskKey(r.keyPrefix, r.keyLast4), keyLast4: r.keyLast4,
      keyHash: r.keyHash, scopes: r.scopes, allowedCidrs: r.allowedCidrs ?? [], expiresAt: iso(r.expiresAt), lastUsedAt: iso(r.lastUsedAt),
      status: r.status, previousValidUntil: iso(r.previousValidUntil), rotatedAt: iso(r.rotatedAt), revokedAt: iso(r.revokedAt),
      createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }
}

const endpointSelect = {
  id: true, tenantId: true, url: true, isEnabled: true, events: true, secretLast4: true, pausedAt: true, createdAt: true, rowVersion: true,
} as const satisfies Prisma.WebhookEndpointsSelect;
type EndpointRow = Prisma.WebhookEndpointsGetPayload<{ select: typeof endpointSelect }>;
const deliveryInclude = { WebhookEndpoints: { select: { url: true } } } as const satisfies Prisma.WebhookDeliveriesInclude;
type DeliveryRow = Prisma.WebhookDeliveriesGetPayload<{ include: typeof deliveryInclude }>;

@Injectable()
export class PrismaWebhookStore extends WebhookStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string) {
    return this.mapEndpoints(await this.prisma.db().webhookEndpoints.findMany({ where: { tenantId }, select: endpointSelect, orderBy: { createdAt: 'asc' } }));
  }

  async get(id: string) {
    const row = await this.prisma.db().webhookEndpoints.findUnique({ where: { id }, select: endpointSelect });
    return row ? (await this.mapEndpoints([row]))[0]! : null;
  }

  async sealedSecret(id: string) {
    const row = await this.prisma.db().webhookEndpoints.findUnique({ where: { id }, select: { signingSecretEnc: true } });
    return row ? Buffer.from(row.signingSecretEnc) : null;
  }

  save(tenantId: string, data: Record<string, unknown>) {
    return inTenant(this.prisma, tenantId, () => addUpdate(this.prisma, 'webhookEndpointAddUpdate', data));
  }

  async remove(id: string, rowVersion: number) {
    const db = this.prisma.db();
    // Replays point at their original delivery: unlink them before deleting the log.
    await db.webhookDeliveries.updateMany({ where: { webhookEndpointId: id, replayOfId: { not: null } }, data: { replayOfId: null } });
    await db.webhookDeliveries.deleteMany({ where: { webhookEndpointId: id } });
    const { count } = await db.webhookEndpoints.deleteMany({ where: { id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this endpoint. Reload and try again.');
  }

  async deliveries(filter: { endpointId?: string; tenantId?: string }, limit: number) {
    const rows = await this.prisma.db().webhookDeliveries.findMany({
      where: { ...(filter.endpointId && { webhookEndpointId: filter.endpointId }), ...(filter.tenantId && { tenantId: filter.tenantId }) },
      include: deliveryInclude, orderBy: { createdAt: 'desc' }, take: limit,
    });
    return rows.map((r) => this.mapDelivery(r));
  }

  async delivery(id: string) {
    const r = await this.prisma.db().webhookDeliveries.findUnique({ where: { id }, include: deliveryInclude });
    return r ? { ...this.mapDelivery(r), tenantId: r.tenantId } : null;
  }

  async addDelivery(data: Parameters<WebhookStore['addDelivery']>[0]) {
    const row = await this.prisma.db().webhookDeliveries.create({
      data: { ...data, requestPayload: data.requestPayload as Prisma.InputJsonValue },
      select: { id: true },
    });
    return row.id;
  }

  async tenantName(tenantId: string) {
    const t = await this.prisma.db().tenants.findUnique({ where: { id: tenantId }, select: { code: true, displayName: true } });
    return t ? { code: t.code, name: t.displayName } : null;
  }

  private async mapEndpoints(rows: EndpointRow[]): Promise<WebhookEndpoint[]> {
    if (!rows.length) return [];
    const stats = await this.prisma.db().$queryRaw<{ id: string; n: bigint; ok: bigint }[]>`
      select "webhookEndpointId"::text as id, count(*) as n, count(*) filter (where status = 'DELIVERED') as ok
        from "Platform"."WebhookDeliveries"
       where "webhookEndpointId" = any(${rows.map((r) => r.id)}::uuid[]) and "createdAt" > now() - interval '7 days'
       group by "webhookEndpointId"`;
    const s = new Map(stats.map((x) => [x.id, x]));
    return rows.map((r) => {
      const st = s.get(r.id);
      const n = Number(st?.n ?? 0);
      return {
        id: r.id, tenantId: r.tenantId, url: r.url, isEnabled: r.isEnabled, events: r.events, secretMasked: `whsec_••••••••${r.secretLast4}`,
        pausedAt: iso(r.pausedAt), successRate7d: n ? Math.round((Number(st!.ok) / n) * 1000) / 10 : null, deliveries7d: n,
        createdAt: r.createdAt.toISOString(), rowVersion: r.rowVersion,
      };
    });
  }

  private mapDelivery(r: DeliveryRow): WebhookDelivery {
    return {
      id: r.id, webhookEndpointId: r.webhookEndpointId, endpointUrl: r.WebhookEndpoints.url, eventId: r.eventId, eventType: r.eventType,
      requestPayload: r.requestPayload, responseCode: r.responseCode, responseBody: r.responseBody, latencyMs: r.latencyMs, attemptNo: r.attemptNo,
      status: r.status, replayOfId: r.replayOfId, deliveredAt: iso(r.deliveredAt), createdAt: r.createdAt.toISOString(),
    };
  }
}
