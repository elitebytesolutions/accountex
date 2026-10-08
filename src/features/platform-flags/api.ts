import type {
  AuditAlertRule,
  FlagAuditEntry,
  FlagDetail,
  FlagEnvironment,
  FlagEnvironmentInput,
  FlagEvaluation,
  FlagListItem,
  FlagOptions,
  FlagSdkKey,
  FlagSdkKeyIssued,
  FlagServed,
  FlagSummary,
  MaintenanceWindow,
  PlatformAuditLogRow,
  UsageAlertRule,
  UsageAlertRuleOptions,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;

// ---- feature flags: /api/admin/flags
export const listFlags = (q: Record<string, string | undefined> = {}) => {
  const qs = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1])).toString();
  return apiRequest<FlagListItem[]>(`/admin/flags${qs ? `?${qs}` : ""}`);
};
export const flagSummary = () => apiRequest<FlagSummary>("/admin/flags/summary");
export const flagOptions = () => apiRequest<FlagOptions>("/admin/flags/options");
export const getFlag = (id: string) => apiRequest<FlagDetail>(`/admin/flags/${id}`);
export const createFlag = (body: Body) => apiRequest<FlagDetail>("/admin/flags", { method: "POST", body });
export const updateFlag = (id: string, body: Body) => apiRequest<FlagDetail>(`/admin/flags/${id}`, { method: "PATCH", body });
export const moveFlagStage = (id: string, stage: string, rowVersion: number) => apiRequest<FlagDetail>(`/admin/flags/${id}/stage`, { method: "POST", body: { stage, rowVersion } });
export const archiveFlag = (id: string, rowVersion: number) => apiRequest<FlagDetail>(`/admin/flags/${id}/archive`, { method: "POST", body: { rowVersion } });
export const restoreFlag = (id: string, rowVersion: number) => apiRequest<FlagDetail>(`/admin/flags/${id}/restore`, { method: "POST", body: { rowVersion } });
export const duplicateFlag = (id: string) => apiRequest<FlagDetail>(`/admin/flags/${id}/duplicate`, { method: "POST", body: {} });
export const toggleFlag = (id: string, env: FlagEnvironment, isOn: boolean, confirmKey?: string) =>
  apiRequest<FlagDetail>(`/admin/flags/${id}/toggle?env=${env}`, { method: "POST", body: { isOn, ...(confirmKey ? { confirmKey } : {}) } });
export const saveFlagEnvironment = (id: string, env: FlagEnvironment, body: FlagEnvironmentInput) =>
  apiRequest<FlagDetail>(`/admin/flags/${id}/environments/${env}`, { method: "PUT", body });
export const evaluateFlag = (id: string, tenant: string, env: FlagEnvironment) =>
  apiRequest<FlagEvaluation>(`/admin/flags/${id}/evaluate?tenant=${encodeURIComponent(tenant)}&env=${env}`);
export const flagServed = (id: string, env: FlagEnvironment) => apiRequest<FlagServed>(`/admin/flags/${id}/served?env=${env}`);
export const flagAudit = (id: string) => apiRequest<FlagAuditEntry[]>(`/admin/flags/${id}/audit`);

// ---- SDK keys: /api/admin/flags/sdk-keys
export const listSdkKeys = () => apiRequest<FlagSdkKey[]>("/admin/flags/sdk-keys");
export const createSdkKey = (environment: FlagEnvironment, kind: string) => apiRequest<FlagSdkKeyIssued>("/admin/flags/sdk-keys", { method: "POST", body: { environment, kind } });
export const rotateSdkKey = (id: string) => apiRequest<FlagSdkKeyIssued>(`/admin/flags/sdk-keys/${id}/rotate`, { method: "POST", body: {} });
export const revokeSdkKey = (id: string) => apiRequest<FlagSdkKey>(`/admin/flags/sdk-keys/${id}/revoke`, { method: "POST", body: {} });

// ---- maintenance windows: /api/admin/maintenance-windows
export const listMaintenanceWindows = (scope: "upcoming" | "all" = "upcoming") => apiRequest<MaintenanceWindow[]>(`/admin/maintenance-windows?scope=${scope}`);
export const createMaintenanceWindow = (body: Body) => apiRequest<MaintenanceWindow>("/admin/maintenance-windows", { method: "POST", body });
export const updateMaintenanceWindow = (id: string, body: Body) => apiRequest<MaintenanceWindow>(`/admin/maintenance-windows/${id}`, { method: "PATCH", body });
export const cancelMaintenanceWindow = (id: string, rowVersion: number) => apiRequest<MaintenanceWindow>(`/admin/maintenance-windows/${id}/cancel`, { method: "POST", body: { rowVersion } });

// ---- usage alert rules: /api/admin/usage-alert-rules
export const listUsageAlertRules = () => apiRequest<UsageAlertRule[]>("/admin/usage-alert-rules");
export const usageAlertRuleOptions = () => apiRequest<UsageAlertRuleOptions>("/admin/usage-alert-rules/options");
export const createUsageAlertRule = (body: Body) => apiRequest<UsageAlertRule>("/admin/usage-alert-rules", { method: "POST", body });
export const updateUsageAlertRule = (id: string, body: Body) => apiRequest<UsageAlertRule>(`/admin/usage-alert-rules/${id}`, { method: "PATCH", body });
export const setUsageAlertRuleEnabled = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<UsageAlertRule>(`/admin/usage-alert-rules/${id}/${on ? "enable" : "disable"}`, { method: "POST", body: { rowVersion } });
export const deleteUsageAlertRule = (id: string) => apiRequest<void>(`/admin/usage-alert-rules/${id}`, { method: "DELETE" });

// ---- audit alert rules + platform audit log
export const listAuditAlertRules = () => apiRequest<AuditAlertRule[]>("/admin/audit-alert-rules");
export const createAuditAlertRule = (body: Body) => apiRequest<AuditAlertRule>("/admin/audit-alert-rules", { method: "POST", body });
export const updateAuditAlertRule = (id: string, body: Body) => apiRequest<AuditAlertRule>(`/admin/audit-alert-rules/${id}`, { method: "PATCH", body });
export const setAuditAlertRuleActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<AuditAlertRule>(`/admin/audit-alert-rules/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteAuditAlertRule = (id: string) => apiRequest<void>(`/admin/audit-alert-rules/${id}`, { method: "DELETE" });
export const listPlatformAuditLog = (q: { search?: string; result?: string; page: number; pageSize: number }) => {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return apiRequest<{ items: PlatformAuditLogRow[]; total: number }>(`/admin/audit-log?${qs}`);
};
