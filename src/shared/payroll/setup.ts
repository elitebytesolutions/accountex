import { z } from 'zod';
import { patchFields, RowVersionSchema } from '../common/list-query.ts';
import { optionalText } from '../treasury/common.ts';

const optionalId = z.uuid().optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalCode = z.string().trim().max(30).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const optionalNum = (min: number, max: number, msg = `${min} to ${max}`) => z.coerce.number(msg).min(min, msg).max(max, msg).optional().nullable().or(z.literal('')).transform((v) => (v === '' || v === undefined ? null : v));
const money = (msg = 'Not negative') => z.coerce.number(msg).min(0, msg).max(100_000_000_000);
type Ref = { id: string; code: string; name: string };
const issues = (fn: (x: never) => Record<string, string>) => (x: unknown, ctx: z.RefinementCtx) => {
  for (const [path, message] of Object.entries(fn(x as never))) ctx.addIssue({ code: 'custom', path: path.split('.'), message });
};

// ---------------------------------------------------------------- formulas
/** Component codes a formula refers to (upper-case words that are not functions). */
export function formulaRefs(formula: string | null | undefined): string[] {
  if (!formula) return [];
  return [...new Set([...formula.matchAll(/\b[A-Z][A-Z0-9_]*\b(?!\s*\()/g)].map((m) => m[0]))];
}
/** Evaluates + − × ÷, parentheses, numbers, ROUND(x[, n]), MIN, MAX and variables. Returns null when a variable is unknown or the text is invalid. */
export function evalFormula(formula: string, vars: Record<string, number | null | undefined>): number | null {
  const t = formula.match(/\d+(\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/(),]/g) ?? [];
  if (t.join('') !== formula.replace(/\s+/g, '')) return null;
  let i = 0;
  const fail = Symbol('fail');
  const expr = (): number => { let v = term(); while (t[i] === '+' || t[i] === '-') { const op = t[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const term = (): number => { let v = unary(); while (t[i] === '*' || t[i] === '/') { const op = t[i++]; const r = unary(); if (op === '/' && r === 0) throw fail; v = op === '*' ? v * r : v / r; } return v; };
  const unary = (): number => (t[i] === '-' ? (i++, -unary()) : atom());
  const atom = (): number => {
    const x = t[i++];
    if (x === undefined) throw fail;
    if (x === '(') { const v = expr(); if (t[i++] !== ')') throw fail; return v; }
    if (/^\d/.test(x)) return Number(x);
    if (t[i] === '(') {
      i++;
      const args = [expr()];
      while (t[i] === ',') { i++; args.push(expr()); }
      if (t[i++] !== ')') throw fail;
      const f = x.toUpperCase();
      if (f === 'ROUND') { const p = 10 ** (args[1] ?? 0); return Math.round(args[0]! * p) / p; }
      if (f === 'MIN') return Math.min(...args);
      if (f === 'MAX') return Math.max(...args);
      throw fail;
    }
    const v = vars[x];
    if (v === null || v === undefined) throw fail;
    return v;
  };
  try { const v = expr(); return i === t.length && Number.isFinite(v) ? v : null; } catch { return null; }
}
/** Does `id` depend on itself through percent-of bases and formula references? `deps` maps a component to the components it reads. */
export function dependsOnItself(deps: Map<string, string[]>, id: string): boolean {
  const seen = new Set<string>();
  const walk = (x: string): boolean => (deps.get(x) ?? []).some((d) => d === id || (!seen.has(d) && (seen.add(d), walk(d))));
  return walk(id);
}

// ---------------------------------------------------------------- components
export type SalaryComponent = {
  id: string; code: string; name: string; componentType: string; calcMethod: string; baseBasis: string | null; baseComponent: Ref | null;
  percent: number | null; fixedAmount: number | null; wageCeiling: number | null; formula: string | null; calcDescription: string | null;
  debitAccount: Ref | null; creditAccount: Ref | null; taxTreatment: string | null; exemptLimitPercentOfBasic: number | null; exemptLimitAnnualAmount: number | null;
  prorateOnPaidDays: boolean; showOnPayslip: boolean; includeInGratuityBase: boolean; includeInEobiWage: boolean; systemRole: string | null;
  sortOrder: number; status: string; structures: number; rowVersion: number;
};
const ComponentFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Like HRA (2–10 letters or digits)'),
  name: z.string().trim().min(2, 'Name the component').max(80),
  componentType: z.string().trim().min(1).max(30),
  calcMethod: z.string().trim().min(1).max(30),
  baseBasis: optionalCode,
  baseComponentId: optionalId,
  percent: optionalNum(0, 1000),
  fixedAmount: optionalNum(0, 100_000_000),
  wageCeiling: optionalNum(1, 100_000_000, 'More than 0'),
  formula: z.string().trim().max(300).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  calcDescription: optionalText(120),
  debitAccountId: optionalId,
  creditAccountId: optionalId,
  taxTreatment: optionalCode,
  exemptLimitPercentOfBasic: optionalNum(0.01, 100, 'More than 0'),
  exemptLimitAnnualAmount: optionalNum(1, 100_000_000, 'More than 0'),
  prorateOnPaidDays: z.boolean().default(true),
  showOnPayslip: z.boolean().default(true),
  includeInGratuityBase: z.boolean().default(false),
  includeInEobiWage: z.boolean().default(false),
  systemRole: optionalCode,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
};
type ComponentShape = { componentType?: string; calcMethod?: string; baseBasis?: string | null; baseComponentId?: string | null; percent?: number | null; formula?: string | null; debitAccountId?: string | null; creditAccountId?: string | null; taxTreatment?: string | null; exemptLimitPercentOfBasic?: number | null; exemptLimitAnnualAmount?: number | null };
/** The DB checks on SalaryComponents with field messages. */
export function componentErrors(c: ComponentShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.calcMethod === 'PERCENT_OF') {
    if (c.percent == null) e.percent = 'Give the percentage';
    if (!c.baseBasis) e.baseBasis = 'Choose what it is a percentage of';
  }
  if (c.baseBasis === 'COMPONENT' && !c.baseComponentId) e.baseComponentId = 'Choose the component';
  if (c.calcMethod === 'FORMULA' && !c.formula) e.formula = 'Write the formula';
  if (c.componentType === 'EARNING' && !c.debitAccountId) e.debitAccountId = 'An earning needs its expense account';
  if (c.componentType === 'DEDUCTION' && !c.creditAccountId) e.creditAccountId = 'A deduction needs its payable account';
  if (c.componentType === 'EMPLOYER_CONTRIBUTION') {
    if (!c.debitAccountId) e.debitAccountId = 'Choose the expense account';
    if (!c.creditAccountId) e.creditAccountId = 'Choose the payable account';
  }
  if (c.componentType === 'EARNING' && !c.taxTreatment) e.taxTreatment = 'Choose the tax treatment';
  if (c.taxTreatment === 'EXEMPT_UPTO_LIMIT' && c.exemptLimitPercentOfBasic == null && c.exemptLimitAnnualAmount == null) e.exemptLimitPercentOfBasic = 'Give the exempt limit';
  if (c.formula && evalFormula(c.formula, new Proxy({}, { get: () => 1 })) === null) e.formula = 'Use + − × ÷, brackets, numbers, codes and ROUND / MIN / MAX';
  return e;
}
/** Only the fields a component of this type / method keeps (the rest are cleared, as the DB checks expect). */
export function cleanComponent<T extends ComponentShape & { fixedAmount?: number | null; wageCeiling?: number | null }>(c: T): T {
  const x = { ...c };
  if (x.calcMethod !== 'PERCENT_OF') { x.percent = null; x.baseBasis = null; x.baseComponentId = null; x.wageCeiling = null; }
  if (x.baseBasis !== 'COMPONENT') x.baseComponentId = null;
  if (x.calcMethod !== 'FORMULA') x.formula = null;
  if (x.calcMethod !== 'FIXED') x.fixedAmount = null;
  if (x.componentType === 'DEDUCTION') x.debitAccountId = null;
  if (x.componentType === 'EARNING') x.creditAccountId = null;
  if (x.taxTreatment !== 'EXEMPT_UPTO_LIMIT') { x.exemptLimitPercentOfBasic = null; x.exemptLimitAnnualAmount = null; }
  return x;
}
export const ComponentCreateSchema = z.object(ComponentFields).transform(cleanComponent).superRefine(issues(componentErrors));
export type ComponentCreate = z.infer<typeof ComponentCreateSchema>;
export const ComponentUpdateSchema = patchFields(ComponentFields).extend(RowVersionSchema.shape);
export type ComponentUpdate = z.infer<typeof ComponentUpdateSchema>;

// ---------------------------------------------------------------- structures
export type StructureLine = {
  id: string; component: Ref & { componentType: string; calcMethod: string }; calcMethod: string | null; percent: number | null; fixedAmount: number | null;
  quantity: number | null; formula: string | null; displayText: string | null; sortOrder: number;
};
export type CommissionTier = { id: string; achievementFromPct: number; achievementToPct: number | null; commissionRatePct: number };
export type SalaryStructure = {
  id: string; code: string; name: string; structureKind: string; grade: Ref | null; basicMin: number | null; basicMax: number | null; grossMid: number | null;
  commissionCapPercentOfBasic: number | null; description: string | null; effectiveFrom: string; copiedFrom: Ref | null; status: string;
  lines: StructureLine[]; tiers: CommissionTier[]; staff: number; rowVersion: number;
};
export const StructureLineSchema = z.object({
  id: z.uuid().optional(),
  componentId: z.uuid('Choose the component'),
  calcMethod: optionalCode,
  percent: optionalNum(0, 1000),
  fixedAmount: optionalNum(0, 100_000_000),
  quantity: optionalNum(0, 100_000),
  formula: z.string().trim().max(300).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  displayText: optionalText(60),
});
export type StructureLineInput = z.infer<typeof StructureLineSchema>;
export const CommissionTierSchema = z.object({
  id: z.uuid().optional(),
  achievementFromPct: z.coerce.number('0 or more').min(0, '0 or more').max(1000),
  achievementToPct: optionalNum(0, 1000),
  commissionRatePct: z.coerce.number('0 to 100').min(0, '0 to 100').max(100, '0 to 100'),
});
export type CommissionTierInput = z.infer<typeof CommissionTierSchema>;
const StructureFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9-]{0,9}$/, 'Like G2 or S1'),
  name: z.string().trim().min(2, 'Name the structure').max(80),
  structureKind: z.enum(['GRADE', 'ADDON']).default('GRADE'),
  gradeId: optionalId,
  basicMin: optionalNum(0, 100_000_000),
  basicMax: optionalNum(0, 100_000_000),
  commissionCapPercentOfBasic: optionalNum(0.01, 1000, 'More than 0'),
  description: optionalText(200),
  effectiveFrom: z.iso.date('Use a date').optional(),
  lines: z.array(StructureLineSchema).max(60).default([]),
  tiers: z.array(CommissionTierSchema).max(20).default([]),
};
type StructureShape = { structureKind?: string; gradeId?: string | null; basicMin?: number | null; basicMax?: number | null; lines?: StructureLineInput[]; tiers?: CommissionTierInput[] };
export function structureErrors(s: StructureShape): Record<string, string> {
  const e: Record<string, string> = {};
  if (s.structureKind !== 'ADDON' && !s.gradeId) e.gradeId = 'A grade structure needs its grade';
  if (s.basicMin != null && s.basicMax != null && s.basicMax < s.basicMin) e.basicMax = 'At least the minimum';
  const ids = (s.lines ?? []).map((l) => l.componentId);
  ids.forEach((c, i) => { if (ids.indexOf(c) !== i) e[`lines.${i}.componentId`] = 'Already in the structure'; });
  (s.lines ?? []).forEach((l, i) => { if (l.calcMethod === 'FORMULA' && !l.formula) e[`lines.${i}.formula`] = 'Write the formula'; });
  const tiers = [...(s.tiers ?? [])].sort((a, b) => a.achievementFromPct - b.achievementFromPct);
  tiers.forEach((t, i) => {
    if (t.achievementToPct != null && t.achievementToPct <= t.achievementFromPct) e.tiers = 'Each tier must end after it starts';
    const next = tiers[i + 1];
    if (next && (t.achievementToPct == null || t.achievementToPct > next.achievementFromPct)) e.tiers = 'Tiers must not overlap (only the last may be open)';
  });
  return e;
}
export const StructureCreateSchema = z.object(StructureFields).superRefine(issues(structureErrors));
export type StructureCreate = z.infer<typeof StructureCreateSchema>;
export const StructureUpdateSchema = patchFields(StructureFields).extend(RowVersionSchema.shape);
export type StructureUpdate = z.infer<typeof StructureUpdateSchema>;

