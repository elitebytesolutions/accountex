import type { CustomerDetail, Customer, CustomerGroup, ListResult, VendorCategory, Vendor, VendorDetail } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Version = { rowVersion: number };
type Body = Record<string, unknown>;
const qs = (q: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
};
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });

/** Browser clients for Receivables › Customers and Payables › Vendors (Phase 7). */
export type CustomerQuery = { page: number; pageSize: number; search?: string; status?: string; group?: string; city?: string; sort?: string };
export type CustomerSummary = { total: number; byStatus: Record<string, number>; cities: string[]; newThisQuarter: number; onHold: string[] };
export type CustomerOptions = { groups: { id: string; code: string; name: string }[]; branches: { id: string; name: string }[]; salesReps: { id: string; name: string }[]; accounts: { id: string; code: string; name: string }[]; priceLists: { id: string; code: string; name: string; isDefault: boolean }[] };

export const listCustomerGroups = () => apiRequest<CustomerGroup[]>("/sales/customer-groups");
export const createCustomerGroup = (body: Body) => apiRequest<CustomerGroup>("/sales/customer-groups", { method: "POST", body });
export const updateCustomerGroup = (id: string, body: Body & Version) => apiRequest<CustomerGroup>(`/sales/customer-groups/${id}`, { method: "PATCH", body });
export const setCustomerGroupActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<CustomerGroup>(`/sales/customer-groups/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteCustomerGroup = (id: string, rowVersion: number) => del(`/sales/customer-groups/${id}`, rowVersion);

export const listCustomers = (q: CustomerQuery) => apiRequest<ListResult<Customer>>(`/sales/customers?${qs(q)}`);
export const customerSummary = () => apiRequest<CustomerSummary>("/sales/customers/summary");
export const customerOptions = () => apiRequest<CustomerOptions>("/sales/customers/form-options");
export const getCustomer = (id: string) => apiRequest<CustomerDetail>(`/sales/customers/${id}`);
export const createCustomer = (body: Body) => apiRequest<CustomerDetail>("/sales/customers", { method: "POST", body });
export const updateCustomer = (id: string, body: Body & Version) => apiRequest<CustomerDetail>(`/sales/customers/${id}`, { method: "PATCH", body });
export const setCustomerStatus = (id: string, body: { status: string; holdReason?: string | null } & Version) =>
  apiRequest<CustomerDetail>(`/sales/customers/${id}/status`, { method: "POST", body });
export const deleteCustomer = (id: string, rowVersion: number) => del(`/sales/customers/${id}`, rowVersion);
export const addCustomerContact = (id: string, body: Body) => apiRequest<CustomerDetail>(`/sales/customers/${id}/contacts`, { method: "POST", body });
export const updateCustomerContact = (id: string, body: Body & Version) => apiRequest<CustomerDetail>(`/sales/customer-contacts/${id}`, { method: "PATCH", body });
export const deleteCustomerContact = (id: string, rowVersion: number) => del(`/sales/customer-contacts/${id}`, rowVersion);
export const addCustomerAddress = (id: string, body: Body) => apiRequest<CustomerDetail>(`/sales/customers/${id}/addresses`, { method: "POST", body });
export const updateCustomerAddress = (id: string, body: Body & Version) => apiRequest<CustomerDetail>(`/sales/customer-addresses/${id}`, { method: "PATCH", body });
export const deleteCustomerAddress = (id: string, rowVersion: number) => del(`/sales/customer-addresses/${id}`, rowVersion);
export const addCustomerNote = (id: string, note: string) => apiRequest<CustomerDetail>(`/sales/customers/${id}/notes`, { method: "POST", body: { note } });
export const deleteCustomerNote = (id: string, rowVersion: number) => del(`/sales/customer-notes/${id}`, rowVersion);

export type VendorQuery = { page: number; pageSize: number; search?: string; status?: string; category?: string; atl?: string; sort?: string };
export type VendorSummary = { total: number; active: number; categories: number; byAtl: Record<string, number> };
export type VendorOptions = {
  categories: { id: string; name: string }[];
  currencies: { code: string; name: string }[];
  defaultAccounts: { id: string; code: string; name: string; accountClass: number }[];
  payableAccounts: { id: string; code: string; name: string }[];
};

export const listVendorCategories = () => apiRequest<VendorCategory[]>("/purchases/vendor-categories");
export const createVendorCategory = (body: Body) => apiRequest<VendorCategory>("/purchases/vendor-categories", { method: "POST", body });
export const updateVendorCategory = (id: string, body: Body & Version) => apiRequest<VendorCategory>(`/purchases/vendor-categories/${id}`, { method: "PATCH", body });
export const setVendorCategoryActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<VendorCategory>(`/purchases/vendor-categories/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteVendorCategory = (id: string, rowVersion: number) => del(`/purchases/vendor-categories/${id}`, rowVersion);

export const listVendors = (q: VendorQuery) => apiRequest<ListResult<Vendor>>(`/purchases/vendors?${qs(q)}`);
export const vendorSummary = () => apiRequest<VendorSummary>("/purchases/vendors/summary");
export const vendorOptions = () => apiRequest<VendorOptions>("/purchases/vendors/form-options");
export const getVendor = (id: string) => apiRequest<VendorDetail>(`/purchases/vendors/${id}`);
export const createVendor = (body: Body) => apiRequest<VendorDetail>("/purchases/vendors", { method: "POST", body });
export const updateVendor = (id: string, body: Body & Version) => apiRequest<VendorDetail>(`/purchases/vendors/${id}`, { method: "PATCH", body });
export const setVendorActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<VendorDetail>(`/purchases/vendors/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteVendor = (id: string, rowVersion: number) => del(`/purchases/vendors/${id}`, rowVersion);
export const addVendorContact = (id: string, body: Body) => apiRequest<VendorDetail>(`/purchases/vendors/${id}/contacts`, { method: "POST", body });
export const updateVendorContact = (id: string, body: Body & Version) => apiRequest<VendorDetail>(`/purchases/vendor-contacts/${id}`, { method: "PATCH", body });
export const deleteVendorContact = (id: string, rowVersion: number) => del(`/purchases/vendor-contacts/${id}`, rowVersion);
export const addVendorBank = (id: string, body: Body) => apiRequest<VendorDetail>(`/purchases/vendors/${id}/bank-accounts`, { method: "POST", body });
export const updateVendorBank = (id: string, body: Body & Version) => apiRequest<VendorDetail>(`/purchases/vendor-bank-accounts/${id}`, { method: "PATCH", body });
export const deleteVendorBank = (id: string, rowVersion: number) => del(`/purchases/vendor-bank-accounts/${id}`, rowVersion);
