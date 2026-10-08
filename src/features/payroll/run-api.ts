import type { PayrollOverview, PayrollRun, RunList, RunOptions, RunPreview } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
const post = (path: string, body?: Body) => apiRequest<PayrollRun>(path, { method: "POST", body: body ?? {} });

/** Browser clients for Phase 32 payroll runs (overview and the run wizard). */
export const payrollOverview = () => apiRequest<PayrollOverview>("/payroll/overview");
export const listPayrollRuns = (q: { status?: string; year?: string; page?: number } = {}) => {
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
  return apiRequest<RunList>(`/payroll/runs${p.size ? `?${p}` : ""}`);
};
export const payrollRunOptions = () => apiRequest<RunOptions>("/payroll/runs/options");
export const payrollRunPreview = (month: string, payGroup?: string | null, runType = "REGULAR") =>
  apiRequest<RunPreview>(`/payroll/runs/preview?month=${month}&runType=${runType}${payGroup ? `&payGroup=${payGroup}` : ""}`);
export const getPayrollRun = (id: string) => apiRequest<PayrollRun>(`/payroll/runs/${id}`);
export const createPayrollRun = (body: Body) => apiRequest<PayrollRun>("/payroll/runs", { method: "POST", body });
export const updatePayrollRun = (id: string, body: Body) => apiRequest<PayrollRun>(`/payroll/runs/${id}`, { method: "PATCH", body });
export const syncPayrollInputs = (id: string) => post(`/payroll/runs/${id}/sync-inputs`);
export const savePayrollAdjustments = (id: string, adjustments: Body[], rowVersion: number) =>
  apiRequest<PayrollRun>(`/payroll/runs/${id}/adjustments`, { method: "PUT", body: { adjustments, rowVersion } });
export const calculatePayrollRun = (id: string) => post(`/payroll/runs/${id}/calculate`);
export const setPayrollChecklist = (id: string, itemKey: string, isDone: boolean) =>
  apiRequest<PayrollRun>(`/payroll/runs/${id}/checklist`, { method: "PUT", body: { itemKey, isDone } });
export const submitPayrollRun = (id: string) => post(`/payroll/runs/${id}/submit`);
export const approvePayrollRun = (id: string, comment: string | null) => post(`/payroll/runs/${id}/approve`, { comment });
export const rejectPayrollRun = (id: string, reason: string) => post(`/payroll/runs/${id}/reject`, { reason });
export const sendBackPayrollRun = (id: string, reason: string) => post(`/payroll/runs/${id}/send-back`, { reason });
export const postPayrollRun = (id: string, body: { publishToEss: boolean; createDepositReminders: boolean }) => post(`/payroll/runs/${id}/post`, body);
export const payPayrollRun = (id: string, body: Body) => post(`/payroll/runs/${id}/pay`, body);
export const cancelPayrollRun = (id: string, reason: string) => post(`/payroll/runs/${id}/cancel`, { reason });
export const reversePayrollRun = (id: string, reason: string) => post(`/payroll/runs/${id}/reverse`, { reason });
/** Same-origin link: the browser downloads the CSV with the session cookie. */
export const payrollBankAdviceUrl = (id: string) => `/api/payroll/runs/${id}/bank-advice`;
