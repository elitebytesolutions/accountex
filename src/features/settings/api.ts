import type {
  Branch,
  BranchCreateFields,
  CompanySettings,
  Currency,
  DocumentType,
  ExchangeRate,
  ExchangeRateCreateFields,
  ListResult,
  LookupsResponse,
  NumberingSeries,
  NumberingSeriesCreateFields,
  SettingsSection,
  SetupGuide,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for /api/settings/* and /api/lookups. */

export const getLookups = (types: string[]) => apiRequest<LookupsResponse>(`/lookups?types=${types.join(",")}`);

// Company settings (one tab = one section)
export const getCompanySettings = () => apiRequest<CompanySettings>("/settings/company");
export const saveSettingsSection = (section: SettingsSection, body: Record<string, unknown>) =>
  apiRequest<CompanySettings>(`/settings/company/${section}`, { method: "PUT", body });

// Branches
export const listBranches = (q: { page: number; pageSize: number; sort?: string; search?: string }) => {
  const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
  if (q.sort) p.set("sort", q.sort);
  if (q.search) p.set("search", q.search);
  return apiRequest<ListResult<Branch>>(`/settings/branches?${p}`);
};
export const createBranch = (body: BranchCreateFields) => apiRequest<Branch>("/settings/branches", { method: "POST", body });
export const updateBranch = (id: string, body: Partial<BranchCreateFields> & { rowVersion: number }) =>
  apiRequest<Branch>(`/settings/branches/${id}`, { method: "PATCH", body });
export const branchAction = (id: string, action: "deactivate" | "activate" | "make-default", rowVersion: number) =>
  apiRequest<Branch>(`/settings/branches/${id}/${action}`, { method: "POST", body: { rowVersion } });
export const deleteBranch = (id: string, rowVersion: number) =>
  apiRequest<void>(`/settings/branches/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Currencies & exchange rates
export const listCurrencies = () => apiRequest<Currency[]>("/settings/currencies");
export const listRates = (code: string, page = 1, pageSize = 10) =>
  apiRequest<ListResult<ExchangeRate>>(`/settings/currencies/${code}/rates?page=${page}&pageSize=${pageSize}`);
export const addRate = (code: string, body: ExchangeRateCreateFields) =>
  apiRequest<ExchangeRate>(`/settings/currencies/${code}/rates`, { method: "POST", body });
export const updateRate = (code: string, id: string, body: Partial<ExchangeRateCreateFields> & { rowVersion: number }) =>
  apiRequest<ExchangeRate>(`/settings/currencies/${code}/rates/${id}`, { method: "PATCH", body });
export const deleteRate = (code: string, id: string, rowVersion: number) =>
  apiRequest<void>(`/settings/currencies/${code}/rates/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Numbering series
export const listNumberingSeries = () => apiRequest<NumberingSeries[]>("/settings/numbering-series");
export const listDocumentTypes = () => apiRequest<DocumentType[]>("/settings/document-types");
export const createSeries = (body: NumberingSeriesCreateFields) => apiRequest<NumberingSeries>("/settings/numbering-series", { method: "POST", body });
export const updateSeries = (id: string, body: Partial<NumberingSeriesCreateFields> & { rowVersion: number }) =>
  apiRequest<NumberingSeries>(`/settings/numbering-series/${id}`, { method: "PATCH", body });
export const deleteSeries = (id: string, rowVersion: number) =>
  apiRequest<void>(`/settings/numbering-series/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Setup guide
export const getSetupGuide = () => apiRequest<SetupGuide>("/settings/setup-guide");
export const setStepDone = (key: string, done: boolean) =>
  apiRequest<SetupGuide>(`/settings/setup-guide/${key}/${done ? "complete" : "reopen"}`, { method: "POST" });
