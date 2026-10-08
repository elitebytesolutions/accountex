import type {
  AdminHistoryPage, CoaImportReport, CoaTemplate, CoaTemplateDetail, CommPreview, CommTemplate, ConnectionTestResult, RoleGrantMatrix, RoleGrantRole,
  SalarySlabYear, SalesTaxRate, SeedLeaveType, SeedListKind, SeedSalaryComponent, SeedTaxCode, TaxAuthority, TaxMaster, TaxMasterPublishResult, WithholdingRate,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser-side Super Admin calls of Phase 37: /api/admin/{coa-templates,seed,tax-master,comm-templates}. */
type Body = Record<string, unknown>;
const q = (rowVersion: number) => `?rowVersion=${rowVersion}`;

// COA templates
export const listCoaTemplates = () => apiRequest<CoaTemplate[]>("/admin/coa-templates");
export const getCoaTemplate = (id: string) => apiRequest<CoaTemplateDetail>(`/admin/coa-templates/${id}`);
export const createCoaTemplate = (body: Body) => apiRequest<CoaTemplateDetail>("/admin/coa-templates", { method: "POST", body });
export const updateCoaTemplate = (id: string, body: Body) => apiRequest<CoaTemplateDetail>(`/admin/coa-templates/${id}`, { method: "PATCH", body });
export const setCoaTemplateStatus = (id: string, action: "publish" | "retire" | "default", rowVersion: number) =>
  apiRequest<CoaTemplateDetail>(`/admin/coa-templates/${id}/${action}`, { method: "POST", body: { rowVersion } });
export const importCoaCsv = (id: string, rowVersion: number, csv: string, dryRun: boolean) =>
  apiRequest<CoaImportReport>(`/admin/coa-templates/${id}/import`, { method: "POST", body: { rowVersion, csv, dryRun } });
export const deleteCoaTemplate = (id: string, rowVersion: number) => apiRequest<void>(`/admin/coa-templates/${id}${q(rowVersion)}`, { method: "DELETE" });

// master seed lists
export type SeedRow = { "leave-types": SeedLeaveType; "salary-components": SeedSalaryComponent; "tax-codes": SeedTaxCode };
export const listSeed = <K extends SeedListKind>(kind: K) => apiRequest<SeedRow[K][]>(`/admin/seed/${kind}`);
export const createSeed = (kind: SeedListKind, body: Body) => apiRequest<unknown>(`/admin/seed/${kind}`, { method: "POST", body });
export const updateSeed = (kind: SeedListKind, id: string, body: Body) => apiRequest<unknown>(`/admin/seed/${kind}/${id}`, { method: "PATCH", body });
export const deleteSeed = (kind: SeedListKind, id: string, rowVersion: number) => apiRequest<void>(`/admin/seed/${kind}/${id}${q(rowVersion)}`, { method: "DELETE" });

// default role grants
export const getRoleGrants = () => apiRequest<RoleGrantMatrix>("/admin/seed/role-grants");
export const saveRoleGrants = (systemKey: string, permissions: string[]) =>
  apiRequest<RoleGrantRole>(`/admin/seed/role-grants/${systemKey}`, { method: "PUT", body: { permissions } });
export const roleGrantHistory = (systemKey: string, page = 1, pageSize = 50) =>
  apiRequest<AdminHistoryPage>(`/admin/seed/role-grants/${systemKey}/history?page=${page}&pageSize=${pageSize}`);

// tax master
export const getTaxMaster = () => apiRequest<TaxMaster>("/admin/tax-master");
export const taxMasterLog = (page = 1, pageSize = 50) => apiRequest<AdminHistoryPage>(`/admin/tax-master/log?page=${page}&pageSize=${pageSize}`);
export const scheduleSalesTax = (body: Body) => apiRequest<SalesTaxRate>("/admin/tax-master/sales-tax", { method: "POST", body });
export const updateSalesTax = (id: string, body: Body) => apiRequest<SalesTaxRate>(`/admin/tax-master/sales-tax/${id}`, { method: "PATCH", body });
export const cancelSalesTax = (id: string, rowVersion: number) => apiRequest<void>(`/admin/tax-master/sales-tax/${id}${q(rowVersion)}`, { method: "DELETE" });
export const scheduleWithholding = (body: Body) => apiRequest<WithholdingRate>("/admin/tax-master/withholding", { method: "POST", body });
export const updateWithholding = (id: string, body: Body) => apiRequest<WithholdingRate>(`/admin/tax-master/withholding/${id}`, { method: "PATCH", body });
export const cancelWithholding = (id: string, rowVersion: number) => apiRequest<void>(`/admin/tax-master/withholding/${id}${q(rowVersion)}`, { method: "DELETE" });
export const saveSalarySlabs = (taxYear: number, body: Body) => apiRequest<SalarySlabYear>(`/admin/tax-master/salary-slabs/${taxYear}`, { method: "PUT", body });
export const updateAuthority = (id: string, body: Body) => apiRequest<TaxAuthority>(`/admin/tax-master/authorities/${id}`, { method: "PATCH", body });
export const testAuthority = (id: string) => apiRequest<ConnectionTestResult>(`/admin/tax-master/authorities/${id}/test`, { method: "POST" });
export const publishTaxMaster = (masterVersion?: string) =>
  apiRequest<TaxMasterPublishResult>("/admin/tax-master/publish", { method: "POST", body: masterVersion ? { masterVersion } : {} });

// communication templates
export const listCommTemplates = () => apiRequest<CommTemplate[]>("/admin/comm-templates");
export const createCommTemplate = (body: Body) => apiRequest<CommTemplate>("/admin/comm-templates", { method: "POST", body });
export const updateCommTemplate = (id: string, body: Body) => apiRequest<CommTemplate>(`/admin/comm-templates/${id}`, { method: "PATCH", body });
export const deleteCommTemplate = (id: string, rowVersion: number) => apiRequest<void>(`/admin/comm-templates/${id}${q(rowVersion)}`, { method: "DELETE" });
export const previewCommTemplate = (id: string, lang: "en" | "ur") => apiRequest<CommPreview>(`/admin/comm-templates/${id}/preview`, { method: "POST", body: { lang } });
