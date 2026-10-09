import type { AssemblyList, AssemblyVoucher, BulkPriceUpdate, BulkPriceUpdateList, DemandOptions, GoodsDemand, GoodsDemandList, PrincipalClaim, PrincipalClaimList, PrincipalTarget, StockVoucher, StockVoucherList } from "@/shared";
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
const patch = <T,>(path: string, body: Body) => apiRequest<T>(path, { method: "PATCH", body });
const del = (path: string, rv: number) => apiRequest<void>(`${path}?rowVersion=${rv}`, { method: "DELETE" });

/** Browser clients for Phase 22 (stock vouchers, assembly, demand, principal claims / targets, price updates). */
export const demandOptions = () => apiRequest<DemandOptions>("/inventory/demand-options");

export const listStockVouchers = (q: Q) => apiRequest<StockVoucherList>(`/inventory/stock-vouchers${qs(q)}`);
export const getStockVoucher = (id: string) => apiRequest<StockVoucher>(`/inventory/stock-vouchers/${id}`);
export const createStockVoucher = (body: Body) => post<StockVoucher>("/inventory/stock-vouchers", body);
export const updateStockVoucher = (id: string, body: Body) => patch<StockVoucher>(`/inventory/stock-vouchers/${id}`, body);
export const deleteStockVoucher = (id: string, rv: number) => del(`/inventory/stock-vouchers/${id}`, rv);
export const postStockVoucher = (id: string, rv: number) => post<StockVoucher>(`/inventory/stock-vouchers/${id}/post`, { rowVersion: rv });
export const cancelStockVoucher = (id: string, rv: number, reason: string) => post<StockVoucher>(`/inventory/stock-vouchers/${id}/cancel`, { rowVersion: rv, reason });

export const listAssemblies = (q: Q) => apiRequest<AssemblyList>(`/inventory/assembly-vouchers${qs(q)}`);
export const getAssembly = (id: string) => apiRequest<AssemblyVoucher>(`/inventory/assembly-vouchers/${id}`);
export const createAssembly = (body: Body) => post<AssemblyVoucher>("/inventory/assembly-vouchers", body);
export const updateAssembly = (id: string, body: Body) => patch<AssemblyVoucher>(`/inventory/assembly-vouchers/${id}`, body);
export const deleteAssembly = (id: string, rv: number) => del(`/inventory/assembly-vouchers/${id}`, rv);
export const postAssembly = (id: string, rv: number) => post<AssemblyVoucher>(`/inventory/assembly-vouchers/${id}/post`, { rowVersion: rv });
export const cancelAssembly = (id: string, rv: number, reason: string) => post<AssemblyVoucher>(`/inventory/assembly-vouchers/${id}/cancel`, { rowVersion: rv, reason });

export const listDemands = (q: Q) => apiRequest<GoodsDemandList>(`/inventory/demands${qs(q)}`);
export const getDemand = (id: string) => apiRequest<GoodsDemand>(`/inventory/demands/${id}`);
export const generateDemand = (body: { vendorId: string; manufacturerId: string; notes?: string | null }) => post<GoodsDemand>("/inventory/demands/generate", body);
export const createDemand = (body: Body) => post<GoodsDemand>("/inventory/demands", body);
export const updateDemand = (id: string, body: Body) => patch<GoodsDemand>(`/inventory/demands/${id}`, body);
export const deleteDemand = (id: string, rv: number) => del(`/inventory/demands/${id}`, rv);
export const convertDemandToPo = (id: string, body: { rowVersion: number; branchId: string; warehouseId?: string | null; expectedDate?: string | null }) => post<GoodsDemand>(`/inventory/demands/${id}/convert-to-po`, body);
export const cancelDemand = (id: string, rv: number, reason: string) => post<GoodsDemand>(`/inventory/demands/${id}/cancel`, { rowVersion: rv, reason });

export const listPrincipalClaims = (q: Q) => apiRequest<PrincipalClaimList>(`/inventory/principal-claims${qs(q)}`);
export const getPrincipalClaim = (id: string) => apiRequest<PrincipalClaim>(`/inventory/principal-claims/${id}`);
export const createPrincipalClaim = (body: Body) => post<PrincipalClaim>("/inventory/principal-claims", body);
export const updatePrincipalClaim = (id: string, body: Body) => patch<PrincipalClaim>(`/inventory/principal-claims/${id}`, body);
export const deletePrincipalClaim = (id: string, rv: number) => del(`/inventory/principal-claims/${id}`, rv);
export const submitPrincipalClaim = (id: string, rv: number) => post<PrincipalClaim>(`/inventory/principal-claims/${id}/submit`, { rowVersion: rv });
export const settlePrincipalClaim = (id: string, body: { rowVersion: number; settledDate: string; settledAmount: number; debitNoteId?: string | null; rejected?: boolean; remarks?: string | null }) => post<PrincipalClaim>(`/inventory/principal-claims/${id}/settle`, body);
export const cancelPrincipalClaim = (id: string, rv: number, reason: string) => post<PrincipalClaim>(`/inventory/principal-claims/${id}/cancel`, { rowVersion: rv, reason });
export const listPrincipalTargets = () => apiRequest<PrincipalTarget[]>("/inventory/principal-targets");
export const createPrincipalTarget = (body: Body) => post<PrincipalTarget>("/inventory/principal-targets", body);
export const updatePrincipalTarget = (id: string, body: Body) => patch<PrincipalTarget>(`/inventory/principal-targets/${id}`, body);
export const deletePrincipalTarget = (id: string, rv: number) => del(`/inventory/principal-targets/${id}`, rv);

export const listPriceUpdates = (q: Q) => apiRequest<BulkPriceUpdateList>(`/inventory/price-updates${qs(q)}`);
export const getPriceUpdate = (id: string) => apiRequest<BulkPriceUpdate>(`/inventory/price-updates/${id}`);
export const createPriceUpdate = (body: Body) => post<BulkPriceUpdate>("/inventory/price-updates", body);
export const deletePriceUpdate = (id: string, rv: number) => del(`/inventory/price-updates/${id}`, rv);
export const applyPriceUpdate = (id: string, rv: number) => post<BulkPriceUpdate>(`/inventory/price-updates/${id}/apply`, { rowVersion: rv });
export const undoPriceUpdate = (id: string, rv: number) => post<BulkPriceUpdate>(`/inventory/price-updates/${id}/undo`, { rowVersion: rv });
