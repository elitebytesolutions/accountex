import type {
  ImpersonationSession, ImpersonationStart, RenewalRunResult, SubscriptionDetail, SubscriptionList, TenantDetail, TenantList, TenantOnboardResult,
  UsageOverride, UsageOverview,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/**
 * Browser-side Super Admin calls of Phase 40 (tenant lifecycle): /api/admin/{tenants,subscriptions,usage,impersonation}.
 * Plans and COA templates come from the Phase 36 / 37 features (platform-catalogue, platform-templates).
 */
type Body = Record<string, unknown>;
const qs = (q: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
};

// ---- tenants
export type TenantListParams = { view?: string; search?: string; status?: string; plan?: string; province?: string; city?: string; page?: number; pageSize?: number };
export const listTenants = (q: TenantListParams) => apiRequest<TenantList>(`/admin/tenants${qs(q)}`);
export const getTenant = (id: string) => apiRequest<TenantDetail>(`/admin/tenants/${id}`);
export const onboardTenant = (body: Body) => apiRequest<TenantOnboardResult>("/admin/tenants", { method: "POST", body });
export const updateTenant = (id: string, body: Body) => apiRequest<TenantDetail>(`/admin/tenants/${id}`, { method: "PATCH", body });
export const setTenantModules = (id: string, rowVersion: number, modules: { moduleKey: string; enabled: boolean }[]) =>
  apiRequest<TenantDetail>(`/admin/tenants/${id}/modules`, { method: "PUT", body: { rowVersion, modules } });
export const addTenantContact = (id: string, body: Body) => apiRequest<TenantDetail>(`/admin/tenants/${id}/contacts`, { method: "POST", body });
export const addTenantNote = (id: string, body: string) => apiRequest<TenantDetail>(`/admin/tenants/${id}/notes`, { method: "POST", body: { body } });
export const setTenantStatus = (id: string, action: "suspend" | "reactivate" | "churn", body: { rowVersion: number; reason?: string; churnReason?: string }) =>
  apiRequest<TenantDetail>(`/admin/tenants/${id}/${action}`, { method: "POST", body });

// ---- support access (impersonation)
export const startImpersonation = (tenantId: string, body: { targetUserId?: string; reason: string; timeLimitMinutes: 30 | 60; isReadOnly: boolean }) =>
  apiRequest<ImpersonationStart>(`/admin/tenants/${tenantId}/impersonate`, { method: "POST", body });
export const listImpersonations = (q: { tenantId?: string; live?: boolean }) => apiRequest<ImpersonationSession[]>(`/admin/impersonation${qs(q)}`);
export const endImpersonation = (id: string) => apiRequest<ImpersonationSession>(`/admin/impersonation/${id}/end`, { method: "POST", body: {} });

// ---- subscriptions
export const listSubscriptions = () => apiRequest<SubscriptionList>("/admin/subscriptions");
export const getSubscription = (id: string) => apiRequest<SubscriptionDetail>(`/admin/subscriptions/${id}`);
export const createSubscription = (body: Body) => apiRequest<SubscriptionDetail>("/admin/subscriptions", { method: "POST", body });
export const changeSubscriptionPlan = (id: string, body: Body) => apiRequest<SubscriptionDetail>(`/admin/subscriptions/${id}/change-plan`, { method: "POST", body });
export const cancelSubscription = (id: string, body: Body) => apiRequest<SubscriptionDetail>(`/admin/subscriptions/${id}/cancel`, { method: "POST", body });
export const renewSubscription = (id: string, body: Body) => apiRequest<SubscriptionDetail>(`/admin/subscriptions/${id}/renew`, { method: "POST", body });
export const extendSubscriptionTrial = (id: string, rowVersion: number, days: 7 | 14 | 30) =>
  apiRequest<SubscriptionDetail>(`/admin/subscriptions/${id}/extend-trial`, { method: "POST", body: { rowVersion, days } });
export const runRenewals = () => apiRequest<RenewalRunResult>("/admin/subscriptions/run-renewals", { method: "POST", body: {} });

// ---- usage
export const getUsage = (tenantId?: string) => apiRequest<UsageOverview>(`/admin/usage${qs({ tenantId })}`);
export const refreshUsage = (tenantId?: string) => apiRequest<{ captured: number }>("/admin/usage/refresh", { method: "POST", body: tenantId ? { tenantId } : {} });
export const addUsageOverride = (body: Body) => apiRequest<UsageOverride>("/admin/usage/overrides", { method: "POST", body });
export const revokeUsageOverride = (id: string, rowVersion: number) => apiRequest<UsageOverride>(`/admin/usage/overrides/${id}/revoke`, { method: "POST", body: { rowVersion } });
