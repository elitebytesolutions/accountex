import { z } from 'zod';
import { optionalId } from '../parties/common.ts';
import { optionalText } from '../treasury/common.ts';
import type { EmpRef } from './attendance.ts';
import type { Who } from './leave-request.ts';

/**
 * Phase 33: full & final settlements (FS-). Started from an exit, calculated by the database from the last salary
 * (gratuity, leave encashment, notice, loans, tax, EOBI), edited while DRAFT, approved through the FINAL_SETTLEMENT
 * workflow (approval posts the JV), paid by bank payment voucher. Completing the exit needs it APPROVED.
 */
export const SETTLEMENT_EARNING_KINDS = ['PENDING_SALARY', 'LEAVE_ENCASHMENT', 'GRATUITY', 'NOTICE_PAY', 'BONUS', 'OTHER_EARNING'] as const;
export const SETTLEMENT_DEDUCTION_KINDS = ['NOTICE_SHORTFALL', 'ADVANCE_RECOVERY', 'LOAN_RECOVERY', 'INCOME_TAX', 'EOBI', 'OTHER_DEDUCTION'] as const;
/** Lines the preparer may add by hand (the rest come from Recalculate). */
export const SETTLEMENT_MANUAL_KINDS = ['BONUS', 'OTHER_EARNING', 'OTHER_DEDUCTION'] as const;
export const SETTLEMENT_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CANCELLED'] as const;

export type SettlementLine = {
  id: string; lineNo: number; componentKind: string; direction: 'EARNING' | 'DEDUCTION'; label: string; basisText: string | null;
  quantity: number | null; rate: number | null; amount: number; taxableAmount: number | null; loan: { id: string; docNo: string } | null;
  account: { id: string; code: string; name: string } | null; isManual: boolean;
};
export type SettlementGlLine = { account: string; particulars: string; debit: number; credit: number };
export type SettlementListItem = {
  id: string; docNo: string; docDate: string; employee: EmpRef; offboardingId: string; lastWorkingDay: string | null; exitType: string | null;
  earningsAmount: number; deductionAmount: number; netAmount: number; status: string; paidAt: string | null;
};
export type SettlementList = { items: SettlementListItem[]; total: number; counts: Record<string, number> };
export type SettlementDetail = SettlementListItem & {
  cnic: string | null; joiningDate: string; serviceMonths: number | null; serviceLabel: string; noticeShortfallDays: number;
  lastBasicAmount: number; lastGrossAmount: number; perDayGrossAmount: number | null; perDayBasicAmount: number | null;
  netAmountWords: string; pfTrustBalanceAmount: number | null; remarks: string | null;
  employeeBank: { id: string; label: string } | null; payFromBankAccount: { id: string; label: string } | null;
  journal: { id: string; docNo: string } | null; payment: { id: string; docNo: string } | null;
  preparedBy: Who | null; preparedAt: string | null; approvedBy: Who | null; approvedAt: string | null; createdBy: Who | null; createdAt: string;
  exit: { id: string; docNo: string; resignationDate: string | null; lastWorkingDay: string; noticeDaysRequired: number; noticeDaysServed: number | null;
    noticeWaived: boolean; reasonCategory: string; eligibleForRehire: boolean | null; status: string };
  clearance: { id: string; clearanceArea: string; description: string; owner: string | null; status: string }[];
  lines: SettlementLine[]; glPreview: SettlementGlLine[];
  approval: { status: string; steps: { stepNo: number; name: string; state: string; approvers: string[]; actedBy: string | null; actedAt: string | null }[] } | null;
  waitingOn: string | null;
  rule: { daysPerYear: number; minServiceYears: number; partYearOverMonths: number; taxExemptAmount: number };
  can: { edit: boolean; submit: boolean; approve: boolean; pay: boolean; cancel: boolean };
  rowVersion: number;
};
export type SettlementOptions = {
  bankAccounts: { id: string; label: string }[];
  employeeBanks: { id: string; label: string }[];
  accounts: { id: string; code: string; name: string }[];
};
/** What Recalculate found (service, gratuity years, tax) and any notes (e.g. the exit month is paid by the payroll run). */
export type SettlementCalcSummary = { serviceYears: number; serviceMonths: number; serviceDays: number; gratuityYears: number; noticeShortfallDays: number; taxYear: string; taxableAmount: number; tax: number; pendingPaidByRun: boolean; notes: string[] };

export const SettlementStartSchema = z.object({ offboardingId: z.uuid('Choose the exit') });
export type SettlementStart = z.infer<typeof SettlementStartSchema>;

export const SettlementLineInputSchema = z.object({
  id: z.uuid().optional(),
  componentKind: z.enum([...SETTLEMENT_EARNING_KINDS, ...SETTLEMENT_DEDUCTION_KINDS], 'Choose the component'),
  label: z.string().trim().min(2, 'Describe the line').max(120),
  basisText: optionalText(200),
  quantity: z.coerce.number().min(0).max(100_000).optional().nullable(),
  rate: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
  amount: z.coerce.number('Not negative').min(0, 'Not negative').max(1_000_000_000),
  taxableAmount: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
  loanId: optionalId,
  accountId: optionalId,
}).refine((l) => !['ADVANCE_RECOVERY', 'LOAN_RECOVERY'].includes(l.componentKind) || !!l.loanId, { path: ['loanId'], message: 'Loan recovery needs the loan' })
  .refine((l) => l.taxableAmount == null || l.taxableAmount <= l.amount, { path: ['taxableAmount'], message: 'Up to the amount' });
export type SettlementLineInput = z.infer<typeof SettlementLineInputSchema>;

export const SettlementUpdateSchema = z.object({
  rowVersion: z.coerce.number().int().min(0),
  remarks: optionalText(1000).optional(),
  pfTrustBalanceAmount: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
  employeeBankId: optionalId.optional(),
  payFromBankAccountId: optionalId.optional(),
  lines: z.array(SettlementLineInputSchema).max(60).optional(),
});
export type SettlementUpdate = z.infer<typeof SettlementUpdateSchema>;

export const SettlementPaySchema = z.object({
  bankAccountId: z.uuid('Choose the bank account'),
  valueDate: z.iso.date('Use a date'),
  chequeNo: optionalText(30),
});
export type SettlementPay = z.infer<typeof SettlementPaySchema>;
export const SettlementReasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });
export const SettlementCommentSchema = z.object({ comment: optionalText(300) });
export const SettlementQuerySchema = z.object({
  status: z.string().trim().max(30).optional(),
  offboardingId: z.uuid().optional(),
  search: z.string().trim().max(80).optional(),
});
export type SettlementQuery = z.infer<typeof SettlementQuerySchema>;