/** One computed line of a salary: amount null when it varies (monthly input, payroll-run system lines, formulas with run-time inputs). */
export type ComputedLine = { componentId: string; code: string; name: string; componentType: string; basis: string; monthly: number | null };
type CalcComponent = Pick<SalaryComponent, 'id' | 'code' | 'name' | 'componentType' | 'calcMethod' | 'baseBasis' | 'percent' | 'fixedAmount' | 'wageCeiling' | 'formula' | 'calcDescription' | 'systemRole'> & { baseComponentId: string | null };
type CalcLine = { componentId: string; calcMethod: string | null; percent: number | null; fixedAmount: number | null; quantity: number | null; formula: string | null; displayText: string | null };
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * A structure's lines for one basic salary: Basic is the basic; fixed lines use the line (or component) amount; percent-of
 * lines take the base component's amount, the gross, or the EOBI wage ceiling; formulas see the other codes. Lines are
 * resolved in dependency order; gross is the sum of the earnings that resolved.
 */
export function computeLines(lines: CalcLine[], components: CalcComponent[], basic: number): { lines: ComputedLine[]; gross: number } {
  const byId = new Map(components.map((c) => [c.id, c]));
  const amounts = new Map<string, number | null>();
  const pending = lines.filter((l) => byId.has(l.componentId));
  const grossOf = () => r2([...amounts].filter(([id]) => byId.get(id)?.componentType === 'EARNING').reduce((s, [, v]) => s + (v ?? 0), 0));
  const calc = (l: CalcLine, final: boolean): number | null | undefined => {
    const c = byId.get(l.componentId)!;
    if (c.systemRole === 'BASIC') return basic;
    const method = l.calcMethod ?? c.calcMethod;
    if (method === 'FIXED') return (l.fixedAmount ?? c.fixedAmount ?? 0) * (l.quantity ?? 1);
    if (method === 'PERCENT_OF') {
      const pct = (l.percent ?? c.percent ?? 0) / 100;
      if (c.baseBasis === 'COMPONENT') { const b = c.baseComponentId ? amounts.get(c.baseComponentId) : null; return b === undefined ? undefined : b === null ? null : r2(b * pct); }
      if (c.baseBasis === 'EOBI_WAGE') return r2((c.wageCeiling ?? 0) * pct);
      if (c.baseBasis === 'GROSS') { if (!final) return undefined; const g = grossOf(); return c.wageCeiling && g > c.wageCeiling ? 0 : r2(g * pct); }
      return null;
    }
    if (method === 'FORMULA') {
      const f = l.formula ?? c.formula;
      if (!f) return null;
      const vars: Record<string, number | null> = {};
      for (const [id, v] of amounts) vars[byId.get(id)!.code] = v;
      const refs = formulaRefs(f);
      if (refs.some((x) => components.some((k) => k.code === x) && !amounts.has(components.find((k) => k.code === x)!.id))) return final ? null : undefined;
      const v = evalFormula(f, vars);
      return v === null ? null : r2(v * (l.quantity ?? 1));
    }
    return null;
  };
  for (let pass = 0; pass < lines.length + 2 && pending.length; pass++) {
    const final = pass >= lines.length;
    for (const l of [...pending]) {
      const v = calc(l, final);
      if (v !== undefined) { amounts.set(l.componentId, v); pending.splice(pending.indexOf(l), 1); }
    }
  }
  for (const l of pending) amounts.set(l.componentId, null);
  const out = lines.filter((l) => byId.has(l.componentId)).map((l) => {
    const c = byId.get(l.componentId)!;
    const method = l.calcMethod ?? c.calcMethod;
    const basis = l.displayText ?? (c.systemRole === 'BASIC' ? 'Basic' : method === 'PERCENT_OF'
      ? `${fmt(l.percent ?? c.percent ?? 0)}% of ${c.baseBasis === 'COMPONENT' ? byId.get(c.baseComponentId ?? '')?.name ?? 'base' : c.baseBasis === 'EOBI_WAGE' ? `min. wage Rs ${fmt(c.wageCeiling ?? 0)}` : 'gross'}`
      : method === 'FIXED' ? 'Fixed' : c.calcDescription ?? (method === 'FORMULA' ? l.formula ?? c.formula ?? 'Formula' : method === 'MONTHLY_INPUT' ? 'Monthly input' : 'Payroll run'));
    return { componentId: c.id, code: c.code, name: c.name, componentType: c.componentType, basis, monthly: amounts.get(c.id) ?? null };
  });
  return { lines: out, gross: grossOf() };
}

