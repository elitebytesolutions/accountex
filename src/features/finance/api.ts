import type {
  Account,
  AccountCreateFields,
  AccountMapping,
  AccountTemplate,
  AllocationRule,
  AllocationRuleSaveFields,
  CostCentre,
  CostCentreCreateFields,
  FiscalYear,
  Ledger,
  LedgerView,
  PeriodModule,
  Project,
  ProjectCreateFields,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for Finance: chart of accounts, ledger, fiscal periods, cost centres and account mapping. */

// Chart of accounts
export const listAccounts = () => apiRequest<Account[]>("/accounting/accounts");
export const listRetiredAccountCodes = () => apiRequest<string[]>("/accounting/accounts/retired-codes");
export const listAccountTemplates = () => apiRequest<AccountTemplate[]>("/accounting/account-templates");
export const applyAccountTemplate = (templateId: string) =>
  apiRequest<{ created: number }>("/accounting/accounts/apply-template", { method: "POST", body: { templateId } });
export const createAccount = (body: AccountCreateFields) => apiRequest<Account>("/accounting/accounts", { method: "POST", body });
export const updateAccount = (
  id: string,
  body: { name?: string; description?: string | null; subType?: string | null; currencyCode?: string; branchIds?: string[]; rowVersion: number },
) => apiRequest<Account>(`/accounting/accounts/${id}`, { method: "PATCH", body });
export const setAccountsStatus = (ids: string[], status: "ACTIVE" | "INACTIVE") =>
  apiRequest<{ updated: number }>("/accounting/accounts/bulk-status", { method: "POST", body: { ids, status } });
export const deleteAccount = (id: string, rowVersion: number) => apiRequest<void>(`/accounting/accounts/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Ledger
export const getLedger = (id: string, from: string, to: string) => apiRequest<Ledger>(`/accounting/accounts/${id}/ledger?from=${from}&to=${to}`);
export const listLedgerViews = () => apiRequest<LedgerView[]>("/accounting/ledger-views");
type ViewBody = { name: string; accountId: string | null; rangeLabel: string | null; dateFrom: string | null; dateTo: string | null; filters?: Record<string, unknown>; isShared: boolean };
export const createLedgerView = (body: ViewBody) => apiRequest<LedgerView>("/accounting/ledger-views", { method: "POST", body });
export const updateLedgerView = (id: string, body: ViewBody & { rowVersion: number }) =>
  apiRequest<LedgerView>(`/accounting/ledger-views/${id}`, { method: "PATCH", body });
export const deleteLedgerView = (id: string, rowVersion: number) =>
  apiRequest<void>(`/accounting/ledger-views/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Fiscal years & periods
export const listFiscalYears = () => apiRequest<FiscalYear[]>("/accounting/fiscal-years");
export const createFiscalYear = (body: { startDate?: string | null; hasAdjustmentPeriod: boolean }) =>
  apiRequest<FiscalYear>("/accounting/fiscal-years", { method: "POST", body });
export const periodAction = (id: string, action: "close" | "lock" | "reopen", rowVersion: number, modules?: PeriodModule[]) =>
  apiRequest<FiscalYear[]>(`/accounting/periods/${id}/${action}`, { method: "POST", body: { rowVersion, modules } });

// Cost centres, projects, allocation rules
export const listCostCentres = () => apiRequest<CostCentre[]>("/accounting/cost-centres");
export const createCostCentre = (body: CostCentreCreateFields) => apiRequest<CostCentre>("/accounting/cost-centres", { method: "POST", body });
export const updateCostCentre = (id: string, body: Partial<CostCentreCreateFields> & { rowVersion: number }) =>
  apiRequest<CostCentre>(`/accounting/cost-centres/${id}`, { method: "PATCH", body });
export const setCostCentreStatus = (id: string, action: "activate" | "deactivate", rowVersion: number) =>
  apiRequest<CostCentre>(`/accounting/cost-centres/${id}/${action}`, { method: "POST", body: { rowVersion } });
export const deleteCostCentre = (id: string, rowVersion: number) =>
  apiRequest<void>(`/accounting/cost-centres/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
export const listProjects = () => apiRequest<Project[]>("/accounting/projects");
export const createProject = (body: ProjectCreateFields) => apiRequest<Project>("/accounting/projects", { method: "POST", body });
export const updateProject = (id: string, body: Partial<ProjectCreateFields> & { rowVersion: number }) =>
  apiRequest<Project>(`/accounting/projects/${id}`, { method: "PATCH", body });
export const deleteProject = (id: string, rowVersion: number) => apiRequest<void>(`/accounting/projects/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
export const listAllocationRules = () => apiRequest<AllocationRule[]>("/accounting/cost-allocation-rules");
export const createAllocationRule = (body: AllocationRuleSaveFields) => apiRequest<AllocationRule>("/accounting/cost-allocation-rules", { method: "POST", body });
export const updateAllocationRule = (id: string, body: AllocationRuleSaveFields & { rowVersion: number }) =>
  apiRequest<AllocationRule>(`/accounting/cost-allocation-rules/${id}`, { method: "PATCH", body });
export const deleteAllocationRule = (id: string, rowVersion: number) =>
  apiRequest<void>(`/accounting/cost-allocation-rules/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// Default account mapping
export const listAccountMappings = () => apiRequest<AccountMapping[]>("/settings/account-mappings");
export const saveAccountMappings = (mappings: { role: string; accountId: string | null }[]) =>
  apiRequest<AccountMapping[]>("/settings/account-mappings", { method: "PUT", body: { mappings } });
