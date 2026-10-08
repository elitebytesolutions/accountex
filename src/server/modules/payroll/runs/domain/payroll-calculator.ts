import { payrollAnnualTax, computeLines, type PayrollTaxComputation } from '../../../../../shared/index.js';

/**
 * PayrollCalculator: one employee's pay for one run, from facts the application gathered. Pure (no I/O); the
 * database stores the result and calculates nothing.
 *
 * 1. Structure lines (grade + add-on) at the full month with Phase 12's computeLines (basic, fixed, % of a component /
 *    gross / EOBI wage ceiling, formulas); system and monthly-input lines come from elsewhere.
 * 2. Paid days = days in month − unpaid days (absent, half days, leave without pay from the attendance register, and
 *    approved unpaid leave without register rows) − days before joining / after exit. Every component with
 *    "prorate on paid days" is multiplied by paid days ÷ days in month.
 * 3. Statutory switches of the employee (EOBI, social security, provident fund) drop those components when off.
 * 4. Run adjustments (approved overtime, arrears, bonuses, one-time deductions) are added as they are.
 * 5. Income tax u/s 149 on projected annual taxable income = taxable earnings this year so far + this month's
 *    recurring taxable earnings × months left − Zakat; slab tax less credits (VPS, donations, health insurance at
 *    the average rate); this month = (annual liability − tax already deducted this year) ÷ months left, plus the full
 *    extra tax caused by this month's one-time taxable earnings.
 * 6. Loan / advance installments due by this month, unless they would leave the net pay negative.
 *    Off-cycle and bonus runs pay only their adjustments, taxed at the extra tax they cause on top of the projection.
 * 7. Flags: pro-rata, variance above 15% vs the previous net, missing IBAN, negative-net risk, missing punch, notice,
 *    exit in period.
 */
