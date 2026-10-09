import type {
  BackOrderList, BookingConvertResult, BulkRun, BulkRunList, HeldBill, IncomingStock, OrderBooking, OrderBookingList, OrderTemplate, StockMap, WholesaleInvoiceRef,
  WholesaleOptions,
} from "@/shared";
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

/** Browser clients for Phase 25 wholesale. */
export const wholesaleOptions = () => apiRequest<WholesaleOptions>("/distribution/wholesale-options");
export const warehouseStock = (warehouseId: string) => apiRequest<StockMap>(`/distribution/wholesale-options/stock/${warehouseId}`);

// quick wholesale entry, held bills, order templates
export const saveWholesaleBill = (body: Body) => post<WholesaleInvoiceRef>("/distribution/quick-entry", body);
export const listHeldBills = () => apiRequest<HeldBill[]>("/distribution/held-bills");
export const holdBill = (body: Body) => post<HeldBill>("/distribution/held-bills", body);
export const recallHeldBill = (id: string) => post<HeldBill & { customerId: string; routeId: string | null; warehouseId: string | null; salesmanEmployeeId: string | null }>(`/distribution/held-bills/${id}/recall`);
export const discardHeldBill = (id: string) => post<void>(`/distribution/held-bills/${id}/discard`);
export const listTemplates = (customer?: string | null) => apiRequest<OrderTemplate[]>(`/distribution/order-templates${qs({ customer })}`);
export const createTemplate = (body: Body) => post<OrderTemplate>("/distribution/order-templates", body);
export const updateTemplate = (id: string, body: Body) => patch<OrderTemplate>(`/distribution/order-templates/${id}`, body);
export const archiveTemplate = (id: string, rv: number) => apiRequest<void>(`/distribution/order-templates/${id}?rowVersion=${rv}`, { method: "DELETE" });

// order bookings
export const listBookings = (q: Q) => apiRequest<OrderBookingList>(`/distribution/bookings${qs(q)}`);
export const getBooking = (id: string) => apiRequest<OrderBooking>(`/distribution/bookings/${id}`);
export const createBooking = (body: Body) => post<OrderBooking>("/distribution/bookings", body);
export const updateBooking = (id: string, body: Body) => patch<OrderBooking>(`/distribution/bookings/${id}`, body);
export const deleteBooking = (id: string, rv: number) => apiRequest<void>(`/distribution/bookings/${id}?rowVersion=${rv}`, { method: "DELETE" });
export const cancelBooking = (id: string, rv: number, reason?: string) => post<OrderBooking>(`/distribution/bookings/${id}/cancel`, { rowVersion: rv, reason });
export const checkBookingStock = (ids: string[]) => post<OrderBooking[]>("/distribution/bookings/check-stock", { ids });
export const convertBookings = (ids: string[], allowPartial: boolean) => post<BookingConvertResult>("/distribution/bookings/convert", { ids, allowPartial });

// bulk invoice runs
export const listBulkRuns = (q: Q) => apiRequest<BulkRunList>(`/distribution/bulk-invoice-runs${qs(q)}`);
export const getBulkRun = (id: string) => apiRequest<BulkRun>(`/distribution/bulk-invoice-runs/${id}`);
export const createBulkRun = (body: Body) => post<BulkRun>("/distribution/bulk-invoice-runs", body);
export const previewBulkRun = (id: string) => post<BulkRun>(`/distribution/bulk-invoice-runs/${id}/preview`);
export const generateBulkRun = (id: string) => post<BulkRun>(`/distribution/bulk-invoice-runs/${id}/post`);

// back-orders
export const listBackOrders = (q: Q) => apiRequest<BackOrderList>(`/distribution/back-orders${qs(q)}`);
export const incomingStock = () => apiRequest<IncomingStock[]>("/distribution/back-orders/incoming");
export const allocateBackOrders = (body: { grnLineId: string; policy: string; ids?: string[] }) => post<{ allocated: number }>("/distribution/back-orders/allocate", body);
export const convertBackOrders = (ids: string[]) => post<{ invoices: WholesaleInvoiceRef[]; failed: { customer: string; code: string | null; message: string }[] }>("/distribution/back-orders/convert", { ids });
export const cancelBackOrders = (ids: string[], reason: string, note?: string) => post<{ cancelled: number }>("/distribution/back-orders/cancel", { ids, reason, note });
