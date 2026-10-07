import type { ReportOptions, ReportPreview, SavedReport, SavedReportSummary } from "@/shared/reports/saved-report";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;

/** Browser clients for Report Studio (Phase 15). */
export const reportOptions = () => apiRequest<ReportOptions>("/reports/options");
export const previewReport = (body: Body) => apiRequest<ReportPreview>("/reports/preview", { method: "POST", body });

export const listSavedReports = () => apiRequest<SavedReportSummary[]>("/reports/saved");
export const getSavedReport = (id: string) => apiRequest<SavedReport>(`/reports/saved/${id}`);
export const createSavedReport = (body: Body) => apiRequest<SavedReport>("/reports/saved", { method: "POST", body });
export const updateSavedReport = (id: string, body: Body & { rowVersion: number }) => apiRequest<SavedReport>(`/reports/saved/${id}`, { method: "PATCH", body });
export const setSavedReportShares = (id: string, body: Body & { rowVersion: number }) => apiRequest<SavedReport>(`/reports/saved/${id}/shares`, { method: "PUT", body });
export const deleteSavedReport = (id: string, rowVersion: number) => apiRequest<void>(`/reports/saved/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

export const createReportSchedule = (reportId: string, body: Body) => apiRequest<SavedReport>(`/reports/saved/${reportId}/schedules`, { method: "POST", body });
export const updateReportSchedule = (reportId: string, id: string, body: Body & { rowVersion: number }) => apiRequest<SavedReport>(`/reports/saved/${reportId}/schedules/${id}`, { method: "PATCH", body });
export const deleteReportSchedule = (reportId: string, id: string, rowVersion: number) => apiRequest<SavedReport>(`/reports/saved/${reportId}/schedules/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
