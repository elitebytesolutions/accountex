import type {
  BillingRunResult, DunningCaseDetail, DunningQueue, InvoiceChip, InvoiceGenerateResult, InvoiceList, PayoutCalculateResult, PayoutList, PlatformInvoiceDetail,
  PlatformPayment, ResellerAttribution, ResellerPayout, TenantDunningState,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser-side Super Admin calls of Phase 41 (platform billing): /api/admin/{invoices,payments,dunning,billing,payouts,resellers/:id/tenants}. */
type Body = Record<string, unknown>;
const qs = (q: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
};

// ---- invoices + payments
export type InvoiceListParams = { month?: string; status?: InvoiceChip; search?: string; tenantId?: string; page?: number; pageSize?: number };
export const listInvoices = (q: InvoiceListParams) => apiRequest<InvoiceList>(`/admin/invoices${qs(q)}`);
export const getInvoice = (id: string) => apiRequest<PlatformInvoiceDetail>(`/admin/invoices/${id}`);
export const createInvoice = (body: Body) => apiRequest<PlatformInvoiceDetail>("/admin/invoices", { method: "POST", body });
export const updateInvoice = (id: string, body: Body) => apiRequest<PlatformInvoiceDetail>(`/admin/invoices/${id}`, { method: "PATCH", body });
export const issueInvoice = (id: string, rowVersion: number) => apiRequest<PlatformInvoiceDetail>(`/admin/invoices/${id}/issue`, { method: "POST", body: { rowVersion } });
export const voidInvoice = (id: string, rowVersion: number, reason: string) =>
  apiRequest<PlatformInvoiceDetail>(`/admin/invoices/${id}/void`, { method: "POST", body: { rowVersion, reason } });
export const generateInvoices = (period: string | undefined, body: Body) =>
  apiRequest<InvoiceGenerateResult>(`/admin/invoices/generate${qs({ period })}`, { method: "POST", body });
export const recordPayment = (invoiceId: string, body: Body) => apiRequest<PlatformInvoiceDetail>(`/admin/invoices/${invoiceId}/payments`, { method: "POST", body });
export const refundPayment = (id: string, body: Body) => apiRequest<PlatformPayment>(`/admin/payments/${id}/refund`, { method: "POST", body });
export const runBilling = () => apiRequest<BillingRunResult>("/admin/billing/run", { method: "POST", body: {} });

// ---- dunning
export const getDunningQueue = () => apiRequest<DunningQueue>("/admin/dunning/queue");
export const getDunningCase = (id: string) => apiRequest<DunningCaseDetail>(`/admin/dunning/cases/${id}`);
export const getTenantDunning = (tenantId: string) => apiRequest<TenantDunningState>(`/admin/dunning/tenants/${tenantId}`);
export const runDunning = () => apiRequest<BillingRunResult>("/admin/dunning/run", { method: "POST", body: {} });
export type CaseAction = "attempt" | "promise" | "resolve" | "write-off" | "escalate";
export const dunningCaseAction = (id: string, action: CaseAction, body: Body) =>
  apiRequest<DunningCaseDetail>(`/admin/dunning/cases/${id}/${action}`, { method: "POST", body });

// ---- reseller payouts + attribution
export const getPayout = (id: string) => apiRequest<ResellerPayout>(`/admin/payouts/${id}`);
export const listPayouts = (q: { partnerId?: string; month?: string } = {}) => apiRequest<PayoutList>(`/admin/payouts${qs(q)}`);
export const calculatePayouts = (month?: string) => apiRequest<PayoutCalculateResult>(`/admin/payouts/calculate${qs({ month })}`, { method: "POST", body: {} });
export const payPayout = (id: string, body: Body) => apiRequest<ResellerPayout>(`/admin/payouts/${id}/pay`, { method: "POST", body });
export const cancelPayout = (id: string, rowVersion: number) => apiRequest<ResellerPayout>(`/admin/payouts/${id}/cancel`, { method: "POST", body: { rowVersion } });
export const listAttributions = (partnerId: string) => apiRequest<ResellerAttribution[]>(`/admin/resellers/${partnerId}/tenants`);
export const setAttribution = (partnerId: string, body: Body) => apiRequest<ResellerAttribution[]>(`/admin/resellers/${partnerId}/tenants`, { method: "POST", body });