export type CalcComponent = {
  id: string; code: string; name: string; componentType: string; calcMethod: string; baseBasis: string | null; baseComponentId: string | null;
  percent: number | null; fixedAmount: number | null; wageCeiling: number | null; formula: string | null; calcDescription: string | null;
  systemRole: string | null; prorateOnPaidDays: boolean; showOnPayslip: boolean; taxTreatment: string | null;
  exemptLimitPercentOfBasic: number | null; exemptLimitAnnualAmount: number | null; sortOrder: number;
};
export type CalcStructureLine = { componentId: string; calcMethod: string | null; percent: number | null; fixedAmount: number | null; quantity: number | null; formula: string | null; displayText: string | null };
export type CalcSlab = { id: string; incomeFrom: number; incomeTo: number | null; fixedTax: number; ratePercent: number };
export type CalcInput = {
  basicAmount: number;
  structureLines: CalcStructureLine[];
  daysInMonth: number;
  /** Absent / half-day / unpaid leave days (fractions allowed). */
  unpaidDays: number;
  /** Days of the period before joining or after exit. */
  outsideDays: number;
  paidLeaveDays: number;
  missingPunches: number;
  statutory: { eobi: boolean; pessi: boolean; pf: boolean };
  adjustments: { id: string; componentId: string; amount: number; quantity: number | null; isTaxable: boolean; inputSource: string; remarks: string | null }[];
  loans: { loanId: string; loanType: string; docNo: string; amount: number; label: string }[];
  tax: { slabs: CalcSlab[]; monthsLeft: number; ytdGross: number; ytdTaxable: number; ytdTax: number; declarations: { ZAKAT: number; VPS_PENSION: number; DONATION: number; HEALTH_INSURANCE: number } };
  prevNet: number | null;
  payMode: string;
  hasIban: boolean;
  onNotice: boolean;
  exitInPeriod: boolean;
  isNewJoiner: boolean;
  /** Off-cycle and bonus runs pay only their adjustments: the structure is used for the tax projection only. */
  payRecurring?: boolean;
};
export type CalcComponentRow = {
  componentId: string; componentType: string; label: string; basisText: string | null; quantity: number | null; rate: number | null; amount: number;
  isTaxable: boolean; exemptAmount: number; loanId: string | null; payrollInputId: string | null; showOnPayslip: boolean; sortOrder: number;
};
export type CalcResult = {
  paidDays: number; lwpDays: number; leaveTakenDays: number; overtimeHours: number; basicAmount: number; allowanceAmount: number; grossAmount: number;
  taxAmount: number; eobiAmount: number; pfAmount: number; loanAmount: number; otherDeductionAmount: number; deductionAmount: number; netAmount: number;
  employerEobiAmount: number; employerPessiAmount: number; employerPfAmount: number; gratuityProvisionAmount: number;
  projectedAnnualSalary: number; annualExemptAmount: number; annualTaxableIncome: number; annualTaxLiability: number; taxSlabId: string | null;
  prevNetAmount: number | null; variancePct: number | null; flags: string[]; components: CalcComponentRow[]; tax: PayrollTaxComputation; skippedLoans: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const STATUTORY: Record<string, keyof CalcInput['statutory']> = {
  EOBI_EMPLOYEE: 'eobi', EOBI_EMPLOYER: 'eobi', PESSI_EMPLOYER: 'pessi', PF_EMPLOYEE: 'pf', PF_EMPLOYER: 'pf',
};

export class SetupMissing extends Error {}

export function calculatePay(input: CalcInput, components: CalcComponent[]): CalcResult {
  const byId = new Map(components.map((c) => [c.id, c]));
  const taxComp = components.find((c) => c.systemRole === 'INCOME_TAX');
  if (!taxComp) throw new SetupMissing('No salary component has the Income tax system role');

  const unpaid = Math.min(input.daysInMonth, Math.max(0, input.unpaidDays));
  const outside = Math.min(input.daysInMonth - unpaid, Math.max(0, input.outsideDays));
  const paidDays = r2(input.daysInMonth - unpaid - outside);
  const fraction = input.daysInMonth ? paidDays / input.daysInMonth : 0;

  // 1–3: structure lines, prorated, statutory switches applied
  const full = computeLines(input.structureLines, components, input.basicAmount);
  const rows: CalcComponentRow[] = [];
  const merged = new Map<string, CalcComponentRow>();
  for (const l of full.lines) {
    const c = byId.get(l.componentId)!;
    if (l.monthly === null || l.monthly <= 0) continue;
    const sw = c.systemRole ? STATUTORY[c.systemRole] : undefined;
    if (sw && !input.statutory[sw]) continue;
    const amount = r2(c.prorateOnPaidDays ? l.monthly * fraction : l.monthly);
    if (amount <= 0) continue;
    const prior = merged.get(c.id);
    if (prior) { prior.amount = r2(prior.amount + amount); continue; }
    const row: CalcComponentRow = {
      componentId: c.id, componentType: c.componentType, label: c.name,
      basisText: c.prorateOnPaidDays && fraction < 1 ? `${l.basis} · ${paidDays}/${input.daysInMonth} days` : l.basis,
      quantity: c.prorateOnPaidDays && fraction < 1 ? paidDays : null, rate: c.prorateOnPaidDays && fraction < 1 ? r2(l.monthly / input.daysInMonth) : null,
      amount, isTaxable: false, exemptAmount: 0, loanId: null, payrollInputId: null, showOnPayslip: c.showOnPayslip, sortOrder: c.sortOrder,
    };
    merged.set(c.id, row);
    rows.push(row);
  }
  const recurring = input.payRecurring !== false;
  const basic = rows.find((r) => byId.get(r.componentId)?.systemRole === 'BASIC')?.amount ?? 0;

  // taxable / exempt part of each recurring earning
  let recurringGross = 0;
  let recurringTaxable = 0;
  for (const r of rows) {
    if (r.componentType !== 'EARNING') continue;
    const c = byId.get(r.componentId)!;
    let exempt = 0;
    if (c.taxTreatment === 'EXEMPT') exempt = r.amount;
    else if (c.taxTreatment === 'EXEMPT_UPTO_LIMIT') {
      const limit = c.exemptLimitPercentOfBasic != null ? (basic * c.exemptLimitPercentOfBasic) / 100 : (c.exemptLimitAnnualAmount ?? 0) / 12;
      exempt = r2(Math.min(r.amount, limit));
    }
    r.isTaxable = exempt < r.amount;
    r.exemptAmount = exempt;
    recurringGross += r.amount;
    recurringTaxable += r.amount - exempt;
  }

  if (!recurring) rows.length = 0;

  // 4: adjustments
  let oneTimeGross = 0;
  let oneTimeTaxable = 0;
  let overtimeHours = 0;
  let order = 500;
  for (const a of input.adjustments) {
    const c = byId.get(a.componentId);
    if (!c || (c.componentType !== 'EARNING' && c.componentType !== 'DEDUCTION')) continue;
    const isEarning = c.componentType === 'EARNING';
    rows.push({
      componentId: c.id, componentType: c.componentType, label: a.remarks ? `${c.name} · ${a.remarks}` : c.name,
      basisText: a.inputSource === 'OVERTIME' && a.quantity ? `${a.quantity} h approved overtime` : a.inputSource === 'MANUAL' ? 'One-time adjustment' : a.inputSource.replace(/_/g, ' ').toLowerCase(),
      quantity: a.quantity, rate: a.quantity ? r2(a.amount / a.quantity) : null, amount: r2(a.amount), isTaxable: isEarning && a.isTaxable,
      exemptAmount: isEarning && !a.isTaxable ? r2(a.amount) : 0, loanId: null, payrollInputId: a.id, showOnPayslip: true, sortOrder: order++,
    });
    if (isEarning) {
      oneTimeGross += a.amount;
      if (a.isTaxable) oneTimeTaxable += a.amount;
    }
    if (a.inputSource === 'OVERTIME') overtimeHours += a.quantity ?? 0;
  }

  // 5: income tax u/s 149
  const months = Math.max(1, input.tax.monthsLeft);
  const projectedRegular = input.tax.ytdTaxable + recurringTaxable * months;
  const decl = input.tax.declarations;
  const base = payrollAnnualTax(projectedRegular, input.tax.slabs, decl);
  const withOneTime = payrollAnnualTax(projectedRegular + oneTimeTaxable, input.tax.slabs, decl);
  const regularMonthly = recurring ? Math.max(0, Math.round((base.liability - input.tax.ytdTax) / months)) : 0;
  const oneTimeTax = Math.max(0, withOneTime.liability - base.liability);
  const taxAmount = regularMonthly + oneTimeTax;
  if (taxAmount > 0) {
    rows.push({
      componentId: taxComp.id, componentType: 'DEDUCTION', label: taxComp.name,
      basisText: `${withOneTime.slab ? `Slab ${withOneTime.slab.ratePercent}%` : 'Slabs'} on Rs ${withOneTime.taxableIncome.toLocaleString('en-US')} projected`,
      quantity: null, rate: null, amount: taxAmount, isTaxable: false, exemptAmount: 0, loanId: null, payrollInputId: null, showOnPayslip: taxComp.showOnPayslip, sortOrder: taxComp.sortOrder,
    });
  }

  const grossAmount = r2(rows.filter((r) => r.componentType === 'EARNING').reduce((s, r) => s + r.amount, 0));

  // 6: loans, unless they would leave the net negative
  const dedSoFar = r2(rows.filter((r) => r.componentType === 'DEDUCTION').reduce((s, r) => s + r.amount, 0));
  const loanTotal = r2(input.loans.reduce((s, l) => s + l.amount, 0));
  const flags = new Set<string>();
  let skippedLoans = false;
  if (loanTotal > 0) {
    if (grossAmount - dedSoFar - loanTotal < 0) { skippedLoans = true; flags.add('NEGATIVE_NET_RISK'); }
    else {
      if (loanTotal > grossAmount * 0.5) flags.add('NEGATIVE_NET_RISK');
      for (const l of input.loans) {
        const c = components.find((x) => x.systemRole === (l.loanType === 'SALARY_ADVANCE' ? 'ADVANCE' : 'LOAN')) ?? components.find((x) => x.systemRole === 'LOAN');
        if (!c) throw new SetupMissing('No salary component has the Loan system role');
        rows.push({
          componentId: c.id, componentType: 'DEDUCTION', label: l.label, basisText: l.docNo, quantity: null, rate: null, amount: r2(l.amount),
          isTaxable: false, exemptAmount: 0, loanId: l.loanId, payrollInputId: null, showOnPayslip: true, sortOrder: c.sortOrder,
        });
      }
    }
  }

  const sum = (pred: (r: CalcComponentRow, c: CalcComponent) => boolean) => r2(rows.filter((r) => pred(r, byId.get(r.componentId)!)).reduce((s, r) => s + r.amount, 0));
  const deductionAmount = sum((r) => r.componentType === 'DEDUCTION');
  const eobiAmount = sum((r, c) => r.componentType === 'DEDUCTION' && c.systemRole === 'EOBI_EMPLOYEE');
  const pfAmount = sum((r, c) => r.componentType === 'DEDUCTION' && c.systemRole === 'PF_EMPLOYEE');
  const loanAmount = sum((r) => r.componentType === 'DEDUCTION' && r.loanId !== null);
  const otherDeductionAmount = r2(deductionAmount - taxAmount - eobiAmount - pfAmount - loanAmount);
  const netAmount = r2(grossAmount - deductionAmount);

  // 7: flags
  if (paidDays < input.daysInMonth) flags.add('PRO_RATA');
  if (input.payMode === 'BANK_TRANSFER' && !input.hasIban) flags.add('MISSING_IBAN');
  if (netAmount < 0) flags.add('NEGATIVE_NET_RISK');
  if (input.missingPunches > 0) flags.add('MISSING_PUNCH');
  if (input.onNotice) flags.add('ON_NOTICE');
  if (input.exitInPeriod) flags.add('EXIT_IN_PERIOD');
  const variancePct = input.prevNet && input.prevNet > 0 ? Math.round(((netAmount - input.prevNet) / input.prevNet) * 10000) / 100 : null;
  if (variancePct !== null && Math.abs(variancePct) > 15) flags.add('VARIANCE_ABOVE_15');

  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  const recurringExempt = r2(recurringGross - recurringTaxable);
  const slabRow = input.tax.slabs.find((s) => withOneTime.taxableIncome >= s.incomeFrom && (s.incomeTo === null || withOneTime.taxableIncome < s.incomeTo));
  return {
    paidDays, lwpDays: r2(unpaid), leaveTakenDays: r2(input.paidLeaveDays), overtimeHours: r2(overtimeHours), basicAmount: recurring ? basic : 0,
    allowanceAmount: r2(grossAmount - (recurring ? basic : 0)), grossAmount, taxAmount, eobiAmount, pfAmount, loanAmount, otherDeductionAmount, deductionAmount, netAmount,
    employerEobiAmount: sum((r, c) => c.systemRole === 'EOBI_EMPLOYER'), employerPessiAmount: sum((r, c) => c.systemRole === 'PESSI_EMPLOYER'),
    employerPfAmount: sum((r, c) => c.systemRole === 'PF_EMPLOYER'), gratuityProvisionAmount: sum((r, c) => c.systemRole === 'GRATUITY'),
    projectedAnnualSalary: r2(input.tax.ytdGross + recurringGross * months + oneTimeGross),
    annualExemptAmount: r2(input.tax.ytdGross - input.tax.ytdTaxable + recurringExempt * months + (oneTimeGross - oneTimeTaxable)),
    annualTaxableIncome: withOneTime.taxableIncome, annualTaxLiability: withOneTime.liability, taxSlabId: slabRow?.id ?? null,
    prevNetAmount: input.prevNet, variancePct, flags: [...flags], components: rows, tax: withOneTime, skippedLoans,
  };
}
