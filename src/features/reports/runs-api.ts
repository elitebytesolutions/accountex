import type { ReportRun } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Phase 35: run a saved report to a CSV file and list / download the run history. */
export const runSavedReport = (id: string, format: "CSV" = "CSV") => apiRequest<ReportRun>(`/reports/saved/${id}/run`, { method: "POST", body: { format } });
export const listReportRuns = (q: { report?: string; mine?: boolean; page?: number; pageSize?: number } = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== false) p.set(k, String(v));
  const s = p.toString();
  return apiRequest<{ items: ReportRun[]; total: number }>(`/reports/runs${s ? `?${s}` : ""}`);
};
export const reportRunDownloadUrl = (id: string) => `/api/reports/runs/${id}/download`;
