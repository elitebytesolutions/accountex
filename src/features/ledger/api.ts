import type {
  ApprovalDetail, ApprovalInbox, DayBookRow, GlOptions, GlRow, OpeningBatch, RecurringRun, RecurringTemplate, TrialBalanceRow, Voucher, VoucherList,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
const qs = (q: Record<string, string | number | boolean | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Browser clients for Phase 16: vouchers, approvals, opening balances, recurring vouchers and the ledger reports. */
export const voucherOptions = () => apiRequest<GlOptions>("/accounting/vouchers/options");
export const listVouchers = (q: Record<string, string | number | boolean | null | undefined>) => apiRequest<VoucherList>(`/accounting/vouchers${qs(q)}`);
export const getVoucher = (id: string) => apiRequest<Voucher>(`/accounting/vouchers/${id}`);
export const createVoucher = (body: Body) => apiRequest<Voucher>("/accounting/vouchers", { method: "POST", body });
export const updateVoucher = (id: string, body: Body & Version) => apiRequest<Voucher>(`/accounting/vouchers/${id}`, { method: "PATCH", body });
export const deleteVoucher = (id: string, rv: number) => apiRequest<void>(`/accounting/vouchers/${id}?rowVersion=${rv}`, { method: "DELETE" });
export const submitVoucher = (id: string, rv: number) => apiRequest<Voucher>(`/accounting/vouchers/${id}/submit`, { method: "POST", body: { rowVersion: rv } });
export const recallVoucher = (id: string, rv: number) => apiRequest<Voucher>(`/accounting/vouchers/${id}/recall`, { method: "POST", body: { rowVersion: rv } });
export const postVoucher = (id: string, rv: number, postingDate?: string) => apiRequest<Voucher>(`/accounting/vouchers/${id}/post`, { method: "POST", body: { rowVersion: rv, postingDate } });
export const reverseVoucher = (id: string, body: { reversalDate: string; reason: string; remarks: string | null } & Version) =>
  apiRequest<Voucher>(`/accounting/vouchers/${id}/reverse`, { method: "POST", body });
export const duplicateVoucher = (id: string) => apiRequest<Voucher>(`/accounting/vouchers/${id}/duplicate`, { method: "POST" });
export const commentVoucher = (id: string, comment: string) => apiRequest<Voucher>(`/accounting/vouchers/${id}/comment`, { method: "POST", body: { comment } });
export const voucherPrinted = (id: string) => apiRequest<void>(`/accounting/vouchers/${id}/printed`, { method: "POST" });

export const approvalInbox = () => apiRequest<ApprovalInbox>("/approvals/inbox");
export const approvalDetail = (id: string) => apiRequest<ApprovalDetail>(`/approvals/${id}`);
export const approvalAct = (id: string, action: "approve" | "reject" | "request-changes", body: { reason: string | null; comment: string | null }) =>
  apiRequest<ApprovalDetail>(`/approvals/${id}/${action}`, { method: "POST", body });
export const approvalDelegate = (id: string, body: { userId: string; comment: string | null }) => apiRequest<ApprovalDetail>(`/approvals/${id}/delegate`, { method: "POST", body });
export const approvalComment = (id: string, comment: string) => apiRequest<ApprovalDetail>(`/approvals/${id}/comment`, { method: "POST", body: { comment } });
export const approvalBulk = (body: { ids: string[]; action: "approve" | "reject"; reason: string | null }) =>
  apiRequest<{ done: string[]; failed: { id: string; message: string }[] }>("/approvals/bulk", { method: "POST", body });

export const getOpening = (year: string) => apiRequest<OpeningBatch>(`/accounting/opening-balances?year=${year}`);
export const saveOpening = (body: Body) => apiRequest<OpeningBatch>("/accounting/opening-balances", { method: "PUT", body });
export const postOpening = (id: string, rv: number) => apiRequest<OpeningBatch>(`/accounting/opening-balances/${id}/post`, { method: "POST", body: { rowVersion: rv } });

export const listRecurring = () => apiRequest<RecurringTemplate[]>("/accounting/recurring-vouchers");
export const createRecurring = (body: Body) => apiRequest<RecurringTemplate>("/accounting/recurring-vouchers", { method: "POST", body });
export const updateRecurring = (id: string, body: Body & Version) => apiRequest<RecurringTemplate>(`/accounting/recurring-vouchers/${id}`, { method: "PATCH", body });
export const deleteRecurring = (id: string, rv: number) => apiRequest<void>(`/accounting/recurring-vouchers/${id}?rowVersion=${rv}`, { method: "DELETE" });
export const recurringAction = (id: string, action: "pause" | "resume", rv: number) =>
  apiRequest<RecurringTemplate>(`/accounting/recurring-vouchers/${id}/${action}`, { method: "POST", body: { rowVersion: rv } });
export const runRecurring = (id: string, date?: string) =>
  apiRequest<{ voucherId: string | null; template: RecurringTemplate; run: RecurringRun | null }>(`/accounting/recurring-vouchers/${id}/run-now`, { method: "POST", body: { date } });
export const runDueRecurring = () => apiRequest<{ runs: number; failed: number; reversed: number }>("/accounting/recurring-vouchers/run-due", { method: "POST" });
export const recurringRuns = (id: string) => apiRequest<RecurringRun[]>(`/accounting/recurring-vouchers/${id}/runs`);

type ReportQ = { from?: string; to?: string; date?: string; branch?: string; account?: string; level?: number; zero?: boolean };
export const trialBalance = (q: ReportQ) => apiRequest<{ from: string; to: string; rows: TrialBalanceRow[] }>(`/reports/trial-balance${qs(q)}`);
export const generalLedger = (q: ReportQ) => apiRequest<{ from: string; to: string; rows: GlRow[]; truncated: boolean }>(`/reports/gl${qs(q)}`);
export const dayBook = (q: ReportQ) => apiRequest<{ date: string; rows: DayBookRow[] }>(`/reports/day-book${qs(q)}`);
export const approvalDelegates = (id: string) => apiRequest<{ id: string; name: string }[]>(`/approvals/${id}/delegates`);
