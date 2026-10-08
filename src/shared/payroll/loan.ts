import { z } from 'zod';
import type { ApprovalDetail } from '../finance/gl.ts';
import type { EmpRef } from '../hr/attendance.ts';
import { optionalText } from '../treasury/common.ts';

/** Phase 32: loans (LN-) and salary advances (ADV-), recovered through payroll installments. */
type UserRef = { id: string; name: string };
type VoucherRef = { id: string; docNo: string; status: string };

/**
 * Staff loan policy (the template's "Employee Loan Policy"): a loan or medical loan up to 3 × monthly gross over at
 * most 24 installments, one active loan at a time, after one year of service; a salary advance up to 50% of basic over
 * at most 3 months; every installment (with the ones already running) at most 30% of gross. HR may record a request
 * outside the policy (flagged); self-service requests must be within it.
 */
export const LOAN_POLICY = {
  LOAN: { limitTimesGross: 3, maxInstallments: 24, minServiceMonths: 12 },
  MEDICAL: { limitTimesGross: 3, maxInstallments: 24, minServiceMonths: 0 },
  SALARY_ADVANCE: { limitPctOfBasic: 50, maxInstallments: 3, minServiceMonths: 0 },
  maxInstallmentPctOfGross: 30,
} as const;

export type LoanInstallment = { id: string; installmentNo: number; dueMonth: string; amount: number; balanceAfter: number; status: string; recoveredAt: string | null; payrollRun: string | null };
export type Loan = {
  id: string; docNo: string; docDate: string; employee: EmpRef; loanType: string; purpose: string; purposeDetail: string | null; requestChannel: string;
  requestedAmount: number; approvedAmount: number | null; installmentCount: number; installmentAmount: number; firstDeductionMonth: string;
  markupType: string; grossSalarySnapshot: number | null; installmentPctOfGross: number | null; eligibleLimitAmount: number | null;
  isWithinPolicy: boolean | null; disbursementDate: string | null; disbursedFrom: { kind: 'BANK' | 'CASH'; id: string; name: string } | null;
  disbursementVoucher: VoucherRef | null; recoveredAmount: number; outstandingAmount: number; status: string; decisionComment: string | null;
  approvedBy: UserRef | null; approvedAt: string | null; closedAt: string | null; remarks: string | null; createdAt: string; createdBy: UserRef | null; rowVersion: number;
  installments: LoanInstallment[]; approval: ApprovalDetail | null; waitingOn: string | null; canAct: boolean;
};
export type LoanList = {
  items: Omit<Loan, 'installments' | 'approval' | 'canAct' | 'waitingOn'>[]; total: number; counts: Record<string, number>;
  kpis: { active: number; activeLoans: number; activeAdvances: number; outstanding: number; monthlyRecovery: number; recoveryMonth: string; pending: number; pendingAmount: number };
};
export type LoanEligibility = {
  employeeId: string; gross: number; basic: number; serviceMonths: number; activeLoans: number; runningInstallments: number;
  limits: Record<'LOAN' | 'MEDICAL' | 'SALARY_ADVANCE', { limit: number; maxInstallments: number; eligible: boolean; reason: string | null }>;
};
export type LoanCheck = { ok: boolean; label: string; detail: string };

const month = z.string().regex(/^\d{4}-\d{2}$/, 'Choose the month');
const LoanFields = {
  loanType: z.enum(['LOAN', 'MEDICAL', 'SALARY_ADVANCE']),
  purpose: z.string().trim().min(1).max(30).default('PERSONAL'),
  purposeDetail: optionalText(300),
  requestedAmount: z.coerce.number('More than 0').positive('More than 0').max(100_000_000),
  installmentCount: z.coerce.number('1 to 60').int('Whole months').min(1, '1 to 60').max(60, '1 to 60'),
  firstDeductionMonth: month,
  remarks: optionalText(500),
};
export const LoanCreateSchema = z.object({ employeeId: z.uuid('Choose the employee'), ...LoanFields });
export type LoanCreate = z.infer<typeof LoanCreateSchema>;
export const MyLoanCreateSchema = z.object(LoanFields);
export type MyLoanCreate = z.infer<typeof MyLoanCreateSchema>;
export const LoanApproveSchema = z.object({
  approvedAmount: z.coerce.number().positive('More than 0').max(100_000_000).optional(),
  installmentCount: z.coerce.number().int().min(1, '1 to 60').max(60, '1 to 60').optional(),
  comment: optionalText(500),
});
export const LoanDisburseSchema = z.object({
  disbursementDate: z.iso.date('Use a date'),
  bankAccountId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  cashAccountId: z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
}).refine((d) => !!d.bankAccountId !== !!d.cashAccountId, { path: ['bankAccountId'], message: 'Choose one bank or cash account' });
export const LoanReasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });

/** The recovery schedule: equal installments rounded up to the rupee, the last one taking the remainder. */
export function loanSchedule(amount: number, count: number, firstMonth: string): { no: number; month: string; amount: number; balanceAfter: number }[] {
  const each = Math.ceil(amount / count);
  const out: { no: number; month: string; amount: number; balanceAfter: number }[] = [];
  let left = Math.round(amount * 100) / 100;
  const [y, m] = firstMonth.split('-').map(Number) as [number, number];
  for (let i = 0; i < count && left > 0; i++) {
    const a = i === count - 1 ? left : Math.min(each, left);
    left = Math.round((left - a) * 100) / 100;
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    out.push({ no: i + 1, month: d.toISOString().slice(0, 7), amount: a, balanceAfter: left });
  }
  return out;
}
export const installmentOf = (amount: number, count: number) => Math.ceil(amount / count);

/** The policy checks for a request (also shown live in the request forms). */
export function loanChecks(e: LoanEligibility, loanType: 'LOAN' | 'MEDICAL' | 'SALARY_ADVANCE', amount: number, count: number): LoanCheck[] {
  const l = e.limits[loanType];
  const emi = installmentOf(amount, count);
  const pct = e.gross ? ((e.runningInstallments + emi) / e.gross) * 100 : 100;
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return [
    { ok: l.eligible, label: loanType === 'SALARY_ADVANCE' ? 'Advance available' : 'Eligible for this facility', detail: l.reason ?? `${e.serviceMonths} months of service` },
    { ok: amount <= l.limit, label: `Within the limit of Rs ${fmt(l.limit)}`, detail: loanType === 'SALARY_ADVANCE' ? `${LOAN_POLICY.SALARY_ADVANCE.limitPctOfBasic}% of basic Rs ${fmt(e.basic)}` : `${LOAN_POLICY[loanType].limitTimesGross} × gross Rs ${fmt(e.gross)}` },
    { ok: count <= l.maxInstallments, label: `Repaid within ${l.maxInstallments} months`, detail: `${count} installments of Rs ${fmt(emi)}` },
    { ok: pct <= LOAN_POLICY.maxInstallmentPctOfGross, label: `Installments ≤ ${LOAN_POLICY.maxInstallmentPctOfGross}% of gross`, detail: `${pct.toFixed(1)}% incl. Rs ${fmt(e.runningInstallments)} already running` },
  ];
}
