import { z } from 'zod';
import type { ApprovalDetail } from '../finance/gl.ts';
import type { EmpRef } from '../hr/attendance.ts';
import { optionalText } from '../treasury/common.ts';

/**
 * Phase 32: payroll runs (PR-YYYY-MM / PR-YYYY-OFF-NN). DRAFT → calculate → REVIEW → submit → AWAITING_APPROVAL →
 * approve (never the preparer) → APPROVED → post (accrual JV) → POSTED → pay (bank / cash voucher) → PAID; reverse
 * from POSTED or PAID; send back to REVIEW; reject ends the run.
 */
type Ref = { id: string; code: string; name: string };
type UserRef = { id: string; name: string };
type VoucherRef = { id: string; docNo: string; status: string };

export const RUN_STATUSES = ['DRAFT', 'REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'POSTED', 'PAID', 'REJECTED', 'CANCELLED', 'REVERSED'] as const;
export const LINE_FLAGS: Record<string, string> = {
  VARIANCE_ABOVE_15: 'Net pay moved more than 15% vs last month',
  MISSING_IBAN: 'Bank transfer without an IBAN on file',
  NEGATIVE_NET_RISK: 'Loan recovery above half of gross (or deductions above gross)',
  PRO_RATA: 'Paid for part of the month',
  MISSING_PUNCH: 'Days with a check-in but no check-out',
  ON_NOTICE: 'On notice period',
  EXIT_IN_PERIOD: 'Leaves the company in this period',
};

export type PayrollRunSummary = {
  id: string; docNo: string; runType: string; payrollMonth: string; periodFrom: string; periodTo: string; payDate: string;
  payGroup: Ref | null; status: string; employeeCount: number; grossAmount: number; taxAmount: number; eobiEmployeeAmount: number;
  pfEmployeeAmount: number; loanAmount: number; deductionAmount: number; netAmount: number; employerContributionAmount: number;
  journal: VoucherRef | null; postedAt: string | null; paidAt: string | null; createdAt: string; rowVersion: number;
};

export type RunLineComponent = {
  id: string; componentId: string; code: string; componentType: string; label: string; basisText: string | null; quantity: number | null;
  rate: number | null; amount: number; isTaxable: boolean; exemptAmount: number; loanId: string | null; payrollInputId: string | null; showOnPayslip: boolean;
};
export type RunLine = {
  id: string; employee: EmpRef; daysInMonth: number; paidDays: number; lwpDays: number; leaveTakenDays: number; overtimeHours: number;
  basicAmount: number; allowanceAmount: number; grossAmount: number; taxAmount: number; eobiAmount: number; pfAmount: number; loanAmount: number;
  otherDeductionAmount: number; deductionAmount: number; netAmount: number; employerEobiAmount: number; employerPessiAmount: number;
  employerPfAmount: number; gratuityProvisionAmount: number; taxStatus: string | null; projectedAnnualSalary: number | null;
  annualExemptAmount: number | null; annualTaxableIncome: number | null; annualTaxLiability: number | null; prevNetAmount: number | null;
  variancePct: number | null; isNewJoiner: boolean; isRevised: boolean; flags: string[]; payMode: string; bankName: string | null;
  ibanMasked: string | null; paymentRef: string | null; paid: boolean; isOnHold: boolean; holdReason: string | null; components: RunLineComponent[];
};
export type RunAdjustment = {
  id: string; employee: EmpRef; component: Ref & { componentType: string }; inputSource: string; quantity: number | null; amount: number;
  isTaxable: boolean; remarks: string | null; sourceDocType: string | null; sourceDocId: string | null;
};
/** Step 2 of the wizard: what the HR modules feed into the run. */
export type RunInputs = {
  attendance: { employees: number; withRegister: number; missingPunches: { employee: EmpRef; date: string }[]; absentDays: number };
  overtime: { claims: number; hours: number; amount: number; employees: number; pending: number; unpushed: number };
  unpaidLeave: { employees: number; days: number };
  loans: { installments: number; amount: number; loans: number; pending: number };
  revisions: number;
};
export type PayrollGlLine = { account: { id: string; code: string; name: string }; particulars: string; debit: number; credit: number; detail: string | null };
export type SalaryPaymentBatch = {
  id: string; paymentMethod: string; bankAccount: { id: string; name: string } | null; employeeCount: number; totalAmount: number;
  instructionRef: string | null; valueDate: string | null; status: string; voucher: VoucherRef | null;
};
export type RunChecklistItem = { itemKey: string; label: string; isDone: boolean; doneBy: UserRef | null; doneAt: string | null };
export type PayrollRun = PayrollRunSummary & {
  attendanceCutoffDate: string | null; salaryPayableAccount: Ref; includeNoticePeriod: boolean; includeExited: boolean; workingDays: number | null;
  publicHolidays: number | null; wizardStep: number; calculatedAt: string | null; createdBy: UserRef | null; preparedBy: UserRef | null; preparedAt: string | null;
  approvedBy: UserRef | null; approvedAt: string | null; postedBy: UserRef | null; reversalJournal: VoucherRef | null; emailPayslips: boolean;
  publishToEss: boolean; smsNetPayAlert: boolean; createDepositReminders: boolean; narration: string | null; remarks: string | null;
  branches: { branchId: string; code: string; name: string; employeeCount: number; isIncluded: boolean }[];
  checklist: RunChecklistItem[]; adjustments: RunAdjustment[]; lines: RunLine[]; inputs: RunInputs | null; glPreview: PayrollGlLine[];
  batches: SalaryPaymentBatch[]; previous: { id: string; docNo: string; payrollMonth: string; grossAmount: number; taxAmount: number; netAmount: number; employeeCount: number } | null;
  approval: ApprovalDetail | null; waitingOn: string | null;
  can: { edit: boolean; calculate: boolean; submit: boolean; approve: boolean; reject: boolean; post: boolean; pay: boolean; cancel: boolean; reverse: boolean };
};
export type RunList = { items: PayrollRunSummary[]; total: number };

/** Step 1: who the run would cover. */
export type RunPreview = {
  employees: number; newJoiners: number; exits: number; onNotice: number; revisions: number; workingDays: number; publicHolidays: number;
  byBranch: { branchId: string; employees: number }[];
  previous: { id: string; docNo: string; status: string; payrollMonth: string } | null;
  existing: { id: string; docNo: string; status: string } | null;
};
export type RunOptions = {
  payGroups: Ref[]; branches: Ref[]; payableAccounts: Ref[]; defaultPayableAccountId: string | null;
  bankAccounts: { id: string; name: string; last4: string | null; useForPayroll: boolean }[]; cashAccounts: Ref[];
  components: (Ref & { componentType: string; systemRole: string | null; taxable: boolean })[];
  employees: (EmpRef & { hasSalary: boolean })[];
};

export type PayrollOverview = {
  last: PayrollRunSummary | null; previous: PayrollRunSummary | null; taxable: number; insured: number;
  employerEobi: number; employeeEobi: number; employerPessi: number; employerPf: number;
  monthly: { month: string; basic: number; allowances: number; employer: number; net: number; gross: number }[];
  open: (PayrollRunSummary & { preparedBy: string | null; approvalWaitingOn: string | null }) | null;
  nextMonth: string;
  byDepartment: { department: string; employees: number; gross: number }[];
  recent: PayrollRunSummary[];
};

const ymd = z.iso.date('Use a date');
const month = z.string().regex(/^\d{4}-\d{2}$/, 'Choose the month');
const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));

