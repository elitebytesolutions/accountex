import type {
  AllowedIp, AllowedIpCreate, ApiKey, ApiKeyCreate, ApiKeyWithSecret, BackupRun, ConfigTenantOption, DunningPolicy, DunningPolicyCreate, DunningPolicyUpdate,
  Reseller, ResellerCreate, ResellerUpdate, SecuritySettings, SecuritySettingsUpdate, Segment, SegmentCreate, SegmentEvaluation, SegmentOptions,
  SegmentOverride, SegmentRule, SegmentUpdate, WebhookCreate, WebhookDelivery, WebhookEndpoint, WebhookUpdate, WebhookWithSecret,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for Phase 38 platform configuration (/api/admin/…). */

/* dunning policies */
export const listDunningPolicies = () => apiRequest<DunningPolicy[]>("/admin/dunning-policies");
export const createDunningPolicy = (body: DunningPolicyCreate) => apiRequest<DunningPolicy>("/admin/dunning-policies", { method: "POST", body });
export const updateDunningPolicy = (id: string, body: DunningPolicyUpdate) => apiRequest<DunningPolicy>(`/admin/dunning-policies/${id}`, { method: "PATCH", body });
export const activateDunningPolicy = (id: string, rowVersion: number) => apiRequest<DunningPolicy>(`/admin/dunning-policies/${id}/activate`, { method: "POST", body: { rowVersion } });
export const deleteDunningPolicy = (id: string, rowVersion: number) => apiRequest<void>(`/admin/dunning-policies/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

/* segments */
export const listSegments = () => apiRequest<Segment[]>("/admin/segments");
export const getSegmentOptions = () => apiRequest<SegmentOptions>("/admin/segments/options");
export const previewSegment = (rules: SegmentRule[], overrides: SegmentOverride[]) =>
  apiRequest<SegmentEvaluation>("/admin/segments/preview", { method: "POST", body: { rules, overrides } });
export const evaluateSegment = (id: string) => apiRequest<SegmentEvaluation>(`/admin/segments/${id}/evaluate`, { method: "POST" });
export const createSegment = (body: SegmentCreate) => apiRequest<Segment>("/admin/segments", { method: "POST", body });
export const updateSegment = (id: string, body: SegmentUpdate) => apiRequest<Segment>(`/admin/segments/${id}`, { method: "PATCH", body });
export const saveSegmentRules = (id: string, rules: SegmentRule[], rowVersion: number) =>
  apiRequest<Segment>(`/admin/segments/${id}/rules`, { method: "PUT", body: { rules, rowVersion } });
export const saveSegmentOverrides = (id: string, overrides: SegmentOverride[], rowVersion: number) =>
  apiRequest<Segment>(`/admin/segments/${id}/tenants`, { method: "PUT", body: { overrides, rowVersion } });
export const deleteSegment = (id: string, rowVersion: number) => apiRequest<void>(`/admin/segments/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

/* resellers */
export const listResellers = () => apiRequest<Reseller[]>("/admin/resellers");
export const createReseller = (body: ResellerCreate) => apiRequest<Reseller>("/admin/resellers", { method: "POST", body });
export const updateReseller = (id: string, body: ResellerUpdate) => apiRequest<Reseller>(`/admin/resellers/${id}`, { method: "PATCH", body });
export const setResellerStatus = (id: string, status: string, rowVersion: number) =>
  apiRequest<Reseller>(`/admin/resellers/${id}/status`, { method: "POST", body: { status, rowVersion } });
export const regenerateInviteCode = (id: string, rowVersion: number) => apiRequest<Reseller>(`/admin/resellers/${id}/invite-code`, { method: "POST", body: { rowVersion } });
export const deleteReseller = (id: string, rowVersion: number) => apiRequest<void>(`/admin/resellers/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

/* security */
export const getSecuritySettings = () => apiRequest<SecuritySettings>("/admin/security/settings");
export const saveSecuritySettings = (body: SecuritySettingsUpdate) => apiRequest<SecuritySettings>("/admin/security/settings", { method: "PUT", body });
export const listAllowedIps = () => apiRequest<AllowedIp[]>("/admin/security/allowed-ips");
export const addAllowedIp = (body: AllowedIpCreate) => apiRequest<AllowedIp>("/admin/security/allowed-ips", { method: "POST", body });
export const removeAllowedIp = (id: string) => apiRequest<void>(`/admin/security/allowed-ips/${id}`, { method: "DELETE" });

/* API keys & webhooks */
export const listConfigTenants = () => apiRequest<ConfigTenantOption[]>("/admin/api-keys/tenants");
export const listApiKeys = (tenantId: string) => apiRequest<ApiKey[]>(`/admin/api-keys?tenantId=${tenantId}`);
export const createApiKey = (body: ApiKeyCreate) => apiRequest<ApiKeyWithSecret>("/admin/api-keys", { method: "POST", body });
export const rotateApiKey = (id: string, rowVersion: number) => apiRequest<ApiKeyWithSecret>(`/admin/api-keys/${id}/rotate`, { method: "POST", body: { rowVersion } });
export const revokeApiKey = (id: string, rowVersion: number) => apiRequest<ApiKey>(`/admin/api-keys/${id}/revoke`, { method: "POST", body: { rowVersion } });
export const listWebhooks = (tenantId: string) => apiRequest<WebhookEndpoint[]>(`/admin/webhooks?tenantId=${tenantId}`);
export const listTenantDeliveries = (tenantId: string) => apiRequest<WebhookDelivery[]>(`/admin/webhooks/deliveries?tenantId=${tenantId}`);
export const createWebhook = (body: WebhookCreate) => apiRequest<WebhookWithSecret>("/admin/webhooks", { method: "POST", body });
export const updateWebhook = (id: string, body: WebhookUpdate) => apiRequest<WebhookEndpoint>(`/admin/webhooks/${id}`, { method: "PATCH", body });
export const deleteWebhook = (id: string, rowVersion: number) => apiRequest<void>(`/admin/webhooks/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
export const testWebhook = (id: string) => apiRequest<WebhookDelivery>(`/admin/webhooks/${id}/test`, { method: "POST" });
export const replayDelivery = (id: string) => apiRequest<WebhookDelivery>(`/admin/webhooks/deliveries/${id}/replay`, { method: "POST" });

/* backups */
export const listBackups = () => apiRequest<BackupRun[]>("/admin/backups");
export const runBackup = () => apiRequest<BackupRun>("/admin/backups/run", { method: "POST" });
