import type {
  BankBook, BankingOptions, BankTxn, BankTxnList, Cheque, ChequeBatch, ChequeList, ImportResult, ReconDetail, Reconciliation, StatementImport, StatementLine,
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

/** Browser clients for Phase 17 banking. */
export const bankingOptions = () => apiRequest<BankingOptions>("/bank/banking-options");

export const bankBook = (q: { account: string; from: string; to: string }) => apiRequest<BankBook>(`/bank/book${qs(q)}`);
export const listBankTxns = (q: Q) => apiRequest<BankTxnList>(`/bank/transactions${qs(q)}`);
export const getBankTxn = (id: string) => apiRequest<BankTxn>(`/bank/transactions/${id}`);
export const categoriseTxn = (id: string, body: Body) => post<BankTxn>(`/bank/transactions/${id}/categorise`, body);

export const listStatementImports = (account?: string) => apiRequest<StatementImport[]>(`/bank/statement-imports${qs({ account })}`);
export const getStatementImport = (id: string) => apiRequest<StatementImport>(`/bank/statement-imports/${id}`);
export const importStatement = (body: Body) => post<ImportResult>("/bank/statement-imports", body);
export const applyBankRules = (id: string) =>
  post<{ import: StatementImport; categorised: number; suggested: number; failed: number; left: number }>(`/bank/statement-imports/${id}/apply-rules`);
export const deleteStatementImport = (id: string, rv: number) => apiRequest<void>(`/bank/statement-imports/${id}?rowVersion=${rv}`, { method: "DELETE" });
export const categoriseLine = (id: string, body: Body) => post<StatementLine>(`/bank/statement-lines/${id}/categorise`, body);
export const ignoreLine = (id: string, rv: number) => post<StatementLine>(`/bank/statement-lines/${id}/ignore`, { rowVersion: rv });
export const restoreLine = (id: string, rv: number) => post<StatementLine>(`/bank/statement-lines/${id}/restore`, { rowVersion: rv });

export const listReconciliations = (account?: string) => apiRequest<Reconciliation[]>(`/bank/reconciliations${qs({ account })}`);
export const getReconciliation = (id: string) => apiRequest<ReconDetail>(`/bank/reconciliations/${id}`);
export const createReconciliation = (body: Body) => post<ReconDetail>("/bank/reconciliations", body);
export const updateReconciliation = (id: string, body: Body) => apiRequest<ReconDetail>(`/bank/reconciliations/${id}`, { method: "PATCH", body });
export const reconMatch = (id: string, body: Body) => post<ReconDetail>(`/bank/reconciliations/${id}/match`, body);
export const reconUnmatch = (id: string, body: Body) => post<ReconDetail>(`/bank/reconciliations/${id}/unmatch`, body);
export const reconAutoMatch = (id: string, rv: number) => post<{ matched: number; reconciliation: ReconDetail }>(`/bank/reconciliations/${id}/auto-match`, { rowVersion: rv });
export const reconAdjust = (id: string, body: Body) => post<{ booked: number; reconciliation: ReconDetail }>(`/bank/reconciliations/${id}/adjustments`, body);
export const reconComplete = (id: string, rv: number) => post<ReconDetail>(`/bank/reconciliations/${id}/complete`, { rowVersion: rv });
export const reconReopen = (id: string, rv: number) => post<ReconDetail>(`/bank/reconciliations/${id}/reopen`, { rowVersion: rv });

export const listCheques = (q: Q) => apiRequest<ChequeList>(`/bank/cheques${qs(q)}`);
export const getCheque = (id: string) => apiRequest<Cheque>(`/bank/cheques/${id}`);
export const createCheque = (body: Body) => post<Cheque>("/bank/cheques", body);
export const updateCheque = (id: string, body: Body) => apiRequest<Cheque>(`/bank/cheques/${id}`, { method: "PATCH", body });
/** deposit | present | clear | re-present | stop | cancel: {date, bankAccountId?, remarks?, rowVersion} */
export const chequeAction = (id: string, action: "deposit" | "present" | "clear" | "re-present" | "stop" | "cancel", body: Body) => post<Cheque>(`/bank/cheques/${id}/${action}`, body);
export const bounceCheque = (id: string, body: Body) => post<Cheque>(`/bank/cheques/${id}/bounce`, body);
export const replaceCheque = (id: string, body: Body) => post<Cheque>(`/bank/cheques/${id}/replace`, body);

export const listChequeBatches = () => apiRequest<Omit<ChequeBatch, "lines">[]>("/bank/cheque-batches");
export const getChequeBatch = (id: string) => apiRequest<ChequeBatch>(`/bank/cheque-batches/${id}`);
export const createChequeBatch = (body: Body) => post<ChequeBatch>("/bank/cheque-batches", body);
export const updateChequeBatch = (id: string, body: Body) => apiRequest<ChequeBatch>(`/bank/cheque-batches/${id}`, { method: "PATCH", body });
export const validateChequeBatch = (id: string, rv: number) => post<{ batch: ChequeBatch; valid: number; invalid: number }>(`/bank/cheque-batches/${id}/validate`, { rowVersion: rv });
export const generateChequeBatch = (id: string, rv: number) => post<{ batch: ChequeBatch; generated: number; failed: number }>(`/bank/cheque-batches/${id}/generate`, { rowVersion: rv });
export const cancelChequeBatch = (id: string, rv: number, reason?: string) => post<ChequeBatch>(`/bank/cheque-batches/${id}/cancel`, { rowVersion: rv, reason });