export const RunCreateSchema = z.object({
  runType: z.enum(['REGULAR', 'OFF_CYCLE', 'BONUS_ONLY']).default('REGULAR'),
  payrollMonth: month,
  periodFrom: ymd.optional(),
  periodTo: ymd.optional(),
  payDate: ymd,
  attendanceCutoffDate: ymd.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  payGroupId: optionalId,
  salaryPayableAccountId: z.uuid('Choose the salary payable account'),
  includeNoticePeriod: z.boolean().default(true),
  includeExited: z.boolean().default(false),
  branchIds: z.array(z.uuid()).max(200).default([]),
  narration: optionalText(300),
}).superRefine((r, ctx) => {
  if (r.periodFrom && r.periodTo && r.periodTo < r.periodFrom) ctx.addIssue({ code: 'custom', path: ['periodTo'], message: 'After the start' });
  if (r.attendanceCutoffDate && r.periodTo && r.attendanceCutoffDate > r.periodTo) ctx.addIssue({ code: 'custom', path: ['attendanceCutoffDate'], message: 'Within the period' });
});
export type RunCreate = z.infer<typeof RunCreateSchema>;
export const RunUpdateSchema = z.object({
  payDate: ymd.optional(),
  attendanceCutoffDate: ymd.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  salaryPayableAccountId: z.uuid().optional(),
  includeNoticePeriod: z.boolean().optional(),
  includeExited: z.boolean().optional(),
  branchIds: z.array(z.uuid()).max(200).optional(),
  narration: optionalText(300),
  emailPayslips: z.boolean().optional(),
  publishToEss: z.boolean().optional(),
  smsNetPayAlert: z.boolean().optional(),
  createDepositReminders: z.boolean().optional(),
  rowVersion: z.coerce.number().int().min(0),
});
export type RunUpdate = z.infer<typeof RunUpdateSchema>;

