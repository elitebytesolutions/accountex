import type { StockAdjustment, StockAdjustmentList, StockCount, StockCountList, StockEntry, StockEntryList, StockOnHand, StockOpsOptions, StockTransfer, StockTransferList } from "@/shared";
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

/** Browser clients for Phase 21 stock operations. */
export const stockOpsOptions = () => apiRequest<StockOpsOptions>("/inventory/ops/options");
export const stockOnHand = (warehouse: string) => apiRequest<StockOnHand>(`/inventory/ops/on-hand${qs({ warehouse })}`);

// stock in / out
export const listStockEntries = (q: Q) => apiRequest<StockEntryList>(`/inventory/stock-in-out${qs(q)}`);
export const getStockEntry = (id: string) => apiRequest<StockEntry>(`/inventory/stock-in-out/${id}`);
export const createStockEntry = (body: Body) => post<StockEntry>("/inventory/stock-in-out", body);
export const updateStockEntry = (id: string, body: Body) => patch<StockEntry>(`/inventory/stock-in-out/${id}`, body);
export const deleteStockEntry = (id: string, rv: number) => del(`/inventory/stock-in-out/${id}`, rv);
export const postStockEntry = (id: string, rv: number) => post<StockEntry>(`/inventory/stock-in-out/${id}/post`, { rowVersion: rv });
export const cancelStockEntry = (id: string, rv: number, reason: string) => post<StockEntry>(`/inventory/stock-in-out/${id}/cancel`, { rowVersion: rv, reason });

// transfers
export const listTransfers = (q: Q) => apiRequest<StockTransferList>(`/inventory/transfers${qs(q)}`);
export const getTransfer = (id: string) => apiRequest<StockTransfer>(`/inventory/transfers/${id}`);
export const createTransfer = (body: Body) => post<StockTransfer>("/inventory/transfers", body);
export const updateTransfer = (id: string, body: Body) => patch<StockTransfer>(`/inventory/transfers/${id}`, body);
export const deleteTransfer = (id: string, rv: number) => del(`/inventory/transfers/${id}`, rv);
export const dispatchTransfer = (id: string, rv: number) => post<StockTransfer>(`/inventory/transfers/${id}/dispatch`, { rowVersion: rv });
export const receiveTransfer = (id: string, body: { rowVersion: number; note?: string | null; lines: { transferLineId: string; receivedQty: number; note?: string | null }[] }) => post<StockTransfer>(`/inventory/transfers/${id}/receive`, body);
export const cancelTransfer = (id: string, rv: number, reason: string) => post<StockTransfer>(`/inventory/transfers/${id}/cancel`, { rowVersion: rv, reason });

// adjustments
export const listAdjustments = (q: Q) => apiRequest<StockAdjustmentList>(`/inventory/adjustments${qs(q)}`);
export const getAdjustment = (id: string) => apiRequest<StockAdjustment>(`/inventory/adjustments/${id}`);
export const createAdjustment = (body: Body) => post<StockAdjustment>("/inventory/adjustments", body);
export const updateAdjustment = (id: string, body: Body) => patch<StockAdjustment>(`/inventory/adjustments/${id}`, body);
export const deleteAdjustment = (id: string, rv: number) => del(`/inventory/adjustments/${id}`, rv);
export const adjustmentAction = (id: string, action: "submit" | "post", rv: number) => post<StockAdjustment>(`/inventory/adjustments/${id}/${action}`, { rowVersion: rv });
export const approveAdjustment = (id: string, comment?: string) => post<StockAdjustment>(`/inventory/adjustments/${id}/approve`, { comment });
export const rejectAdjustment = (id: string, reason: string) => post<StockAdjustment>(`/inventory/adjustments/${id}/reject`, { reason });
export const cancelAdjustment = (id: string, rv: number, reason: string) => post<StockAdjustment>(`/inventory/adjustments/${id}/cancel`, { rowVersion: rv, reason });

// counts
export const listCounts = (q: Q) => apiRequest<StockCountList>(`/inventory/counts${qs(q)}`);
export const getCount = (id: string) => apiRequest<StockCount>(`/inventory/counts/${id}`);
export const createCount = (body: Body) => post<StockCount>("/inventory/counts", body);
export const deleteCount = (id: string, rv: number) => del(`/inventory/counts/${id}`, rv);
export const freezeCount = (id: string, rv: number) => post<StockCount>(`/inventory/counts/${id}/freeze`, { rowVersion: rv });
export const enterCounts = (id: string, rv: number, lines: { id: string; countedQty: number | null; reason?: string | null }[]) => post<StockCount>(`/inventory/counts/${id}/lines`, { rowVersion: rv, lines });
export const approveCount = (id: string, rv: number, comment?: string | null) => post<StockCount>(`/inventory/counts/${id}/approve`, { rowVersion: rv, comment });
export const cancelCount = (id: string, rv: number, reason: string) => post<StockCount>(`/inventory/counts/${id}/cancel`, { rowVersion: rv, reason });
