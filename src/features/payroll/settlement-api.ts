import type { SettlementCalcSummary, SettlementDetail, SettlementList, SettlementOptions } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const post = <T,>(path: string, body: Body = {}) => apiRequest<T>(path, { method: "POST", body });
const base = "/payroll/final-settlements";

/** Browser clients for Phase 33 final settlements. */
export const listSettlements = (q: { status?: string; search?: string } = {}) => {
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
  return apiRequest<SettlementList>(`${base}${p.size ? `?${p}` : ""}`);
};
export const getSettlement = (id: string) => apiRequest<SettlementDetail>(`${base}/${id}`);
export const settlementOptions = (id: string) => apiRequest<SettlementOptions>(`${base}/${id}/options`);
export const settlementOfOffboarding = (offboardingId: string) => apiRequest<{ settlement: { id: string; docNo: string; status: string } | null }>(`${base}/of-offboarding/${offboardingId}`);
export const startSettlement = (offboardingId: string) => post<SettlementDetail>(base, { offboardingId });
export const recalculateSettlement = (id: string) => post<SettlementDetail & { summary: SettlementCalcSummary }>(`${base}/${id}/calculate`);
export const updateSettlement = (id: string, body: Body) => apiRequest<SettlementDetail>(`${base}/${id}`, { method: "PATCH", body });
export const submitSettlement = (id: string) => post<SettlementDetail>(`${base}/${id}/submit`);
export const approveSettlement = (id: string, comment: string | null) => post<SettlementDetail>(`${base}/${id}/approve`, { comment });
export const rejectSettlement = (id: string, reason: string) => post<SettlementDetail>(`${base}/${id}/reject`, { reason });
export const sendBackSettlement = (id: string, reason: string) => post<SettlementDetail>(`${base}/${id}/send-back`, { reason });
export const paySettlement = (id: string, body: Body) => post<SettlementDetail>(`${base}/${id}/pay`, body);
export const cancelSettlement = (id: string, reason: string) => post<SettlementDetail>(`${base}/${id}/cancel`, { reason });