export const PayrollAdjustmentInputSchema = z.object({
  id: z.uuid().optional(),
  employeeId: z.uuid('Choose the employee'),
  componentId: z.uuid('Choose the component'),
  amount: z.coerce.number('More than 0').positive('More than 0').max(100_000_000),
  quantity: z.coerce.number().min(0).max(100_000).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v)),
  isTaxable: z.boolean().default(true),
  remarks: optionalText(300),
  inputSource: z.enum(['MANUAL', 'CSV_IMPORT', 'OVERTIME', 'EXPENSE_CLAIM', 'SALARY_REVISION', 'HELPDESK']).default('MANUAL'),
});
export type PayrollAdjustmentInput = z.infer<typeof PayrollAdjustmentInputSchema>;
export const PayrollAdjustmentsSchema = z.object({ adjustments: z.array(PayrollAdjustmentInputSchema).max(2000), rowVersion: z.coerce.number().int().min(0) });
export type PayrollAdjustmentsInput = z.infer<typeof PayrollAdjustmentsSchema>;

export const RunReasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });
export const RunApproveSchema = z.object({ comment: optionalText(500) });
export const RunChecklistSchema = z.object({ itemKey: z.string().regex(/^[A-Z][A-Z0-9_]{2,39}$/), isDone: z.boolean() });
export const RunPostSchema = z.object({ publishToEss: z.boolean().default(true), createDepositReminders: z.boolean().default(true) });
export const RunPaySchema = z.object({
  paymentMethod: z.enum(['BULK_UPLOAD', 'IBFT', 'CHEQUE', 'CASH']),
  bankAccountId: optionalId,
  cashAccountId: optionalId,
  valueDate: ymd,
  instructionRef: optionalText(60),
  fileFormat: z.enum(['CSV', 'TXT']).default('CSV'),
  lineIds: z.array(z.uuid()).max(5000).optional(),
}).superRefine((p, ctx) => {
  if (p.paymentMethod === 'CASH' && !p.cashAccountId) ctx.addIssue({ code: 'custom', path: ['cashAccountId'], message: 'Choose the cash account' });
  if (p.paymentMethod !== 'CASH' && !p.bankAccountId) ctx.addIssue({ code: 'custom', path: ['bankAccountId'], message: 'Choose the bank account' });
});
export type RunPay = z.infer<typeof RunPaySchema>;
export const RunListQuerySchema = z.object({
  status: z.string().trim().max(40).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const RunPreviewQuerySchema = z.object({ month, payGroup: z.uuid().optional(), runType: z.enum(['REGULAR', 'OFF_CYCLE', 'BONUS_ONLY']).default('REGULAR') });

/** Days in a YYYY-MM month and its first / last dates. */
export function payrollMonthBounds(m: string) {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { first: `${m}-01`, last: `${m}-${String(days).padStart(2, '0')}`, days };
}
