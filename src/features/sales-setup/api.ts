import type { ListResult, PriceList, PriceListRow, PriceResolution, PriceTier, QuantityBreak, Scheme, SchemeSummary } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
const qs = (q: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  return p.toString();
};
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });

/** Browser clients for Phase 9 sales setup: price lists, quantity breaks, schemes, price tiers. */
export const listPriceLists = (q: { page: number; pageSize: number; search?: string; status?: string }) => apiRequest<ListResult<PriceList>>(`/sales/price-lists?${qs(q)}`);
export const getPriceList = (id: string) => apiRequest<PriceList>(`/sales/price-lists/${id}`);
export const priceListRows = (id: string, q: { page: number; pageSize: number; search?: string; class?: string; date?: string }) =>
  apiRequest<ListResult<PriceListRow>>(`/sales/price-lists/${id}/items?${qs(q)}`);
export const createPriceList = (body: Body) => apiRequest<PriceList>("/sales/price-lists", { method: "POST", body });
export const updatePriceList = (id: string, body: Body & Version) => apiRequest<PriceList>(`/sales/price-lists/${id}`, { method: "PATCH", body });
export const bulkPrices = (id: string, body: { effectiveFrom?: string; items?: { itemId: string; price: number }[]; markupPct?: number }) =>
  apiRequest<{ saved: number; effectiveFrom: string }>(`/sales/price-lists/${id}/items/bulk`, { method: "POST", body });
export const copyPriceList = (id: string, body: { code: string; name: string }) => apiRequest<PriceList>(`/sales/price-lists/${id}/copy`, { method: "POST", body });
export const setPriceListActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<PriceList>(`/sales/price-lists/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deletePriceList = (id: string, rowVersion: number) => del(`/sales/price-lists/${id}`, rowVersion);
export const resolvePrice = (q: { customer?: string; product: string; qty?: number; date?: string }) => apiRequest<PriceResolution>(`/sales/price-lists/resolve?${qs(q)}`);

export const getBreaks = (q: { priceList?: string | null; product: string }) => apiRequest<QuantityBreak[]>(`/sales/quantity-breaks?${qs(q)}`);
export const breakItems = (priceList?: string | null) => apiRequest<{ id: string; sku: string; name: string; slabs: number }[]>(`/sales/quantity-breaks/items?${qs({ priceList })}`);
export const saveBreaks = (body: { priceListId: string | null; itemId: string; slabs: { minQty: number; maxQty: number | null; unitPrice: number }[] }) =>
  apiRequest<QuantityBreak[]>("/sales/quantity-breaks", { method: "PUT", body });

export const listSchemes = (q: { page: number; pageSize: number; search?: string; state?: string; type?: string }) => apiRequest<ListResult<Scheme>>(`/sales/schemes?${qs(q)}`);
export const schemeSummary = () => apiRequest<SchemeSummary>("/sales/schemes/summary");
export const createScheme = (body: Body) => apiRequest<Scheme>("/sales/schemes", { method: "POST", body });
export const updateScheme = (id: string, body: Body & Version) => apiRequest<Scheme>(`/sales/schemes/${id}`, { method: "PATCH", body });
export const setSchemeActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<Scheme>(`/sales/schemes/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteScheme = (id: string, rowVersion: number) => del(`/sales/schemes/${id}`, rowVersion);

export const listPriceTiers = () => apiRequest<PriceTier[]>("/distribution/price-tiers");
export const updatePriceTier = (id: string, body: Body & Version) => apiRequest<PriceTier>(`/distribution/price-tiers/${id}`, { method: "PATCH", body });
