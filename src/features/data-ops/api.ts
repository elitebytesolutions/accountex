import type { BackupOverview, DataImport, ImportStart, IntegrationsOverview, RestoreRequest, TenantWebhook, TenantWebhookDelivery } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const post = <T,>(path: string, body?: Body) => apiRequest<T>(path, { method: "POST", body });

/** Browser clients for Phase 35: data imports, integrations / webhooks, backups. */
// data imports (rows are mapped to field keys in the browser; the server validates and runs them)
export const listImports = () => apiRequest<DataImport[]>("/imports");
export const getImport = (id: string) => apiRequest<DataImport>(`/imports/${id}`);
export const startImport = (body: ImportStart) => post<DataImport>("/imports", body as Body);
export const validateImport = (id: string, rows: Record<string, string>[]) => post<DataImport>(`/imports/${id}/validate`, { rows });
export const runImport = (id: string, rows: Record<string, string>[], skipErrorRows: boolean) => post<DataImport>(`/imports/${id}/run`, { rows, skipErrorRows });
export const cancelImport = (id: string) => post<DataImport>(`/imports/${id}/cancel`);
/** Same-origin download URL of the job's error report (CSV). */
export const importErrorsUrl = (id: string) => `/api/imports/${id}/errors.csv`;

// integrations (API keys are read-only: issued by the Super Admin)
export const integrations = () => apiRequest<IntegrationsOverview>("/settings/integrations");
export const setProvider = (provider: string, connect: boolean) => post<IntegrationsOverview>(`/settings/integrations/providers/${provider}/${connect ? "connect" : "disconnect"}`);
/** The response carries `secret` once. */
export const createWebhook = (body: { url: string; events: string[]; isActive?: boolean }) => post<TenantWebhook>("/settings/integrations/webhooks", body);
export const updateWebhook = (id: string, body: { url: string; events: string[]; isActive?: boolean; rowVersion: number }) => apiRequest<TenantWebhook>(`/settings/integrations/webhooks/${id}`, { method: "PATCH", body });
export const deleteWebhook = (id: string) => apiRequest<void>(`/settings/integrations/webhooks/${id}`, { method: "DELETE" });
export const webhookDeliveries = (id: string) => apiRequest<TenantWebhookDelivery[]>(`/settings/integrations/webhooks/${id}/deliveries`);
export const testWebhook = (id: string) => post<TenantWebhookDelivery[]>(`/settings/integrations/webhooks/${id}/test`);
export const redeliver = (deliveryId: string) => post<TenantWebhookDelivery[]>(`/settings/integrations/webhooks/deliveries/${deliveryId}/redeliver`);

// backups
export const backups = () => apiRequest<BackupOverview>("/settings/backups");
export const saveBackupSettings = (body: Body) => apiRequest<BackupOverview>("/settings/backups/settings", { method: "PUT", body });
export const runBackup = () => post<{ id: string; snapshotCode: string }>("/settings/backups/run");
export const backupDownloadUrl = (id: string) => `/api/settings/backups/${id}/download`;
export const requestRestore = (snapshotId: string, body: { reason: string; confirmText: string; takeSafetyBackup: boolean }) => post<RestoreRequest>(`/settings/backups/${snapshotId}/restore-request`, body);
export const cancelRestore = (id: string) => post<RestoreRequest>(`/settings/backups/restore-requests/${id}/cancel`);
