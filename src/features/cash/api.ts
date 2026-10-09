import type {
  CashBook, CashDayClose, MyClaimOptions, CashEntry, CashLedger, CashOptions, ExpenseClaim, ExpenseClaimList, PettyReplenishment, PettyVoucher, PettyVoucherList,
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

/** Browser clients for Phase 18 cash. */
export const cashOptions = () => apiRequest<CashOptions>("/cash/options");
export const cashBook = (q: { account?: string; from: string; to: string }) => apiRequest<CashBook>(`/cash/book${qs(q)}`);
export const cashLedger = (q: { account: string; from: string; to: string }) => apiRequest<CashLedger>(`/cash/ledger${qs(q)}`);
export const createCashEntry = (body: Body) => post<CashEntry>("/cash/entries", body);
export const reverseCashEntry = (id: string, body: { date: string; reason?: string; remarks?: string | null }) => post<CashEntry>(`/cash/entries/${id}/reverse`, body);

export const cashDay = (account: string, date: string) => apiRequest<CashDayClose>(`/cash/day-closes${qs({ account, date })}`);
export const countCashDay = (body: Body) => apiRequest<CashDayClose>("/cash/day-closes", { method: "PUT", body });
export const lockCashDay = (id: string, rv: number) => post<CashDayClose>(`/cash/day-closes/${id}/lock`, { rowVersion: rv });
export const reopenCashDay = (id: string, rv: number) => post<CashDayClose>(`/cash/day-closes/${id}/reopen`, { rowVersion: rv });

export const listPettyVouchers = (q: Q) => apiRequest<PettyVoucherList>(`/cash/petty/vouchers${qs(q)}`);
export const createPettyVoucher = (body: Body) => post<PettyVoucher>("/cash/petty/vouchers", body);
export const updatePettyVoucher = (id: string, body: Body) => apiRequest<PettyVoucher>(`/cash/petty/vouchers/${id}`, { method: "PATCH", body });
export const voidPettyVoucher = (id: string, rv: number, reason?: string) => post<PettyVoucher>(`/cash/petty/vouchers/${id}/void`, { rowVersion: rv, reason });
export const listReplenishments = (fund?: string) => apiRequest<PettyReplenishment[]>(`/cash/petty/replenishments${qs({ fund })}`);
export const replenishFund = (fundId: string, body: Body) => post<PettyReplenishment>(`/cash/petty/funds/${fundId}/replenish`, body);
export const cancelReplenishment = (id: string, rv: number, reason?: string) => post<PettyReplenishment>(`/cash/petty/replenishments/${id}/cancel`, { rowVersion: rv, reason });

export const listClaims = (q: Q) => apiRequest<ExpenseClaimList>(`/cash/expense-claims${qs(q)}`);
export const getClaim = (id: string) => apiRequest<ExpenseClaim>(`/cash/expense-claims/${id}`);
export const approveClaim = (id: string, comment?: string) => post<ExpenseClaim>(`/cash/expense-claims/${id}/approve`, { comment });
export const rejectClaim = (id: string, body: { reason: string; comment?: string | null; allowResubmit: boolean }) => post<ExpenseClaim>(`/cash/expense-claims/${id}/reject`, body);
export const payClaim = (id: string, body: Body) => post<ExpenseClaim>(`/cash/expense-claims/${id}/pay`, body);
export const payApprovedClaims = (body: Body) => post<{ paid: string[]; failed: { id: string; message: string }[] }>("/cash/expense-claims/pay-approved", body);

export const myClaimOptions = () => apiRequest<MyClaimOptions>("/me/expense-claims/options");
export const myClaims = (q: Q) => apiRequest<ExpenseClaimList>(`/me/expense-claims${qs(q)}`);
export const myClaim = (id: string) => apiRequest<ExpenseClaim>(`/me/expense-claims/${id}`);
export const createMyClaim = (body: Body) => post<ExpenseClaim>("/me/expense-claims", body);
export const updateMyClaim = (id: string, body: Body) => apiRequest<ExpenseClaim>(`/me/expense-claims/${id}`, { method: "PATCH", body });
export const deleteMyClaim = (id: string, rv: number) => apiRequest<void>(`/me/expense-claims/${id}?rowVersion=${rv}`, { method: "DELETE" });
export const myClaimAction = (id: string, action: "submit" | "withdraw" | "resubmit", rv: number) => post<ExpenseClaim>(`/me/expense-claims/${id}/${action}`, { rowVersion: rv });
