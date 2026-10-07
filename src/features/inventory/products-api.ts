import type { Batch, Kit, LabelJob, LabelTemplate, ListResult, PriceLog, Product, ProductDetail, ReorderRule, ReorderSuggestion } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
const qs = (q: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "" && v !== false) p.set(k, String(v));
  return p.toString();
};
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });

/** Browser clients for Phase 8: products, batches, kits, labels, reorder rules. */
export type ProductQuery = {
  page: number; pageSize: number; search?: string; status?: string; company?: string; class?: string; subclass?: string; shelf?: string; attr?: string;
  minStock?: number; maxStock?: number; low?: boolean; sort?: string;
};
export type ProductSummary = { total: number; byStatus: Record<string, number>; companies: number; classes: number; shelves: string[]; short: number; expiry: number; precious: number; controlled: number };

export type ProductOptions = {
  companies: { id: string; code: string; name: string; brandColour: string }[];
  vendors: { id: string; code: string; name: string }[];
  classes: { id: string; code: string; name: string; icon: string; subclasses: { id: string; name: string }[] }[];
  units: { id: string; code: string; name: string; kind: string; decimals: number }[];
  taxCodes: { id: string; code: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
};
export const productOptions = () => apiRequest<ProductOptions>("/inventory/products/form-options");
export const listProducts = (q: ProductQuery) => apiRequest<ListResult<Product>>(`/inventory/products?${qs(q)}`);
export const productSummary = () => apiRequest<ProductSummary>("/inventory/products/summary");
export const nextSku = (prefix: string) => apiRequest<{ sku: string }>(`/inventory/products/next-sku?${qs({ prefix })}`);
export const getProduct = (id: string) => apiRequest<ProductDetail>(`/inventory/products/${id}`);
export const productPriceLog = (id: string) => apiRequest<PriceLog[]>(`/inventory/products/${id}/price-log`);
export const createProduct = (body: Body) => apiRequest<ProductDetail>("/inventory/products", { method: "POST", body });
export const updateProduct = (id: string, body: Body & Version) => apiRequest<ProductDetail>(`/inventory/products/${id}`, { method: "PATCH", body });
export const setProductPrice = (id: string, body: { field: string; value: number } & Version) => apiRequest<ProductDetail>(`/inventory/products/${id}/price`, { method: "PATCH", body });
export const setProductActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<ProductDetail>(`/inventory/products/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteProduct = (id: string, rowVersion: number) => del(`/inventory/products/${id}`, rowVersion);
export const addProductChild = (id: string, kind: "units" | "barcodes" | "suppliers", body: Body) => apiRequest<ProductDetail>(`/inventory/products/${id}/${kind}`, { method: "POST", body });
export const updateProductChild = (kind: "units" | "barcodes" | "suppliers", id: string, body: Body & Version) =>
  apiRequest<ProductDetail>(`/inventory/product-${kind}/${id}`, { method: "PATCH", body });
export const deleteProductChild = (kind: "units" | "barcodes" | "suppliers", id: string, rowVersion: number) => del(`/inventory/product-${kind}/${id}`, rowVersion);

export type BatchQuery = { page: number; pageSize: number; search?: string; product?: string; window?: string; disposition?: string; sort?: string };
export type BatchSummary = { windows: Record<string, { count: number; value: number }>; total: { count: number; value: number }; byMonth: { month: string; value: number; count: number }[] };
export const listBatches = (q: BatchQuery) => apiRequest<ListResult<Batch>>(`/inventory/batches?${qs(q)}`);
export const batchSummary = () => apiRequest<BatchSummary>("/inventory/batches/summary");
export const createBatch = (body: Body) => apiRequest<Batch>("/inventory/batches", { method: "POST", body });
export const updateBatch = (id: string, body: Body & Version) => apiRequest<Batch>(`/inventory/batches/${id}`, { method: "PATCH", body });
export const setBatchDisposition = (id: string, body: { disposition: string; notes?: string | null } & Version) =>
  apiRequest<Batch>(`/inventory/batches/${id}/disposition`, { method: "POST", body });

export const listKits = () => apiRequest<Kit[]>("/inventory/kits");
export const createKit = (body: Body) => apiRequest<Kit>("/inventory/kits", { method: "POST", body });
export const updateKit = (id: string, body: Body & Version) => apiRequest<Kit>(`/inventory/kits/${id}`, { method: "PATCH", body });
export const setKitActive = (id: string, on: boolean, rowVersion: number) => apiRequest<Kit>(`/inventory/kits/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteKit = (id: string, rowVersion: number) => del(`/inventory/kits/${id}`, rowVersion);

export const listLabelTemplates = () => apiRequest<LabelTemplate[]>("/inventory/label-templates");
export const createLabelTemplate = (body: Body) => apiRequest<LabelTemplate>("/inventory/label-templates", { method: "POST", body });
export const updateLabelTemplate = (id: string, body: Body & Version) => apiRequest<LabelTemplate>(`/inventory/label-templates/${id}`, { method: "PATCH", body });
export const deleteLabelTemplate = (id: string, rowVersion: number) => del(`/inventory/label-templates/${id}`, rowVersion);
export const listLabelJobs = () => apiRequest<LabelJob[]>("/inventory/label-jobs");
export const recordLabelJob = (body: Body) => apiRequest<LabelJob>("/inventory/label-jobs", { method: "POST", body });

export const listReorderRules = (product?: string) => apiRequest<ReorderRule[]>(`/inventory/reorder-rules?${qs({ product })}`);
export const reorderSuggestions = () => apiRequest<ReorderSuggestion[]>("/inventory/reorder-suggestions");
export const createReorderRule = (body: Body) => apiRequest<ReorderRule>("/inventory/reorder-rules", { method: "POST", body });
export const updateReorderRule = (id: string, body: Body & Version) => apiRequest<ReorderRule>(`/inventory/reorder-rules/${id}`, { method: "PATCH", body });
export const deleteReorderRule = (id: string, rowVersion: number) => del(`/inventory/reorder-rules/${id}`, rowVersion);
