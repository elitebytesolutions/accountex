import type { FinancialStatement, ReminderRunResult, ReminderRunsOverview, ReopenRequest, YearEnd } from "@/shared";
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

/** Browser clients for Phase 29 (period reopen requests, year-end close, reminder runs, financial statements). */
export const listReopenRequests = () => apiRequest<ReopenRequest[]>("/accounting/period-reopen-requests");
export const requestReopen = (body: Body) => post<ReopenRequest>("/accounting/period-reopen-requests", body);
export const decideReopen = (id: string, action: "approve" | "reject" | "cancel", comment?: string | null) => post<ReopenRequest>(`/accounting/period-reopen-requests/${id}/${action}`, { comment });
export const recloseReopen = (id: string) => post<ReopenRequest>(`/accounting/period-reopen-requests/${id}/reclose`);

export const getYearEnd = (fiscalYearId: string) => apiRequest<YearEnd>(`/accounting/year-end/${fiscalYearId}`);
export const addYearEndAdjustment = (fiscalYearId: string, body: Body) => post<YearEnd>(`/accounting/year-end/${fiscalYearId}/adjustments`, body);
export const postYearEndAdjustment = (fiscalYearId: string, id: string) => post<YearEnd>(`/accounting/year-end/${fiscalYearId}/adjustments/${id}/post`);
export const removeYearEndAdjustment = (fiscalYearId: string, id: string) => apiRequest<YearEnd>(`/accounting/year-end/${fiscalYearId}/adjustments/${id}`, { method: "DELETE" });
export const yearEndDryRun = (fiscalYearId: string) => post<YearEnd>(`/accounting/year-end/${fiscalYearId}/dry-run`);
export const yearEndClose = (fiscalYearId: string, acknowledgeWarnings: boolean) => post<YearEnd>(`/accounting/year-end/${fiscalYearId}/close`, { acknowledgeWarnings });
export const cancelYearEndRun = (runId: string, rowVersion: number, reason: string) => post<YearEnd>(`/accounting/year-end/runs/${runId}/cancel`, { rowVersion, reason });

export const reminderRuns = () => apiRequest<ReminderRunsOverview>("/receivables/reminder-runs");
export const runReminders = (body: { customerId?: string | null; invoiceIds?: string[] } = {}) => post<ReminderRunResult>("/receivables/reminder-runs", body);

export const profitAndLoss = (q: { from: string; to: string; cmpFrom?: string; cmpTo?: string; branch?: string }) => apiRequest<FinancialStatement>(`/reports/financial-statements/pnl${qs(q)}`);
export const balanceSheet = (q: { asAt: string; cmpAsAt?: string; branch?: string }) => apiRequest<FinancialStatement>(`/reports/financial-statements/balance-sheet${qs(q)}`);
export const cashFlow = (q: { from: string; to: string; branch?: string }) => apiRequest<FinancialStatement>(`/reports/financial-statements/cash-flow${qs(q)}`);
