import type {
  ApAgeing, ReturnBill, DebitNote, DebitNoteList, OpenItems, PaymentRunResult, PurchaseReturn, PurchaseReturnList, ReturnableLine, VendorPayment, VendorPaymentList, VendorStatement,
  ItemInsight, Grn, GrnList, ImportGrn, LandedCost, LandedCostList, PurchaseOptions, PurchaseOrder, PurchaseOrderList, VendorBill, VendorBillList } from "@/shared";
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

/** Browser clients for Phase 19 purchasing. */
export const purchaseOptions = () => apiRequest<PurchaseOptions>("/purchases/options");
export const itemInsight = (itemId: string) => apiRequest<ItemInsight>(`/purchases/item-insight/${itemId}`);

// purchase orders
export const listOrders = (q: Q) => apiRequest<PurchaseOrderList>(`/purchases/orders${qs(q)}`);
export const getOrder = (id: string) => apiRequest<PurchaseOrder>(`/purchases/orders/${id}`);
export const createOrder = (body: Body) => post<PurchaseOrder>("/purchases/orders", body);
export const updateOrder = (id: string, body: Body) => patch<PurchaseOrder>(`/purchases/orders/${id}`, body);
export const deleteOrder = (id: string, rv: number) => del(`/purchases/orders/${id}`, rv);
export const orderAction = (id: string, action: "submit" | "recall", rv: number) => post<PurchaseOrder>(`/purchases/orders/${id}/${action}`, { rowVersion: rv });
export const approveOrder = (id: string, comment?: string) => post<PurchaseOrder>(`/purchases/orders/${id}/approve`, { comment });
export const rejectOrder = (id: string, reason: string) => post<PurchaseOrder>(`/purchases/orders/${id}/reject`, { reason });
export const cancelOrder = (id: string, rv: number, reason: string) => post<PurchaseOrder>(`/purchases/orders/${id}/cancel`, { rowVersion: rv, reason });

// goods received notes
export const listGrns = (q: Q) => apiRequest<GrnList>(`/purchases/grns${qs(q)}`);
export const getGrn = (id: string) => apiRequest<Grn>(`/purchases/grns/${id}`);
export const createGrn = (body: Body) => post<Grn>("/purchases/grns", body);
export const updateGrn = (id: string, body: Body) => patch<Grn>(`/purchases/grns/${id}`, body);
export const deleteGrn = (id: string, rv: number) => del(`/purchases/grns/${id}`, rv);
export const postGrn = (id: string, rv: number) => post<Grn>(`/purchases/grns/${id}/post`, { rowVersion: rv });
export const cancelGrn = (id: string, rv: number, reason: string) => post<Grn>(`/purchases/grns/${id}/cancel`, { rowVersion: rv, reason });

// vendor bills
export const listBills = (q: Q) => apiRequest<VendorBillList>(`/purchases/bills${qs(q)}`);
export const getBill = (id: string) => apiRequest<VendorBill>(`/purchases/bills/${id}`);
export const createBill = (body: Body) => post<VendorBill>("/purchases/bills", body);
export const billFromGrn = (grnId: string, body: { vendorInvoiceNo: string; docDate: string }) => post<VendorBill>(`/purchases/bills/from-grn/${grnId}`, body);
export const updateBill = (id: string, body: Body) => patch<VendorBill>(`/purchases/bills/${id}`, body);
export const deleteBill = (id: string, rv: number) => del(`/purchases/bills/${id}`, rv);
export const billAction = (id: string, action: "submit" | "recall" | "post", rv: number) => post<VendorBill>(`/purchases/bills/${id}/${action}`, { rowVersion: rv });
export const approveBill = (id: string, comment?: string) => post<VendorBill>(`/purchases/bills/${id}/approve`, { comment });
export const rejectBill = (id: string, reason: string) => post<VendorBill>(`/purchases/bills/${id}/reject`, { reason });
export const voidBill = (id: string, rv: number, reason: string) => post<VendorBill>(`/purchases/bills/${id}/void`, { rowVersion: rv, reason });

// purchase voucher (counter)
export const createPurchaseVoucher = (body: Body) => post<VendorBill>("/purchases/vouchers", body);

// landed cost
export const listLandedCosts = (q: Q) => apiRequest<LandedCostList>(`/purchases/landed-cost${qs(q)}`);
export const importGrns = () => apiRequest<ImportGrn[]>("/purchases/landed-cost/import-grns");
export const getLandedCost = (id: string) => apiRequest<LandedCost>(`/purchases/landed-cost/${id}`);
export const createLandedCost = (body: Body) => post<LandedCost>("/purchases/landed-cost", body);
export const updateLandedCost = (id: string, body: Body) => patch<LandedCost>(`/purchases/landed-cost/${id}`, body);
export const deleteLandedCost = (id: string, rv: number) => del(`/purchases/landed-cost/${id}`, rv);
export const allocateLandedCost = (id: string, rv: number, basis: "VALUE" | "QTY" | "WEIGHT") => post<LandedCost>(`/purchases/landed-cost/${id}/allocate`, { rowVersion: rv, basis });
export const postLandedCost = (id: string, rv: number) => post<LandedCost>(`/purchases/landed-cost/${id}/post`, { rowVersion: rv });
export const cancelLandedCost = (id: string, rv: number, reason: string) => post<LandedCost>(`/purchases/landed-cost/${id}/cancel`, { rowVersion: rv, reason });

