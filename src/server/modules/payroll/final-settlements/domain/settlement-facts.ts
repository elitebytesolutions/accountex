import { computeLines } from '../../../../../shared/index.js';
import { calculatePay, type CalcComponent, type CalcStructureLine } from '../../runs/domain/payroll-calculator.js';

/** The salary facts finalSettlementCalculate needs from the app (structure formulas are evaluated here, not in SQL). */
export type SettlementSalaryFacts = {
  basicAmount: number; grossAmount: number; gratuityBaseAmount: number; basicComponentId: string | null; eobiComponentId: string | null;
  pending: { month: string; days: number; daysInMonth: number; grossAmount: number; taxableAmount: number; eobiAmount: number } | null;
};

const daysIn = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Days of the exit month in employment: from the 1st (or the joining day, if later) to the last working day. */
export function settlementDaysWorked(joiningDate: string, lastWorkingDay: string) {
  const first = joiningDate.slice(0, 7) === lastWorkingDay.slice(0, 7) ? Number(joiningDate.slice(8, 10)) : 1;
  return { days: Math.max(0, Number(lastWorkingDay.slice(8, 10)) - first + 1), daysInMonth: daysIn(lastWorkingDay) };
}

/** "3 yrs 6 mths 20 days" from the service months / days the calculation reported. */
export function settlementServiceLabel(joiningDate: string, lastWorkingDay: string) {
  const a = new Date(`${joiningDate}T00:00:00Z`);
  const b = new Date(`${lastWorkingDay}T00:00:00Z`);
  b.setUTCDate(b.getUTCDate() + 1);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  let days = b.getUTCDate() - a.getUTCDate();
  if (days < 0) { months -= 1; days += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); }
  const y = Math.floor(months / 12), m = months % 12;
  return [y && `${y} yr${y === 1 ? '' : 's'}`, m && `${m} mth${m === 1 ? '' : 's'}`, days && `${days} day${days === 1 ? '' : 's'}`].filter(Boolean).join(' ') || '0 days';
}

/**
 * The last salary at full month (Phase 12 computeLines: gross, gratuity base = earnings flagged "include in gratuity
 * base") and the exit month's pending pay through the Phase 32 calculator (prorated earnings, their taxable part, EOBI).
 * Tax is left to the database (final-month rule on the whole settlement).
 */
export function settlementSalaryFacts(input: {
  basicAmount: number; structureLines: CalcStructureLine[]; components: (CalcComponent & { includeInGratuityBase: boolean })[];
  statutory: { eobi: boolean; pessi: boolean; pf: boolean }; joiningDate: string; lastWorkingDay: string;
}): SettlementSalaryFacts {
  const comps = input.components;
  const byId = new Map(comps.map((c) => [c.id, c]));
  const full = computeLines(input.structureLines, comps, input.basicAmount);
  const gratuityBase = r2(full.lines.filter((l) => byId.get(l.componentId)?.componentType === 'EARNING' && byId.get(l.componentId)?.includeInGratuityBase).reduce((s, l) => s + (l.monthly ?? 0), 0));
  const basicC = comps.find((c) => c.systemRole === 'BASIC')?.id ?? null;
  const eobiC = comps.find((c) => c.systemRole === 'EOBI_EMPLOYEE')?.id ?? null;
  const { days, daysInMonth } = settlementDaysWorked(input.joiningDate, input.lastWorkingDay);
  let pending: SettlementSalaryFacts['pending'] = null;
  if (days > 0 && comps.some((c) => c.systemRole === 'INCOME_TAX')) {
    const pay = calculatePay({
      basicAmount: input.basicAmount, structureLines: input.structureLines, daysInMonth, unpaidDays: 0, outsideDays: daysInMonth - days, paidLeaveDays: 0, missingPunches: 0,
      statutory: input.statutory, adjustments: [], loans: [], tax: { slabs: [], monthsLeft: 1, ytdGross: 0, ytdTaxable: 0, ytdTax: 0, declarations: { ZAKAT: 0, VPS_PENSION: 0, DONATION: 0, HEALTH_INSURANCE: 0 } },
      prevNet: null, payMode: 'BANK_TRANSFER', hasIban: true, onNotice: false, exitInPeriod: true, isNewJoiner: false,
    }, comps);
    const earnings = pay.components.filter((c) => c.componentType === 'EARNING');
    pending = {
      month: input.lastWorkingDay.slice(0, 7), days, daysInMonth, grossAmount: pay.grossAmount,
      taxableAmount: r2(earnings.reduce((s, c) => s + c.amount - c.exemptAmount, 0)), eobiAmount: pay.eobiAmount,
    };
  }
  return { basicAmount: r2(input.basicAmount), grossAmount: full.gross, gratuityBaseAmount: gratuityBase || r2(input.basicAmount), basicComponentId: basicC, eobiComponentId: eobiC, pending };
}