// ---------------------------------------------------------------- pay groups
export type PayGroup = { id: string; code: string; name: string; frequency: string; status: string; employees: number; rowVersion: number };
const PayGroupFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,19}$/, 'Like STAFF (2–20 letters, digits or _)'),
  name: z.string().trim().min(2, 'Name the pay group').max(60),
  frequency: z.string().trim().max(20).default('MONTHLY'),
};
export const PayGroupCreateSchema = z.object(PayGroupFields);
export type PayGroupCreate = z.infer<typeof PayGroupCreateSchema>;
export const PayGroupUpdateSchema = patchFields(PayGroupFields).extend(RowVersionSchema.shape);
export type PayGroupUpdate = z.infer<typeof PayGroupUpdateSchema>;

// ---------------------------------------------------------------- tax slabs
export type TaxSlab = { id: string; slabNo: number; incomeFrom: number; incomeTo: number | null; fixedTax: number; ratePercent: number; rowVersion: number };
export type TaxYear = { taxYear: string; slabs: TaxSlab[] };
export const TAX_YEAR = /^\d{4}-\d{2}$/;
export const TaxSlabInputSchema = z.object({
  id: z.uuid().optional(),
  incomeFrom: money(),
  incomeTo: optionalNum(0, 100_000_000_000),
  fixedTax: money().default(0),
  ratePercent: z.coerce.number('0 to 100').min(0, '0 to 100').max(100, '0 to 100'),
});
export type TaxSlabInput = z.infer<typeof TaxSlabInputSchema>;
/** Slabs in order: start at 0, each starts where the previous ended, only the last is open-ended. */
export function slabErrors(slabs: { incomeFrom: number; incomeTo: number | null }[]): string | null {
  if (!slabs.length) return 'Add at least one slab';
  if (slabs[0]!.incomeFrom !== 0) return 'The first slab starts at 0';
  for (const [i, s] of slabs.entries()) {
    const last = i === slabs.length - 1;
    if (s.incomeTo === null && !last) return 'Only the last slab can be open-ended';
    if (s.incomeTo !== null && s.incomeTo <= s.incomeFrom) return `Slab ${i + 1} must end after it starts`;
    if (!last && slabs[i + 1]!.incomeFrom !== s.incomeTo) return `Slab ${i + 2} must start where slab ${i + 1} ends`;
  }
  return null;
}
/** Contiguity is checked by the service (400 TAX_SLABS_NOT_CONTIGUOUS) with `slabErrors`. */
export const TaxYearSchema = z.object({ slabs: z.array(TaxSlabInputSchema).min(1, 'Add at least one slab').max(30) });
/** Annual tax on a taxable income: the slab's fixed tax plus its rate on the amount above the slab start. */
export function taxOn(annual: number, slabs: { incomeFrom: number; incomeTo: number | null; fixedTax: number; ratePercent: number }[]): number {
  const s = slabs.find((x) => annual >= x.incomeFrom && (x.incomeTo === null || annual < x.incomeTo));
  return s ? Math.round(s.fixedTax + ((annual - s.incomeFrom) * s.ratePercent) / 100) : 0;
}

