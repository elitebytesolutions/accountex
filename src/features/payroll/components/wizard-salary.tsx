"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { computeLines, taxOn, type ComputedLine, type PayGroup, type SalaryComponent, type SalaryStructure, type TaxYear } from "@/shared";
import { Field, FormGrid } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { listComponents, listPayGroups, listStructures, listTaxYears } from "../api";

export type PayrollData = { structures: SalaryStructure[]; components: SalaryComponent[]; groups: PayGroup[]; years: TaxYear[] };
export type WizardSalaryValue = { structureId: string; basicAmount: string; payGroupId: string };
export type SalarySummary = { structure: SalaryStructure | null; lines: ComputedLine[]; gross: number | null; taxable: number | null; taxMonthly: number | null; taxYear: string | null };
const rs = (n: number | null) => (n === null ? "varies" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const taxYearOf = (iso: string) => { const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7)); const s = m >= 7 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };

/** Structures, components, pay groups and tax slabs for the wizard's salary step (loaded only when the user may set salaries). */
export function usePayrollData(enabled: boolean): PayrollData | null {
  const [data, setData] = useState<PayrollData | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([listStructures(), listComponents(), listPayGroups(), listTaxYears()])
      .then(([structures, components, groups, years]) => !cancelled && setData({ structures, components, groups, years }))
      .catch(() => !cancelled && setData({ structures: [], components: [], groups: [], years: [] }));
    return () => { cancelled = true; };
  }, [enabled]);
  return data;
}

/** The chosen (or the grade's) active structure, its lines and gross at this basic, and the income-tax estimate. */
export function salarySummary(data: PayrollData | null, value: WizardSalaryValue, gradeId: string, joiningDate: string): SalarySummary {
  const empty = { structure: null, lines: [], gross: null, taxable: null, taxMonthly: null, taxYear: null };
  if (!data) return empty;
  const grades = data.structures.filter((s) => s.structureKind === "GRADE" && s.status === "ACTIVE");
  const s = grades.find((x) => x.id === (value.structureId || grades.find((g) => g.grade?.id === gradeId)?.id)) ?? null;
  const basic = Number(value.basicAmount || 0);
  if (!s || basic <= 0) return { ...empty, structure: s };
  const comps = data.components.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null }));
  const calc = computeLines(s.lines.map((l) => ({ componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText })), comps, basic);
  const taxable = calc.lines.filter((l) => l.componentType === "EARNING").reduce((sum, l) => {
    const c = data.components.find((x) => x.id === l.componentId);
    if (!c || l.monthly === null || c.taxTreatment === "EXEMPT") return sum;
    const exempt = c.taxTreatment === "EXEMPT_UPTO_LIMIT" ? Math.min(l.monthly, c.exemptLimitPercentOfBasic !== null ? (basic * c.exemptLimitPercentOfBasic) / 100 : (c.exemptLimitAnnualAmount ?? 0) / 12) : 0;
    return sum + l.monthly - exempt;
  }, 0) * 12;
  const year = taxYearOf(joiningDate || new Date().toISOString().slice(0, 10));
  const slabs = data.years.find((y) => y.taxYear === year)?.slabs;
  return { structure: s, lines: calc.lines, gross: calc.gross, taxable, taxMonthly: slabs ? Math.round(taxOn(taxable, slabs) / 12) : null, taxYear: slabs ? year : null };
}

/** Template step 3 "Salary structure" of the add-employee wizard: structure (pre-selected from the grade), basic, pay group, computed lines. */
export function WizardSalary({ data, summary, value, onChange }: { data: PayrollData | null; summary: SalarySummary; value: WizardSalaryValue; onChange: (v: WizardSalaryValue) => void }) {
  if (!data) return <Skeleton style={{ height: 220 }} />;
  const grades = data.structures.filter((s) => s.structureKind === "GRADE" && s.status === "ACTIVE");
  if (!grades.length) return <div className="panel"><EmptyState icon={<Layers />} title="No active salary structure" description={<>Create one on <Link className="link" href="/hr/payroll/structures">Salary Structures</Link>, or add the salary on the profile later.</>} /></div>;
  const s = summary.structure;
  return (
    <>
      <FormGrid>
        <Field label="Structure template"><select value={s?.id ?? ""} onChange={(e) => onChange({ ...value, structureId: e.target.value })}><option value="">No salary yet</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}</select></Field>
        <Field label="Basic monthly (Rs)" required={!!s} hint={s?.basicMin != null ? `Band Rs ${s.basicMin.toLocaleString("en-US")} – ${s.basicMax?.toLocaleString("en-US") ?? "…"}` : undefined}>
          <input inputMode="numeric" value={value.basicAmount} disabled={!s} onChange={(e) => onChange({ ...value, structureId: s?.id ?? "", basicAmount: e.target.value.replace(/[^\d.]/g, "") })} />
        </Field>
        <Field label="Pay group"><select value={value.payGroupId} disabled={!s} onChange={(e) => onChange({ ...value, structureId: s?.id ?? "", payGroupId: e.target.value })}><option value="">—</option>{data.groups.filter((g) => g.status === "ACTIVE").map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      </FormGrid>
      {summary.gross !== null && (
        <div className="table-wrap mt"><table className="tbl lines">
          <thead><tr><th>Component</th><th>Basis</th><th className="num">Monthly (Rs)</th></tr></thead>
          <tbody>
            {summary.lines.filter((l) => l.componentType === "EARNING").map((l) => <tr key={l.componentId}><td>{l.name}</td><td>{l.basis}</td><td className="num">{rs(l.monthly)}</td></tr>)}
            <tr className="total"><td colSpan={2}>Gross</td><td className="num">{rs(summary.gross)}</td></tr>
          </tbody>
        </table></div>
      )}
    </>
  );
}
