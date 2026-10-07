import type { BinGenerate, MovementReason, ProductClass, ProductCompany, ProductCompanyCreateFields, Unit, Warehouse } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Ref = { id: string; name: string };
type GlRef = { id: string; code: string; name: string };
type Version = { rowVersion: number };
const activate = <T,>(path: string, on: boolean, rowVersion: number) => apiRequest<T>(`${path}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
const remove = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });

/** Browser clients for Inventory › Products, Stock and Warehouses masters (Phase 6). */
export const listUnits = () => apiRequest<Unit[]>("/inventory/units");
export const createUnit = (body: Record<string, unknown>) => apiRequest<Unit>("/inventory/units", { method: "POST", body });
export const updateUnit = (id: string, body: Record<string, unknown> & Version) => apiRequest<Unit>(`/inventory/units/${id}`, { method: "PATCH", body });
export const setUnitActive = (id: string, on: boolean, rowVersion: number) => activate<Unit>(`/inventory/units/${id}`, on, rowVersion);
export const deleteUnit = (id: string, rowVersion: number) => remove(`/inventory/units/${id}`, rowVersion);

export const listCompanies = () => apiRequest<ProductCompany[]>("/inventory/companies");
export const nextCompanyCode = () => apiRequest<{ code: string }>("/inventory/companies/next-code");
export const createCompany = (body: ProductCompanyCreateFields) => apiRequest<ProductCompany>("/inventory/companies", { method: "POST", body });
export const updateCompany = (id: string, body: Partial<ProductCompanyCreateFields> & Version) => apiRequest<ProductCompany>(`/inventory/companies/${id}`, { method: "PATCH", body });
export const setCompanyActive = (id: string, on: boolean, rowVersion: number) => activate<ProductCompany>(`/inventory/companies/${id}`, on, rowVersion);
export const deleteCompany = (id: string, rowVersion: number) => remove(`/inventory/companies/${id}`, rowVersion);

export const listClasses = () => apiRequest<ProductClass[]>("/inventory/classes");
export const createClass = (body: { name: string; icon: string; isVisible: boolean }) => apiRequest<ProductClass>("/inventory/classes", { method: "POST", body });
export const updateClass = (id: string, body: Partial<{ name: string; icon: string; isVisible: boolean }> & Version) => apiRequest<ProductClass>(`/inventory/classes/${id}`, { method: "PATCH", body });
export const deleteClass = (id: string, rowVersion: number) => remove(`/inventory/classes/${id}`, rowVersion);
export const addSubclass = (classId: string, body: { name: string; isVisible: boolean }) => apiRequest<ProductClass>(`/inventory/classes/${classId}/subclasses`, { method: "POST", body });
export const updateSubclass = (id: string, body: Partial<{ name: string; isVisible: boolean }> & Version) => apiRequest<ProductClass>(`/inventory/subclasses/${id}`, { method: "PATCH", body });
export const deleteSubclass = (id: string, rowVersion: number) => remove(`/inventory/subclasses/${id}`, rowVersion);
export const reorderSubclasses = (classId: string, ids: string[]) => apiRequest<ProductClass>(`/inventory/classes/${classId}/subclass-order`, { method: "PUT", body: { ids } });

export const listWarehouses = () => apiRequest<Warehouse[]>("/inventory/warehouses");
export const warehouseFormOptions = () => apiRequest<{ managers: Ref[]; accounts: GlRef[] }>("/inventory/warehouses/form-options");
export const createWarehouse = (body: Record<string, unknown>) => apiRequest<Warehouse>("/inventory/warehouses", { method: "POST", body });
export const updateWarehouse = (id: string, body: Record<string, unknown> & Version) => apiRequest<Warehouse>(`/inventory/warehouses/${id}`, { method: "PATCH", body });
export const setWarehouseActive = (id: string, on: boolean, rowVersion: number) => activate<Warehouse>(`/inventory/warehouses/${id}`, on, rowVersion);
export const deleteWarehouse = (id: string, rowVersion: number) => remove(`/inventory/warehouses/${id}`, rowVersion);
export const addBin = (warehouseId: string, body: Record<string, unknown>) => apiRequest<Warehouse>(`/inventory/warehouses/${warehouseId}/bins`, { method: "POST", body });
export const generateBins = (warehouseId: string, body: Partial<BinGenerate>) => apiRequest<Warehouse>(`/inventory/warehouses/${warehouseId}/bins/generate`, { method: "POST", body });
export const updateBin = (id: string, body: Record<string, unknown> & Version) => apiRequest<Warehouse>(`/inventory/bins/${id}`, { method: "PATCH", body });
export const deleteBin = (id: string, rowVersion: number) => remove(`/inventory/bins/${id}`, rowVersion);

export const listReasons = () => apiRequest<MovementReason[]>("/inventory/movement-reasons");
export const reasonExpenseAccounts = () => apiRequest<GlRef[]>("/inventory/movement-reasons/expense-accounts");
export const createReason = (body: Record<string, unknown>) => apiRequest<MovementReason>("/inventory/movement-reasons", { method: "POST", body });
export const updateReason = (id: string, body: Record<string, unknown> & Version) => apiRequest<MovementReason>(`/inventory/movement-reasons/${id}`, { method: "PATCH", body });
export const setReasonActive = (id: string, on: boolean, rowVersion: number) => activate<MovementReason>(`/inventory/movement-reasons/${id}`, on, rowVersion);
export const deleteReason = (id: string, rowVersion: number) => remove(`/inventory/movement-reasons/${id}`, rowVersion);
