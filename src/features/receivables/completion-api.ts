import type {
  ArAgeing, CreditNote, CreditNoteList, CustomerOpenItems, CustomerReceipt, CustomerReceiptList, CustomerStatement, PosSaleResult, PosSession, PosShift, PosShiftList,
  PosShiftReport, ReceivablesOptions, RecurringInvoice, RecurringInvoiceList, ReturnableInvoice, SalesReturn, SalesReturnList,
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

/** Browser clients for Phase 24 (sales returns, credit notes, customer receipts, recurring invoices, POS, AR reports). */
export const receivablesOptions = () => apiRequest<ReceivablesOptions>("/sales/receivables-options");

export const listReturns = (q: Q) => apiRequest<SalesReturnList>(`/sales/returns${qs(q)}`);
export const getReturn = (id: string) => apiRequest<SalesReturn>(`/sales/returns/${id}`);
export const returnableInvoice = (invoiceId: string) => apiRequest<ReturnableInvoice>(`/sales/returns/invoice/${invoiceId}`);
export const createReturn = (body: Body) => post<SalesReturn>("/sales/returns", body);
export const updateReturn = (id: string, body: Body) => patch<SalesReturn>(`/sales/returns/${id}`, body);
export const deleteReturn = (id: string, rv: number) => del(`/sales/returns/${id}`, rv);
export const postReturn = (id: string, rv: number) => post<SalesReturn>(`/sales/returns/${id}/post`, { rowVersion: rv });
export const cancelReturn = (id: string, rv: number, reason: string) => post<SalesReturn>(`/sales/returns/${id}/cancel`, { rowVersion: rv, reason });

export const listCreditNotes = (q: Q) => apiRequest<CreditNoteList>(`/sales/credit-notes${qs(q)}`);
export const getCreditNote = (id: string) => apiRequest<CreditNote>(`/sales/credit-notes/${id}`);
export const createCreditNote = (body: Body) => post<CreditNote>("/sales/credit-notes", body);
export const updateCreditNote = (id: string, body: Body) => patch<CreditNote>(`/sales/credit-notes/${id}`, body);
export const deleteCreditNote = (id: string, rv: number) => del(`/sales/credit-notes/${id}`, rv);
export const postCreditNote = (id: string, rv: number) => post<CreditNote>(`/sales/credit-notes/${id}/post`, { rowVersion: rv });
export const cancelCreditNote = (id: string, rv: number, reason: string) => post<CreditNote>(`/sales/credit-notes/${id}/cancel`, { rowVersion: rv, reason });

export const listReceipts = (q: Q) => apiRequest<CustomerReceiptList>(`/receivables/receipts${qs(q)}`);
export const getReceipt = (id: string) => apiRequest<CustomerReceipt>(`/receivables/receipts/${id}`);
export const openItems = (customerId: string) => apiRequest<CustomerOpenItems>(`/receivables/open-items?customer=${customerId}`);
export const createReceipt = (body: Body) => post<CustomerReceipt>("/receivables/receipts", body);
export const allocateReceipt = (id: string, rv: number, allocations: { invoiceId: string; amount: number }[]) =>
  apiRequest<CustomerReceipt>(`/receivables/receipts/${id}/allocations`, { method: "PUT", body: { rowVersion: rv, allocations } });
export const voidReceipt = (id: string, rv: number, reason: string) => post<CustomerReceipt>(`/receivables/receipts/${id}/void`, { rowVersion: rv, reason });
export const arAgeing = (q: { asOf?: string; basis?: "DUE" | "DOC" }) => apiRequest<ArAgeing>(`/receivables/ageing${qs(q)}`);
export const customerStatement = (q: { customer: string; from?: string; to?: string }) => apiRequest<CustomerStatement>(`/receivables/statement${qs(q)}`);

export const listRecurring = (q: Q) => apiRequest<RecurringInvoiceList>(`/sales/recurring-invoices${qs(q)}`);
export const getRecurring = (id: string) => apiRequest<RecurringInvoice>(`/sales/recurring-invoices/${id}`);
export const createRecurring = (body: Body) => post<RecurringInvoice>("/sales/recurring-invoices", body);
export const updateRecurring = (id: string, body: Body) => patch<RecurringInvoice>(`/sales/recurring-invoices/${id}`, body);
export const deleteRecurring = (id: string, rv: number) => del(`/sales/recurring-invoices/${id}`, rv);
export const recurringAction = (id: string, action: "run-now" | "pause" | "resume", rv: number) => post<RecurringInvoice>(`/sales/recurring-invoices/${id}/${action}`, { rowVersion: rv });

export const posSession = () => apiRequest<PosSession>("/sales/pos/session");
export const listShifts = (q: Q) => apiRequest<PosShiftList>(`/sales/pos/shifts${qs(q)}`);
export const shiftReport = (id: string) => apiRequest<PosShiftReport>(`/sales/pos/shifts/${id}`);
export const openShift = (body: Body) => post<PosShift>("/sales/pos/shifts/open", body);
export const closeShift = (id: string, body: Body) => post<PosShiftReport>(`/sales/pos/shifts/${id}/close`, body);
export const posSale = (body: Body) => post<PosSaleResult | { held: true; invoice: { id: string; docNo: string; netAmount: number; status: string } }>("/sales/pos/sales", body);
export const discardHeld = (id: string) => apiRequest<void>(`/sales/pos/sales/${id}`, { method: "DELETE" });
