import type {
  FbrAuthority, FbrConnectionEvent, FbrSendingState, FbrSubmission, FbrSubmissionList, FbrSyncResult, FbrTestResult, SalesTaxReturnDetail, SalesTaxReturnList,
  WhtCertificate, WhtCertificateList, WhtChallan, WhtDeduction, WhtDeductionList, WhtStatement, WhtSummary,
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
const post = <T,>(path: string, body?: Body) => apiRequest<T>(path, { method: "POST", body: body ?? {} });
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });

export type TaxOptions = {
  bankAccounts: { id: string; name: string }[];
  sections: { code: string; label: string }[];
  vendors: { id: string; name: string; ntnCnic: string | null }[];
  customers: { id: string; name: string; ntnCnic: string | null }[];
  employees: { id: string; name: string }[];
  ntn: string | null;
  strn: string | null;
  companyName: string | null;
};

/** Browser clients for Phase 28 tax compliance. */
export const taxOptions = () => apiRequest<TaxOptions>("/tax/options");

// sales tax returns
export const listReturns = (q: Q) => apiRequest<SalesTaxReturnList>(`/tax/sales-tax-returns${qs(q)}`);
export const getReturn = (id: string) => apiRequest<SalesTaxReturnDetail>(`/tax/sales-tax-returns/${id}`);
export const prepareReturn = (periodMonth: string, authority = "FBR") => post<SalesTaxReturnDetail>("/tax/sales-tax-returns/prepare", { periodMonth, authority });
export const updateReturn = (id: string, body: Body) => apiRequest<SalesTaxReturnDetail>(`/tax/sales-tax-returns/${id}`, { method: "PATCH", body });
export const deleteReturn = (id: string, rv: number) => del(`/tax/sales-tax-returns/${id}`, rv);
export const validateReturn = (id: string, rv: number) => post<SalesTaxReturnDetail>(`/tax/sales-tax-returns/${id}/approve`, { rowVersion: rv });
export const fileReturn = (id: string, rv: number) => post<SalesTaxReturnDetail>(`/tax/sales-tax-returns/${id}/file`, { rowVersion: rv });
export const payReturn = (id: string, body: Body) => post<SalesTaxReturnDetail>(`/tax/sales-tax-returns/${id}/pay`, body);
export const annexUrl = (id: string, annex: "a" | "c") => `/api/tax/sales-tax-returns/${id}/annex-${annex}.csv`;

// WHT register and challans
export const whtSummary = (period: string) => apiRequest<WhtSummary>(`/tax/wht/summary${qs({ period })}`);
export const listDeductions = (q: Q) => apiRequest<WhtDeductionList>(`/tax/wht${qs(q)}`);
export const createDeduction = (body: Body) => post<WhtDeduction>("/tax/wht", body);
export const updateDeduction = (id: string, body: Body) => apiRequest<WhtDeduction>(`/tax/wht/${id}`, { method: "PATCH", body });
export const deleteDeduction = (id: string, rv: number) => del(`/tax/wht/${id}`, rv);
export const listChallans = (q: Q = {}) => apiRequest<WhtChallan[]>(`/tax/wht/challans${qs(q)}`);
export const challanUnpaid = (period: string, sections: string[]) => apiRequest<{ amount: number }>(`/tax/wht/challans/unpaid${qs({ period, sections: sections.join(",") })}`);
export const createChallan = (body: Body) => post<WhtChallan>("/tax/wht/challans", body);
export const cancelChallan = (id: string, rv: number, reason?: string) => post<WhtChallan>(`/tax/wht/challans/${id}/cancel`, { rowVersion: rv, reason });

// certificates and statements
export const listCertificates = (q: Q) => apiRequest<WhtCertificateList>(`/tax/wht/certificates${qs(q)}`);
export const generateCertificates = (periodFrom: string, periodTo: string) => post<{ created: number }>("/tax/wht/certificates/generate", { periodFrom, periodTo });
export const receiveCertificate = (body: Body) => post<WhtCertificate>("/tax/wht/certificates/received", body);
export const issueCertificate = (id: string, rv: number) => post<WhtCertificate>(`/tax/wht/certificates/${id}/issue`, { rowVersion: rv });
export const claimCertificate = (id: string, rv: number) => post<WhtCertificate>(`/tax/wht/certificates/${id}/claim`, { rowVersion: rv });
export const cancelCertificate = (id: string, rv: number, reason?: string) => post<WhtCertificate>(`/tax/wht/certificates/${id}/cancel`, { rowVersion: rv, reason });
export const deleteCertificate = (id: string, rv: number) => del(`/tax/wht/certificates/${id}`, rv);
export const certificatePrint = (id: string) =>
  apiRequest<{ certificate: WhtCertificate; deductions: WhtDeduction[]; company: { name: string | null; ntn: string | null } }>(`/tax/wht/certificates/${id}/print`);
export const listStatements = () => apiRequest<WhtStatement[]>("/tax/wht/statements");
export const prepareStatement = (returnType: string, periodOf: string) => post<WhtStatement>("/tax/wht/statements/prepare", { returnType, periodOf });
export const fileStatement = (id: string, body: Body) => post<WhtStatement>(`/tax/wht/statements/${id}/file`, body);

// FBR submissions
export const fbrState = (authority: FbrAuthority) => apiRequest<FbrSendingState>(`/tax/fbr/state${qs({ authority })}`);
export const listSubmissions = (q: Q) => apiRequest<FbrSubmissionList>(`/tax/fbr/submissions${qs(q)}`);
export const fbrEvents = (authority: FbrAuthority) => apiRequest<FbrConnectionEvent[]>(`/tax/fbr/connection-events${qs({ authority })}`);
export const testFbr = (authority: FbrAuthority) => post<FbrTestResult>("/tax/fbr/test-connection", { authority });
export const syncFbr = (authority: FbrAuthority) => post<FbrSyncResult>("/tax/fbr/sync", { authority });
export const sendBacklog = (authority: FbrAuthority) => post<FbrSyncResult>("/tax/fbr/backlog/send", { authority });
export const skipBacklog = (authority: FbrAuthority, from: string, to: string) => post<{ skipped: number }>("/tax/fbr/backlog/skip", { authority, from, to });
export const retrySubmission = (id: string) => post<FbrSubmission>(`/tax/fbr/submissions/${id}/retry`);
export const requeueSubmission = (id: string) => post<FbrSubmission>(`/tax/fbr/submissions/${id}/requeue`);