// ---------------------------------------------------------------- Phase 20: payables
// purchase returns
export const listReturns = (q: Q) => apiRequest<PurchaseReturnList>(`/purchases/returns${qs(q)}`);
export const getReturn = (id: string) => apiRequest<PurchaseReturn>(`/purchases/returns/${id}`);
export const returnBills = (vendor: string) => apiRequest<ReturnBill[]>(`/purchases/returns/bills${qs({ vendor })}`);
export const returnableLines = (billId: string, exceptId?: string) => apiRequest<ReturnableLine[]>(`/purchases/returns/returnable${qs({ bill: billId, except: exceptId })}`);
export const createReturn = (body: Body) => post<PurchaseReturn>("/purchases/returns", body);
export const updateReturn = (id: string, body: Body) => patch<PurchaseReturn>(`/purchases/returns/${id}`, body);
export const deleteReturn = (id: string, rv: number) => del(`/purchases/returns/${id}`, rv);
export const postReturn = (id: string, rv: number) => post<PurchaseReturn>(`/purchases/returns/${id}/post`, { rowVersion: rv });
export const cancelReturn = (id: string, rv: number, reason: string) => post<PurchaseReturn>(`/purchases/returns/${id}/cancel`, { rowVersion: rv, reason });

// debit notes
export const listDebitNotes = (q: Q) => apiRequest<DebitNoteList>(`/purchases/debit-notes${qs(q)}`);
export const getDebitNote = (id: string) => apiRequest<DebitNote>(`/purchases/debit-notes/${id}`);
export const createDebitNote = (body: Body) => post<DebitNote>("/purchases/debit-notes", body);
export const updateDebitNote = (id: string, body: Body) => patch<DebitNote>(`/purchases/debit-notes/${id}`, body);
export const deleteDebitNote = (id: string, rv: number) => del(`/purchases/debit-notes/${id}`, rv);
export const postDebitNote = (id: string, rv: number) => post<DebitNote>(`/purchases/debit-notes/${id}/post`, { rowVersion: rv });
export const voidDebitNote = (id: string, rv: number, reason: string) => post<DebitNote>(`/purchases/debit-notes/${id}/void`, { rowVersion: rv, reason });
export const refundDebitNote = (id: string, body: { rowVersion: number; date: string; amount: number; cashAccountId?: string | null; bankAccountId?: string | null }) => post<DebitNote>(`/purchases/debit-notes/${id}/refund`, body);
export const applyDebitNote = (id: string, body: { rowVersion: number; billId: string; amount: number }) => post<DebitNote>(`/purchases/debit-notes/${id}/apply`, body);

// vendor payments, payment run, open items, allocations
export const openItems = (vendor?: string) => apiRequest<OpenItems>(`/payables/open-items${qs({ vendor })}`);
export const listPayments = (q: Q) => apiRequest<VendorPaymentList>(`/payables/payments${qs(q)}`);
export const getPayment = (id: string) => apiRequest<VendorPayment>(`/payables/payments/${id}`);
export const createPayment = (body: Body) => post<VendorPayment>("/payables/payments", body);
export const updatePayment = (id: string, body: Body) => patch<VendorPayment>(`/payables/payments/${id}`, body);
export const deletePayment = (id: string, rv: number) => del(`/payables/payments/${id}`, rv);
export const paymentAction = (id: string, action: "submit" | "recall" | "post", rv: number) => post<VendorPayment>(`/payables/payments/${id}/${action}`, { rowVersion: rv });
export const approvePayment = (id: string, comment?: string) => post<VendorPayment>(`/payables/payments/${id}/approve`, { comment });
export const rejectPayment = (id: string, reason: string) => post<VendorPayment>(`/payables/payments/${id}/reject`, { reason });
export const voidPayment = (id: string, rv: number, reason: string) => post<VendorPayment>(`/payables/payments/${id}/void`, { rowVersion: rv, reason });
export const allocatePayment = (id: string, rv: number, allocations: { billId: string; amount: number }[]) => apiRequest<VendorPayment>(`/payables/payments/${id}/allocations`, { method: "PUT", body: { rowVersion: rv, allocations } });
export const reverseAllocation = (allocationId: string) => post<{ paymentId: string | null; debitNoteId: string | null }>(`/payables/allocations/${allocationId}/reverse`);
export const runPayments = (body: Body) => post<PaymentRunResult>("/payables/payment-run", body);

// reports
export const apAgeing = (q: Q) => apiRequest<ApAgeing>(`/payables/ageing${qs(q)}`);
export const vendorStatement = (q: { vendor: string; from: string; to: string }) => apiRequest<VendorStatement>(`/payables/statement${qs(q)}`);
