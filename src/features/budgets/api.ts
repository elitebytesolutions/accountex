import type { BudgetDetail, BudgetList, BudgetOptions, BudgetVariance } from "@/shared";
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

/** Browser clients for Phase 27 budgets. */
export const budgetOptions = () => apiRequest<BudgetOptions>("/accounting/budgets/options");
export const listBudgets = (q: Q) => apiRequest<BudgetList>(`/accounting/budgets${qs(q)}`);
export const getBudget = (id: string, version?: string | null) => apiRequest<BudgetDetail>(`/accounting/budgets/${id}${qs({ version })}`);
export const createBudget = (body: Body) => post<BudgetDetail>("/accounting/budgets", body);
export const deleteBudget = (id: string, rv: number) => apiRequest<void>(`/accounting/budgets/${id}?rowVersion=${rv}`, { method: "DELETE" });
export const newBudgetVersion = (id: string) => post<BudgetDetail>(`/accounting/budgets/${id}/versions`);
/** Replaces a draft version's lines: [{ accountId, costCentreId, months: 12 numbers }]. */
export const saveBudgetLines = (versionId: string, rv: number, lines: { accountId: string; costCentreId: string | null; months: number[] }[]) =>
  apiRequest<BudgetDetail>(`/accounting/budgets/versions/${versionId}/lines`, { method: "PUT", body: { rowVersion: rv, lines } });
export const submitBudgetVersion = (versionId: string) => post<BudgetDetail>(`/accounting/budgets/versions/${versionId}/submit`);
export const approveBudgetVersion = (versionId: string) => post<BudgetDetail>(`/accounting/budgets/versions/${versionId}/approve`);
/** Budget vs actual over fiscal months from..to (1 = first month of the fiscal year). */
export const budgetVariance = (id: string, q: { version?: string | null; from?: number; to?: number }) => apiRequest<BudgetVariance>(`/accounting/budgets/${id}/variance${qs(q)}`);
