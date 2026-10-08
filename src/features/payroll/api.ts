import type { PayGroup, PayrollOptions, SalaryComponent, SalaryStructure, SalaryView, TaxYear } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });
const act = <T,>(path: string, action: string, rowVersion: number) => apiRequest<T>(`${path}/${action}`, { method: "POST", body: { rowVersion } });

/** Browser clients for Phase 12 payroll setup. */
export const payrollOptions = () => apiRequest<PayrollOptions>("/payroll/options");

export const listComponents = () => apiRequest<SalaryComponent[]>("/payroll/components");
export const createComponent = (body: Body) => apiRequest<SalaryComponent>("/payroll/components", { method: "POST", body });
export const updateComponent = (id: string, body: Body & Version) => apiRequest<SalaryComponent>(`/payroll/components/${id}`, { method: "PATCH", body });
export const setComponentActive = (id: string, on: boolean, rv: number) => act<SalaryComponent>(`/payroll/components/${id}`, on ? "activate" : "deactivate", rv);
export const deleteComponent = (id: string, rv: number) => del(`/payroll/components/${id}`, rv);

export const listStructures = () => apiRequest<SalaryStructure[]>("/payroll/structures");
export const createStructure = (body: Body) => apiRequest<SalaryStructure>("/payroll/structures", { method: "POST", body });
export const updateStructure = (id: string, body: Body & Version) => apiRequest<SalaryStructure>(`/payroll/structures/${id}`, { method: "PATCH", body });
export const structureStatus = (id: string, action: "activate" | "retire" | "draft", rv: number) => act<SalaryStructure>(`/payroll/structures/${id}`, action, rv);
export const duplicateStructure = (id: string, body: { code: string; name: string }) => apiRequest<SalaryStructure>(`/payroll/structures/${id}/duplicate`, { method: "POST", body });
export const deleteStructure = (id: string, rv: number) => del(`/payroll/structures/${id}`, rv);

export const listPayGroups = () => apiRequest<PayGroup[]>("/payroll/pay-groups");
export const createPayGroup = (body: Body) => apiRequest<PayGroup>("/payroll/pay-groups", { method: "POST", body });
export const updatePayGroup = (id: string, body: Body & Version) => apiRequest<PayGroup>(`/payroll/pay-groups/${id}`, { method: "PATCH", body });
export const setPayGroupActive = (id: string, on: boolean, rv: number) => act<PayGroup>(`/payroll/pay-groups/${id}`, on ? "activate" : "deactivate", rv);
export const deletePayGroup = (id: string, rv: number) => del(`/payroll/pay-groups/${id}`, rv);

export const listTaxYears = () => apiRequest<TaxYear[]>("/payroll/tax-slabs");
export const saveTaxYear = (year: string, slabs: Body[]) => apiRequest<TaxYear>(`/payroll/tax-slabs/${year}`, { method: "PUT", body: { slabs } });
export const copyTaxYear = (from: string, to: string) => apiRequest<TaxYear>(`/payroll/tax-slabs/${from}/copy-to/${to}`, { method: "POST" });
export const deleteTaxYear = (year: string) => apiRequest<void>(`/payroll/tax-slabs/${year}`, { method: "DELETE" });
/** Phase 37: copy the Tax Master's section 149 slabs of a tax year (e.g. "2026-27") into the company. */
export const importTaxMasterSlabs = (taxYear: string) => apiRequest<TaxYear>("/payroll/tax-slabs/import-master", { method: "POST", body: { taxYear } });

export const employeeSalary = (employee: string) => apiRequest<SalaryView>(`/payroll/employee-salaries?employee=${employee}`);
export const addSalary = (body: Body) => apiRequest<SalaryView>("/payroll/employee-salaries", { method: "POST", body });
export const reviseSalary = (employeeId: string, body: Body & Version) => apiRequest<SalaryView>(`/payroll/employee-salaries/${employeeId}/revise`, { method: "POST", body });
export const deleteSalary = (id: string, rv: number) => apiRequest<SalaryView>(`/payroll/employee-salaries/${id}?rowVersion=${rv}`, { method: "DELETE" });
