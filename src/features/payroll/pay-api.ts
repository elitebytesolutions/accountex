import type {
  Loan, LoanEligibility, LoanList, MyPayslips, MyTaxView, Payslip, PayslipList, RunOptions, TaxDeclaration, TaxDeclarationList,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

type Body = Record<string, unknown>;
const qs = (q: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== "ALL") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Browser clients for Phase 32: payslips, loans & advances, tax declarations (HR and My Profile). */
export const runOptions = () => apiRequest<RunOptions>("/payroll/runs/options");

// payslips
export const listPayslips = (q: { run?: string; status?: string; search?: string; department?: string; page?: number; pageSize?: number }) => apiRequest<PayslipList>(`/payroll/payslips${qs(q)}`);
export const getPayslip = (id: string, print = false) => apiRequest<Payslip>(`/payroll/payslips/${id}${print ? "?print=1" : ""}`);
export const myPayslips = () => apiRequest<MyPayslips>("/me/payslips");
export const myPayslip = (id: string) => apiRequest<Payslip>(`/me/payslips/${id}`);

// loans
export const listLoans = (q: { status?: string; type?: string; search?: string; page?: number; pageSize?: number }) => apiRequest<LoanList>(`/payroll/loans${qs(q)}`);
export const getLoan = (id: string) => apiRequest<Loan>(`/payroll/loans/${id}`);
export const loanEligibility = (employee: string) => apiRequest<LoanEligibility>(`/payroll/loans/eligibility?employee=${employee}`);
export const createLoan = (body: Body) => apiRequest<Loan>("/payroll/loans", { method: "POST", body });
export const approveLoan = (id: string, body: { approvedAmount?: number; installmentCount?: number; comment?: string | null }) => apiRequest<Loan>(`/payroll/loans/${id}/approve`, { method: "POST", body });
export const rejectLoan = (id: string, reason: string) => apiRequest<Loan>(`/payroll/loans/${id}/reject`, { method: "POST", body: { reason } });
export const disburseLoan = (id: string, body: { disbursementDate: string; bankAccountId?: string | null; cashAccountId?: string | null }) => apiRequest<Loan>(`/payroll/loans/${id}/disburse`, { method: "POST", body });
export const myLoans = () => apiRequest<{ items: Loan[]; kpis: LoanList["kpis"]; eligibility: LoanEligibility }>("/me/loans");
export const requestMyLoan = (body: Body) => apiRequest<Loan>("/me/loans", { method: "POST", body });

// tax declarations
export const listTaxDeclarations = (q: { status?: string; taxYear?: string; search?: string; page?: number; pageSize?: number }) => apiRequest<TaxDeclarationList>(`/payroll/tax-declarations${qs(q)}`);
export const approveTaxDeclaration = (id: string) => apiRequest<TaxDeclaration>(`/payroll/tax-declarations/${id}/approve`, { method: "POST" });
export const rejectTaxDeclaration = (id: string, reason: string) => apiRequest<TaxDeclaration>(`/payroll/tax-declarations/${id}/reject`, { method: "POST", body: { reason } });
export const myTax = () => apiRequest<MyTaxView>("/me/tax-declarations");
export const declareTax = (body: { declarationType: string; amount: number; paidTo?: string | null }) => apiRequest<TaxDeclaration>("/me/tax-declarations", { method: "POST", body });
/** Multipart upload of a declaration's proof (the JSON client can't send files). */
export async function uploadTaxProof(id: string, file: File): Promise<TaxDeclaration> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch(`/api/me/tax-declarations/${id}/proof`, { method: "POST", body: form, credentials: "same-origin" });
  if (!res.ok) throw await ApiError.fromResponse(res);
  return (await res.json()) as TaxDeclaration;
}
/** Download / preview link of an uploaded file (permission-checked by the API). */
export const attachmentUrl = (id: string) => `/api/attachments/${id}`;

// Phase 30 overtime screen: push the month's approved overtime into its open payroll run
export const pushOvertime = (month: string) => apiRequest<{ pushed: number; runId: string; docNo: string }>("/payroll/runs/push-overtime", { method: "POST", body: { month } });
