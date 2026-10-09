import type {
  CustomerCredit, DeliverableOrder, DeliveryChallan, DeliveryChallanList, PriceMap, Quotation, QuotationList, SalesDocOptions, SalesInvoice, SalesInvoiceList,
  SalesOrder, SalesOrderList,
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
const del = (path: string, rv: number) => apiRequest<void>(`${path}?rowVersion=${rv}`, { method: "DELETE" });

/** Browser clients for Phase 23 sales documents. */
export const salesDocOptions = () => apiRequest<SalesDocOptions>("/sales/doc-options");
export const priceListPrices = (priceListId: string) => apiRequest<PriceMap>(`/sales/doc-options/prices/${priceListId}`);
export const customerCredit = (customerId: string) => apiRequest<CustomerCredit>(`/sales/doc-options/credit/${customerId}`);

// quotations
export const listQuotations = (q: Q) => apiRequest<QuotationList>(`/sales/quotations${qs(q)}`);
export const getQuotation = (id: string) => apiRequest<Quotation>(`/sales/quotations/${id}`);
export const createQuotation = (body: Body) => post<Quotation>("/sales/quotations", body);
export const updateQuotation = (id: string, body: Body) => patch<Quotation>(`/sales/quotations/${id}`, body);
export const deleteQuotation = (id: string, rv: number) => del(`/sales/quotations/${id}`, rv);
export const quotationAction = (id: string, action: "send" | "accept", rv: number) => post<Quotation>(`/sales/quotations/${id}/${action}`, { rowVersion: rv });
export const rejectQuotation = (id: string, rv: number, reason: string) => post<Quotation>(`/sales/quotations/${id}/reject`, { rowVersion: rv, reason });
export const cancelQuotation = (id: string, rv: number, reason: string) => post<Quotation>(`/sales/quotations/${id}/cancel`, { rowVersion: rv, reason });
export const reviseQuotation = (id: string) => post<Quotation>(`/sales/quotations/${id}/revise`);
export const convertQuotation = (id: string, body: Body) => post<{ quotation: Quotation; orderId: string }>(`/sales/quotations/${id}/convert-to-order`, body);

// sales orders
export const listSalesOrders = (q: Q) => apiRequest<SalesOrderList>(`/sales/orders${qs(q)}`);
export const getSalesOrder = (id: string) => apiRequest<SalesOrder>(`/sales/orders/${id}`);
export const deliverableOrders = () => apiRequest<DeliverableOrder[]>("/sales/orders/deliverable");
export const createSalesOrder = (body: Body) => post<SalesOrder>("/sales/orders", body);
export const updateSalesOrder = (id: string, body: Body) => patch<SalesOrder>(`/sales/orders/${id}`, body);
export const deleteSalesOrder = (id: string, rv: number) => del(`/sales/orders/${id}`, rv);
export const salesOrderAction = (id: string, action: "submit" | "recall", rv: number) => post<SalesOrder>(`/sales/orders/${id}/${action}`, { rowVersion: rv });
/** Confirms directly (quo:approve) or approves the current workflow step; overrideCredit needs crovr:approve. */
export const approveSalesOrder = (id: string, body: { comment?: string; overrideCredit?: boolean } = {}) => post<SalesOrder>(`/sales/orders/${id}/approve`, body);
export const rejectSalesOrder = (id: string, reason: string) => post<SalesOrder>(`/sales/orders/${id}/reject`, { reason });
export const closeSalesOrder = (id: string, rv: number, reason?: string) => post<SalesOrder>(`/sales/orders/${id}/close`, { rowVersion: rv, reason });
export const cancelSalesOrder = (id: string, rv: number, reason: string) => post<SalesOrder>(`/sales/orders/${id}/cancel`, { rowVersion: rv, reason });

// delivery challans
export const listChallans = (q: Q) => apiRequest<DeliveryChallanList>(`/sales/challans${qs(q)}`);
export const getChallan = (id: string) => apiRequest<DeliveryChallan>(`/sales/challans/${id}`);
export const createChallan = (body: Body) => post<DeliveryChallan>("/sales/challans", body);
export const updateChallan = (id: string, body: Body) => patch<DeliveryChallan>(`/sales/challans/${id}`, body);
export const deleteChallan = (id: string, rv: number) => del(`/sales/challans/${id}`, rv);
export const dispatchChallan = (id: string, rv: number) => post<DeliveryChallan>(`/sales/challans/${id}/dispatch`, { rowVersion: rv });
export const deliverChallan = (id: string, rv: number, receivedBy?: string) => post<DeliveryChallan>(`/sales/challans/${id}/deliver`, { rowVersion: rv, receivedBy });
export const cancelChallan = (id: string, rv: number, reason: string) => post<DeliveryChallan>(`/sales/challans/${id}/cancel`, { rowVersion: rv, reason });

// sales invoices and the counter sales voucher
export const listInvoices = (q: Q) => apiRequest<SalesInvoiceList>(`/sales/invoices${qs(q)}`);
export const getInvoice = (id: string) => apiRequest<SalesInvoice>(`/sales/invoices/${id}`);
export const createInvoice = (body: Body) => post<SalesInvoice>("/sales/invoices", body);
export const invoiceFromChallan = (challanId: string) => post<SalesInvoice>(`/sales/invoices/from-challan/${challanId}`);
export const updateInvoice = (id: string, body: Body) => patch<SalesInvoice>(`/sales/invoices/${id}`, body);
export const deleteInvoice = (id: string, rv: number) => del(`/sales/invoices/${id}`, rv);
export const invoiceAction = (id: string, action: "submit" | "recall" | "post", rv: number) => post<SalesInvoice>(`/sales/invoices/${id}/${action}`, { rowVersion: rv });
export const approveInvoice = (id: string, comment?: string) => post<SalesInvoice>(`/sales/invoices/${id}/approve`, { comment });
export const rejectInvoice = (id: string, reason: string) => post<SalesInvoice>(`/sales/invoices/${id}/reject`, { reason });
export const voidInvoice = (id: string, rv: number, reason: string) => post<SalesInvoice>(`/sales/invoices/${id}/void`, { rowVersion: rv, reason });
export const createSalesVoucher = (body: Body & { post: boolean }) => post<SalesInvoice>("/sales/vouchers", body);
