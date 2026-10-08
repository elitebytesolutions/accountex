import type { EmpRef } from '../hr/attendance.ts';
import type { RunLineComponent } from './run.ts';

/** Phase 32: payslips (PS-YYYY-MM-NNNN), one per line of a posted run. Emailing arrives with Phase 29; My Profile shows them. */
export type PayslipSummary = {
  id: string; docNo: string; payrollMonth: string; run: { id: string; docNo: string; status: string }; employee: EmpRef;
  bank: string | null; grossAmount: number; deductionAmount: number; netAmount: number; status: string; publishedToEssAt: string | null;
  viewedAt: string | null; emailTo: string | null; holdReason: string | null;
};
export type PayslipList = {
  items: PayslipSummary[]; total: number; counts: Record<string, number>;
  run: { id: string; docNo: string; payrollMonth: string; status: string; postedAt: string | null; paidAt: string | null; netAmount: number; employeeCount: number } | null;
  runs: { id: string; docNo: string; payrollMonth: string; status: string }[];
  kpis: { generated: number; emailed: number; viewed: number; noEmail: number };
};
export type PayslipYtd = { from: string; to: string; gross: number; tax: number; eobi: number; pf: number; loanRecovered: number; net: number };
export type Payslip = PayslipSummary & {
  company: { name: string; legalName: string; address: string | null; ntn: string | null };
  employeeInfo: { designation: string | null; department: string | null; grade: string | null; branch: string | null; cnic: string | null; joiningDate: string | null; eobiNo: string | null; taxStatus: string | null };
  days: { daysInMonth: number; paidDays: number; lwpDays: number; leaveTakenDays: number; overtimeHours: number };
  earnings: RunLineComponent[]; deductions: RunLineComponent[]; employer: RunLineComponent[];
  amountInWords: string; ytd: PayslipYtd;
  tax: { taxYear: string; projectedAnnualSalary: number | null; annualExemptAmount: number | null; annualTaxableIncome: number | null; annualTaxLiability: number | null; monthly: number; slab: string | null };
  payment: { payMode: string; bankName: string | null; ibanMasked: string | null; paymentRef: string | null; paidAt: string | null; loanOutstanding: number; pfBalance: number };
  generatedAt: string;
};
/** My Profile › Payslips: the published payslips (newest first) and the year to date. */
export type MyPayslips = { items: PayslipSummary[]; ytd: PayslipYtd | null; employee: EmpRef | null };

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const hundreds = (n: number) => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r]! : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ''}`;
  return [h ? `${ONES[h]} Hundred` : '', rest].filter(Boolean).join(h && r ? ' and ' : ' ');
};
/** "Rupees One Hundred Fifty-Nine Thousand Eight Hundred and Five Only" (international scale, paisa dropped). */
export function amountInWords(amount: number): string {
  let n = Math.floor(Math.abs(amount));
  if (n === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  for (const [size, name] of [[1_000_000_000, 'Billion'], [1_000_000, 'Million'], [1_000, 'Thousand']] as const) {
    if (n >= size) { parts.push(`${hundreds(Math.floor(n / size))} ${name}`); n %= size; }
  }
  if (n) parts.push(hundreds(n));
  return `Rupees ${parts.join(' ')} Only`;
}
