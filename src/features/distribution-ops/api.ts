import type {
  CreditControl, CreditOverride, DistributionOpsOptions, LoadCandidate, LoadSheet, LoadSheetList, RecoverySheet, RecoverySheetList, RouteSettlement, RouteSettlementList,
  SalesmanCommission, SalesmanTarget, TargetsOverview,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Q = Record<string, string | number | boolean | null | undefined>;
const qs = (q: Q) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const post = <T,>(path: string, body?: Body) => apiRequest<T>(path, { method: "POST", body });
const patch = <T,>(path: string, body: Body) => apiRequest<T>(path, { method: "PATCH", body });
const put = <T,>(path: string, body: Body) => apiRequest<T>(path, { method: "PUT", body });
const del = (path: string, rv: number) => apiRequest<void>(`${path}?rowVersion=${rv}`, { method: "DELETE" });

/** Browser clients for Phase 26 (load sheets, route settlements, recovery sheets, targets & commissions, credit control). */
export const distributionOpsOptions = () => apiRequest<DistributionOpsOptions>("/distribution/ops-options");

export const loadCandidates = (route: string, date: string) => apiRequest<LoadCandidate[]>(`/distribution/load-sheets/candidates${qs({ route, date })}`);
export const listLoadSheets = (q: Q) => apiRequest<LoadSheetList>(`/distribution/load-sheets${qs(q)}`);
export const getLoadSheet = (id: string) => apiRequest<LoadSheet>(`/distribution/load-sheets/${id}`);
export const createLoadSheet = (body: Body) => post<LoadSheet>("/distribution/load-sheets", body);
export const updateLoadSheet = (id: string, body: Body) => patch<LoadSheet>(`/distribution/load-sheets/${id}`, body);
export const deleteLoadSheet = (id: string, rv: number) => del(`/distribution/load-sheets/${id}`, rv);
export const loadSheetAction = (id: string, action: "approve" | "dispatch", rv: number) => post<LoadSheet>(`/distribution/load-sheets/${id}/${action}`, { rowVersion: rv });
export const cancelLoadSheet = (id: string, rv: number, reason: string) => post<LoadSheet>(`/distribution/load-sheets/${id}/cancel`, { rowVersion: rv, reason });
export const setDelivery = (id: string, invoiceId: string, state: "FULL" | "PARTIAL" | "NONE", reason?: string | null) =>
  patch<LoadSheet>(`/distribution/load-sheets/${id}/invoices/${invoiceId}/delivery`, { state, reason });

export const listSettlements = (q: Q) => apiRequest<RouteSettlementList>(`/distribution/settlements${qs(q)}`);
export const getSettlement = (id: string) => apiRequest<RouteSettlement>(`/distribution/settlements/${id}`);
export const saveSettlement = (id: string, body: Body) => put<RouteSettlement>(`/distribution/settlements/${id}`, body);
export const postSettlement = (id: string, rv: number) => post<RouteSettlement>(`/distribution/settlements/${id}/post`, { rowVersion: rv });

export const listRecovery = (q: Q) => apiRequest<RecoverySheetList>(`/distribution/recovery-sheets${qs(q)}`);
export const getRecovery = (id: string) => apiRequest<RecoverySheet>(`/distribution/recovery-sheets/${id}`);
export const generateRecovery = (body: { routeId: string; docDate: string; salesmanEmployeeId?: string | null }) => post<RecoverySheet>("/distribution/recovery-sheets/generate", body);
export const saveRecoveryLines = (id: string, body: Body) => put<RecoverySheet>(`/distribution/recovery-sheets/${id}/lines`, body);
export const postRecovery = (id: string, rv: number, cashAccountId: string) => post<RecoverySheet>(`/distribution/recovery-sheets/${id}/post`, { rowVersion: rv, cashAccountId });

export const targetsOverview = () => apiRequest<TargetsOverview>("/distribution/targets");
export const createTarget = (body: Body) => post<SalesmanTarget>("/distribution/targets", body);
export const updateTarget = (id: string, body: Body) => patch<SalesmanTarget>(`/distribution/targets/${id}`, body);
export const deleteTarget = (id: string, rv: number) => del(`/distribution/targets/${id}`, rv);
export const calculateCommissions = (periodStart: string, periodEnd: string) => post<TargetsOverview>("/distribution/commissions/calculate", { periodStart, periodEnd });
export const commissionAction = (id: string, action: "approve" | "post" | "cancel" | "send-to-payroll", rv: number) =>
  post<SalesmanCommission>(`/distribution/commissions/${id}/${action}`, { rowVersion: rv });

export const creditControl = () => apiRequest<CreditControl>("/receivables/credit");
export const creditHold = (customerId: string, action: "place" | "release", reason: string, notes?: string | null) =>
  post<CreditControl>(`/receivables/credit/holds/${customerId}/${action}`, { reason, notes });
export const requestOverride = (body: Body) => post<CreditOverride>("/receivables/credit/overrides", body);
export const decideOverride = (id: string, action: "approve" | "reject", comment?: string | null) => post<CreditOverride>(`/receivables/credit/overrides/${id}/${action}`, { comment });
