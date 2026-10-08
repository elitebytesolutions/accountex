import type { ApiKey, ConfigTenantOption, WebhookDelivery, WebhookEndpoint } from '../../../../../../shared/index.js';

/** An API key with its current hash (internal: needed to rotate). */
export type StoredApiKey = ApiKey & { keyHash: string };

/** Port: Platform.PlatformApiKeys (writes through Platform.platformApiKeyAddUpdate in the key's tenant context). */
export abstract class ApiKeyStore {
  abstract tenants(): Promise<ConfigTenantOption[]>;
  abstract tenantExists(id: string): Promise<boolean>;
  abstract list(tenantId: string): Promise<ApiKey[]>;
  abstract get(id: string): Promise<StoredApiKey | null>;
  /** Saves in the tenant's context (the save function reads app.tenantId). */
  abstract save(tenantId: string, data: Record<string, unknown>): Promise<string>;
}

/** Port: Platform.WebhookEndpoints (via Platform.webhookEndpointAddUpdate) and Platform.WebhookDeliveries. */
export abstract class WebhookStore {
  abstract list(tenantId: string): Promise<WebhookEndpoint[]>;
  abstract get(id: string): Promise<WebhookEndpoint | null>;
  /** The sealed signing secret as stored (bytes). */
  abstract sealedSecret(id: string): Promise<Buffer | null>;
  /** Saves in the tenant's context (the save function reads app.tenantId). */
  abstract save(tenantId: string, data: Record<string, unknown>): Promise<string>;
  /** Deletes the endpoint and its delivery log. */
  abstract remove(id: string, rowVersion: number): Promise<void>;
  abstract deliveries(filter: { endpointId?: string; tenantId?: string }, limit: number): Promise<WebhookDelivery[]>;
  abstract delivery(id: string): Promise<(WebhookDelivery & { tenantId: string }) | null>;
  abstract addDelivery(data: {
    tenantId: string; webhookEndpointId: string; eventId: string; eventType: string; requestPayload: unknown; requestSignature: string;
    responseCode: number | null; responseBody: string | null; latencyMs: number | null; status: string; replayOfId: string | null; deliveredAt: Date | null;
  }): Promise<string>;
  abstract tenantName(tenantId: string): Promise<{ code: string; name: string } | null>;
}

/** Port: sends one signed webhook request. */
export abstract class WebhookSender {
  /** POSTs the JSON body with the headers; never throws for network errors (they come back as `error`). */
  abstract post(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<{
    responseCode: number | null; responseBody: string | null; latencyMs: number; timedOut: boolean; error: string | null;
  }>;
}
