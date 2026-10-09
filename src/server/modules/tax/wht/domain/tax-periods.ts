/**
 * Tax calendar (Pakistan): the fiscal year runs July–June; WHT is deposited by the 15th of the next month, quarterly
 * statements u/s 165 are due on the 20th after the quarter, the annual salary statement u/s 149 by 31 August and the
 * annual u/s 165 statement by 30 September; sales tax returns are due on the 18th of the next month.
 */
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const parts = (date: string) => date.split('-').map(Number) as [number, number, number];

export const monthStart = (date: string) => {
  const [y, m] = parts(date);
  return iso(y, m, 1);
};
export const monthEnd = (date: string) => {
  const [y, m] = parts(date);
  return iso(y, m + 1, 0);
};
/** The 15th of the month after `period` (WHT deposit). */
export const whtDueDate = (period: string) => {
  const [y, m] = parts(period);
  return iso(y, m + 1, 15);
};

/** Fiscal year (July–June) containing `date`: start year, start, end, label "FY 2026-27". */
export function fiscalYear(date: string) {
  const [y, m] = parts(date);
  const start = m >= 7 ? y : y - 1;
  return { from: iso(start, 7, 1), to: iso(start + 1, 6, 30), label: `FY ${start}-${String(start + 1).slice(2)}` };
}

/** Fiscal quarter containing `date` (Q1 = Jul–Sep). */
export function fiscalQuarter(date: string) {
  const [y, m] = parts(date);
  const q = Math.floor(((m + 5) % 12) / 3) + 1;
  const startMonth = ((q - 1) * 3 + 6) % 12 + 1;
  const startYear = startMonth >= 7 ? (m >= 7 ? y : y - 1) : (m >= 7 ? y + 1 : y);
  const from = iso(startYear, startMonth, 1);
  const to = iso(startYear, startMonth + 3, 0);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    q, from, to,
    label: `Q${q} ${fiscalYear(date).label}`,
    span: `${months[startMonth - 1]}–${months[(startMonth + 1) % 12]} ${startYear + (startMonth + 2 > 12 ? 1 : 0)}`,
    dueDate: iso(startYear, startMonth + 3, 20),
  };
}

/** Period, label and due date of a WHT statement of a type for the quarter / fiscal year containing `date`. */
export function statementPeriod(returnType: 'QUARTERLY_165' | 'ANNUAL_149' | 'ANNUAL_165', date: string) {
  if (returnType === 'QUARTERLY_165') {
    const q = fiscalQuarter(date);
    return { from: q.from, to: q.to, label: q.label, dueDate: q.dueDate };
  }
  const fy = fiscalYear(date);
  const endYear = Number(fy.to.slice(0, 4));
  return returnType === 'ANNUAL_149'
    ? { from: fy.from, to: fy.to, label: `Annual statement u/s 149 · ${fy.label}`, dueDate: iso(endYear, 8, 31) }
    : { from: fy.from, to: fy.to, label: `Annual statement u/s 165 · ${fy.label}`, dueDate: iso(endYear, 9, 30) };
}