// ---------------------------------------------------------------- employee salaries
export type EmployeeSalary = {
  id: string; employeeId: string; structure: Ref; addon: Ref | null; payGroup: Ref | null; effectiveFrom: string; effectiveTo: string | null;
  basicAmount: number; grossAmount: number; payMode: string; revisionType: string; revisionReason: string | null;
  approvedBy: { id: string; name: string } | null; approvedAt: string | null; isCurrent: boolean; rowVersion: number;
};
/** The employee's salary history (newest first) and the current salary's lines. */
export type SalaryView = {
  history: EmployeeSalary[];
  current: (EmployeeSalary & { lines: ComputedLine[]; computedGross: number; incomeTaxMonthly: number | null; taxYear: string | null }) | null;
};
export const SalaryInputSchema = z.object({
  structureId: z.uuid('Choose the structure'),
  addonStructureId: optionalId,
  payGroupId: optionalId,
  basicAmount: z.coerce.number('More than 0').positive('More than 0').max(100_000_000),
  grossAmount: optionalNum(0, 100_000_000),
  payMode: z.string().trim().max(20).default('BANK_TRANSFER'),
  revisionType: z.string().trim().max(20).default('JOINING'),
  revisionReason: optionalText(300),
  effectiveFrom: z.iso.date('Use a date'),
});
export type SalaryInput = z.infer<typeof SalaryInputSchema>;
export type PayrollOptions = {
  structures: (Ref & { structureKind: string; status: string; gradeId: string | null; basicMin: number | null; basicMax: number | null })[];
  payGroups: Ref[];
  grades: Ref[];
  accounts: (Ref & { accountClass: string })[];
};
