"use client";

import { Calculator, Copy, Download, Info, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { slabErrors, taxOn, type PayGroup, type PayrollOptions, type SalaryComponent, type SalaryStructure, type TaxYear } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { RecordModal } from "@/features/hr/components/record-modal";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  copyTaxYear, createComponent, createPayGroup, deleteComponent, deletePayGroup, deleteTaxYear, duplicateStructure, listComponents, listPayGroups, listStructures, listTaxYears,
  payrollOptions, saveTaxYear, setComponentActive, setPayGroupActive, updateComponent, updatePayGroup,
  importTaxMasterSlabs,
} from "../api";
import { StructureModal } from "./structure-modal";

type Tab = "comp" | "struct" | "groups" | "tax";
type Can = { edit: boolean };
const rs = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 0 }));
const pct = (n: number | null) => (n === null ? "" : `${Number.isInteger(n) ? n : n.toFixed(2)}%`);
const nextYear = (y: string) => { const s = Number(y.slice(0, 4)) + 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };

/** Calculation text as the template prints it ("45% of Basic", "Fixed — per grade", the description for formulas). */
function calcText(c: SalaryComponent) {
  if (c.calcDescription) return c.calcDescription;
  if (c.calcMethod === "PERCENT_OF") return `${pct(c.percent)} of ${c.baseComponent?.name ?? (c.baseBasis === "GROSS" ? "gross" : c.baseBasis === "EOBI_WAGE" ? "min. wage" : "base")}`;
  if (c.calcMethod === "FIXED") return c.fixedAmount ? `Fixed Rs ${rs(c.fixedAmount)}` : "Fixed — per grade";
  if (c.calcMethod === "FORMULA") return c.formula ?? "Formula";
  return c.calcMethod === "MONTHLY_INPUT" ? "Variable — monthly input" : "Payroll run";
}

/** A structure line as the template's cards print it: "B", "B × 45%", "Rs 6,000", or the component's own text. */
function cardText(l: SalaryStructure["lines"][number], comps: SalaryComponent[]) {
  const c = comps.find((x) => x.id === l.component.id);
  if (!c) return "";
  if (c.systemRole === "BASIC") return "B";
  const method = l.calcMethod ?? c.calcMethod;
  if (method === "PERCENT_OF" && (c.baseComponent ? comps.find((x) => x.id === c.baseComponent!.id)?.systemRole === "BASIC" : false)) return `B × ${pct(l.percent ?? c.percent)}`;
  if (method === "FIXED" && (l.fixedAmount ?? c.fixedAmount) !== null) return `Rs ${rs(l.fixedAmount ?? c.fixedAmount)}`;
  return calcText(c);
}

/** Template app/hr/payroll/structures (51-hr-pay-talent.html): Components · Structures & Grades, plus Pay groups and Tax slabs in the template's style. */
export function PayrollSetupScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(["ComponentType", "SalaryComponentCalcMethod", "BaseBasis", "TaxTreatment", "SystemRole", "SalaryStructureStatus", "PayGroupFrequency"]);
  const [tab, setTab] = useState<Tab>("comp");
  const [comps, setComps] = useState<SalaryComponent[] | null>(null);
  const [structs, setStructs] = useState<SalaryStructure[]>([]);
  const [groups, setGroups] = useState<PayGroup[]>([]);
  const [years, setYears] = useState<TaxYear[]>([]);
  const [opts, setOpts] = useState<PayrollOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [compEdit, setCompEdit] = useState<{ row: SalaryComponent | null } | null>(null);
  const [structEdit, setStructEdit] = useState<{ row: SalaryStructure | null } | null>(null);
  const [dup, setDup] = useState<{ from: string; code: string; name: string } | null>(null);
  const [groupEdit, setGroupEdit] = useState<{ row: PayGroup | null } | null>(null);
  const [year, setYear] = useState("");
  const [slabEdit, setSlabEdit] = useState<{ incomeFrom: string; incomeTo: string; fixedTax: string; ratePercent: string }[] | null>(null);
  const [confirmYear, setConfirmYear] = useState(false);
  const [income, setIncome] = useState("1353600");
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listComponents(), listStructures(), listPayGroups(), listTaxYears(), payrollOptions()])
      .then(([c, s, g, y, o]) => { if (!cancelled) { setComps(c); setStructs(s); setGroups(g); setYears(y); setOpts(o); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load payroll setup" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string, close: () => void) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); close(); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const L = (t: string, c: string | null) => (c ? labelOf(lookups, t, c) : "—");
  const acc = (a: { code: string; name: string } | null) => (a ? `${a.code} ${a.name}` : "");

  // ---------------------------------------------------------------- components
  const openComp = (row: SalaryComponent | null) => {
    setErrs({});
    setCompEdit({ row });
    setF({
      code: row?.code ?? "", name: row?.name ?? "", componentType: row?.componentType ?? "EARNING", calcMethod: row?.calcMethod ?? "PERCENT_OF", percent: row?.percent?.toString() ?? "",
      baseBasis: row?.baseBasis ?? "COMPONENT", baseComponentId: row?.baseComponent?.id ?? comps?.find((c) => c.systemRole === "BASIC")?.id ?? "", fixedAmount: row?.fixedAmount?.toString() ?? "",
      wageCeiling: row?.wageCeiling?.toString() ?? "", formula: row?.formula ?? "", calcDescription: row?.calcDescription ?? "", debitAccountId: row?.debitAccount?.id ?? "", creditAccountId: row?.creditAccount?.id ?? "",
      taxTreatment: row?.taxTreatment ?? (row ? "" : "FULLY_TAXABLE"), exemptLimitPercentOfBasic: row?.exemptLimitPercentOfBasic?.toString() ?? "", exemptLimitAnnualAmount: row?.exemptLimitAnnualAmount?.toString() ?? "",
      prorateOnPaidDays: row?.prorateOnPaidDays ?? true, showOnPayslip: row?.showOnPayslip ?? true, includeInGratuityBase: row?.includeInGratuityBase ?? false, includeInEobiWage: row?.includeInEobiWage ?? false,
      sortOrder: String(row?.sortOrder ?? (comps?.length ?? 0) + 1),
    });
  };
  const saveComp = () => {
    if (!compEdit) return;
    const r = compEdit.row;
    const body = { ...f, systemRole: r?.systemRole ?? null };
    return run(() => (r ? updateComponent(r.id, { ...body, rowVersion: r.rowVersion }) : createComponent(body)), r ? `${f.code} saved` : "Component saved", () => setCompEdit(null));
  };
  const counts = { all: comps?.length ?? 0, EARNING: 0, DEDUCTION: 0, EMPLOYER_CONTRIBUTION: 0 } as Record<string, number>;
  comps?.forEach((c) => { counts[c.componentType] = (counts[c.componentType] ?? 0) + 1; });
  const qq = q.trim().toLowerCase();
  const shown = (comps ?? []).filter((c) => (!type || c.componentType === type) && (!qq || `${c.code} ${c.name}`.toLowerCase().includes(qq)));
  const accounts = (cls: string[]) => opts?.accounts.filter((a) => cls.includes(a.accountClass)) ?? [];

  // ---------------------------------------------------------------- tax slabs
  const cur = years.find((y) => y.taxYear === (year || years[0]?.taxYear)) ?? null;
  const editRows = slabEdit ?? null;
  const slabErr = editRows ? slabErrors(editRows.map((s) => ({ incomeFrom: Number(s.incomeFrom || 0), incomeTo: s.incomeTo === "" ? null : Number(s.incomeTo) }))) : null;

  return (
    <>
      <PageHead eyebrow="Workforce / Payroll / Structures" title="Salary Components & Structures" description="Define earnings, deductions and employer contributions, then combine them into grade-wise salary structures."
        actions={can.edit ? <>
          <button className="btn secondary" type="button" disabled={!structs.length} onClick={() => { const s = structs[0]!; setDup({ from: s.id, code: "", name: `${s.name} (copy)` }); }}><Copy />Duplicate structure</button>
          {tab === "struct" ? <button className="btn primary" type="button" onClick={() => setStructEdit({ row: null })}><Plus />New Structure</button>
            : tab === "groups" ? <button className="btn primary" type="button" onClick={() => { setErrs({}); setF({ code: "", name: "", frequency: "MONTHLY" }); setGroupEdit({ row: null }); }}><Plus />New Pay Group</button>
              : tab === "tax" ? <button className="btn primary" type="button" disabled={!cur} onClick={() => cur && run(() => copyTaxYear(cur.taxYear, nextYear(years[0]!.taxYear)), `Slabs copied to ${nextYear(years[0]!.taxYear)}`, () => setYear(nextYear(years[0]!.taxYear)))}><Copy />Copy to {years[0] ? nextYear(years[0].taxYear) : "next year"}</button>
                : <button className="btn primary" type="button" onClick={() => openComp(null)}><Plus />New Component</button>}
        </> : undefined} />

      <div className="tabs" role="tablist">
        {([["comp", "Components", comps?.length], ["struct", "Structures & Grades", structs.length], ["groups", "Pay groups", groups.length], ["tax", "Tax slabs", years.length]] as const).map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={cn(tab === k && "active")} onClick={() => setTab(k)}>{l} <span className="badge neutral">{n ?? 0}</span></button>
        ))}
      </div>

      {tab === "comp" && (
        <div className="panel flush mb">
          <div className="panel-head"><div><h3>Salary components</h3><p>{counts.all} components · formulas, GL mapping and tax treatment</p></div></div>
          <div className="toolbar">
            <label className="search-field"><Search /><input placeholder="Search components…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <div className="chips">
              {([["", "All", counts.all], ["EARNING", "Earnings", counts.EARNING], ["DEDUCTION", "Deductions", counts.DEDUCTION], ["EMPLOYER_CONTRIBUTION", "Employer", counts.EMPLOYER_CONTRIBUTION]] as const).map(([v, l, n]) => (
                <button key={l} type="button" className={cn(type === v && "active")} onClick={() => setType(v)}>{l} <i>{n ?? 0}</i></button>
              ))}
            </div>
            <span className="spacer" />
            <button className="btn secondary sm" type="button" disabled={!shown.length} onClick={() => downloadCsv("salary-components.csv", [["Code", "Component", "Type", "Calculation", "Taxable", "Debit", "Credit", "Payslip"], ...shown.map((c) => [c.code, c.name, L("ComponentType", c.componentType), calcText(c), c.taxTreatment ? L("TaxTreatment", c.taxTreatment) : "", acc(c.debitAccount), acc(c.creditAccount), c.showOnPayslip ? "Yes" : "No"])])}><Download />Export</button>
          </div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Code</th><th>Component</th><th>Type</th><th>Calculation</th><th>Taxable</th><th>GL account</th><th>Payslip</th><th /></tr></thead>
            <tbody>
              {!comps ? <tr><td colSpan={8}><Skeleton style={{ height: 200 }} /></td></tr> : shown.length ? shown.map((c) => (
                <tr key={c.id} className={cn(c.status !== "ACTIVE" && "muted")}>
                  <td><b>{c.code}</b></td><td>{c.name}{c.status !== "ACTIVE" && " (inactive)"}</td>
                  <td><span className={cn("badge", toneOf(lookups, "ComponentType", c.componentType))}>{L("ComponentType", c.componentType)}</span></td>
                  <td>{calcText(c)}</td>
                  <td>{c.componentType !== "EARNING" && c.taxTreatment !== "EXEMPT_UPTO_LIMIT" ? "—" : c.taxTreatment === "FULLY_TAXABLE" ? "Yes" : c.taxTreatment === "EXEMPT" ? <span className="badge info">Exempt</span>
                    : <span className="badge info">Exempt ≤ {c.exemptLimitPercentOfBasic !== null ? `${pct(c.exemptLimitPercentOfBasic)} basic` : `Rs ${rs(c.exemptLimitAnnualAmount)} p.a.`}</span>}</td>
                  <td>{c.componentType === "EMPLOYER_CONTRIBUTION" ? `${c.debitAccount?.code ?? "?"} / ${c.creditAccount?.code ?? "?"}` : acc(c.debitAccount ?? c.creditAccount)}</td>
                  <td><input type="checkbox" checked={c.showOnPayslip} readOnly aria-label="Shown on payslip" /></td>
                  <td className="actions"><button className="icon-btn-sm" type="button" aria-label={`Edit ${c.code}`} onClick={() => openComp(c)}><Pencil /></button></td>
                </tr>
              )) : <tr><td colSpan={8}><EmptyState icon={<Layers />} title={qq || type ? "No component matches" : "No components yet"} description={qq || type ? "Try another search or type." : "Add earnings, deductions and employer contributions."} /></td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "struct" && (
        <>
          {structs.length ? (
            <div className="card-grid mb">
              {structs.map((s) => (
                <div key={s.id} role="button" tabIndex={0} className={cn("card", s.status === "RETIRED" && "muted")} style={{ cursor: "pointer" }} onClick={() => setStructEdit({ row: s })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStructEdit({ row: s })}>
                  <div className="row"><span className={cn("badge", s.structureKind === "ADDON" ? "good" : (s.grade?.code ?? "").match(/[4-9]$/) ? "violet" : "info")}>{s.code}</span><b>{s.name}</b><span className="spacer" />
                    {s.status !== "ACTIVE" && <span className={cn("badge", toneOf(lookups, "SalaryStructureStatus", s.status))}>{L("SalaryStructureStatus", s.status)}</span>}</div>
                  <p className="muted small">{s.structureKind === "ADDON" ? `Add-on${s.grade ? ` to ${s.grade.code}` : ""}` : `Basic Rs ${rs(s.basicMin)}${s.basicMax ? ` – ${rs(s.basicMax)}` : "+"}`} · {s.staff} employee{s.staff === 1 ? "" : "s"}</p>
                  <div className="dl">
                    {s.structureKind === "ADDON" ? <>
                      {s.tiers.map((t) => <div key={t.id}><span>{t.achievementToPct === null ? `Above ${t.achievementFromPct}%` : t.achievementFromPct === 0 ? `Below ${t.achievementToPct}% target` : `${t.achievementFromPct}–${t.achievementToPct}%`}</span><b>{t.commissionRatePct ? `${t.commissionRatePct}% of sales` : "0%"}</b></div>)}
                      {s.commissionCapPercentOfBasic !== null && <div><span>Cap</span><b>{pct(s.commissionCapPercentOfBasic)} of Basic</b></div>}
                    </> : <>
                      {s.lines.filter((l) => l.component.componentType === "EARNING").slice(0, 4).map((l) => (
                        <div key={l.id}><span>{l.component.name.replace(/ (Salary|Allowance)$/, "")}</span><b>{l.displayText ?? cardText(l, comps ?? [])}</b></div>
                      ))}
                      <div><span>Gross (mid)</span><b>Rs {rs(s.grossMid)}</b></div>
                    </>}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="panel mb"><EmptyState icon={<Layers />} title="No structures yet" description={can.edit ? "Create a structure per grade: Basic plus allowances as a percentage of basic or fixed amounts." : "Structures HR creates appear here."} action={can.edit ? <button className="btn primary sm" type="button" onClick={() => setStructEdit({ row: null })}><Plus />New Structure</button> : undefined} /></div>}
          {(() => {
            const g = structs.find((s) => s.structureKind === "GRADE" && s.status === "ACTIVE" && s.grossMid);
            if (!g) return null;
            const mid = ((g.basicMin ?? 0) + (g.basicMax ?? g.basicMin ?? 0)) / 2;
            return <div className="banner info"><Info /><div><b>Formula example — {g.code} at Basic Rs {rs(mid)}</b><p>{g.lines.filter((l) => l.component.componentType === "EARNING").map((l) => l.component.code).join(" + ")} = Rs {rs(g.grossMid)} fixed gross at mid basic (excl. variable pay such as fuel, overtime and commission).</p></div></div>;
          })()}
        </>
      )}

      {tab === "groups" && (
        <div className="panel flush">
          <div className="panel-head"><div><h3>Pay groups</h3><p>Payroll is run per pay group</p></div></div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Code</th><th>Pay group</th><th>Frequency</th><th className="num">Employees</th><th>Status</th><th /></tr></thead>
            <tbody>
              {groups.length ? groups.map((g) => (
                <tr key={g.id} className={cn(g.status !== "ACTIVE" && "muted")}>
                  <td><b>{g.code}</b></td><td>{g.name}</td><td>{L("PayGroupFrequency", g.frequency)}</td><td className="num">{g.employees}</td>
                  <td><span className={cn("badge", g.status === "ACTIVE" ? "good" : "neutral")}>{g.status === "ACTIVE" ? "Active" : "Inactive"}</span></td>
                  <td className="actions"><button className="icon-btn-sm" type="button" aria-label={`Edit ${g.code}`} onClick={() => { setErrs({}); setF({ code: g.code, name: g.name, frequency: g.frequency }); setGroupEdit({ row: g }); }}><Pencil /></button></td>
                </tr>
              )) : <tr><td colSpan={6}><EmptyState title="No pay groups yet" description="Group employees who are paid together (e.g. Staff, Management)." /></td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "tax" && (
        <div className="split">
          <div className="panel flush">
            <div className="panel-head"><div><h3>Income tax on salaries u/s 149</h3><p>Annual taxable income · tax year July – June</p></div>
              <div className="panel-actions">
                <select value={cur?.taxYear ?? ""} onChange={(e) => { setYear(e.target.value); setSlabEdit(null); }} aria-label="Tax year">{years.map((y) => <option key={y.taxYear} value={y.taxYear}>Tax year {y.taxYear}</option>)}</select>
                {can.edit && cur && !editRows && <button className="btn ghost sm" type="button" onClick={() => setSlabEdit(cur.slabs.map((s) => ({ incomeFrom: String(s.incomeFrom), incomeTo: s.incomeTo?.toString() ?? "", fixedTax: String(s.fixedTax), ratePercent: String(s.ratePercent) })))}><Pencil />Edit</button>}
                {can.edit && cur && !editRows && <button className="btn ghost sm" type="button" onClick={() => setConfirmYear(true)}><Trash2 />Delete year</button>}
                {/* Phase 37: copy the Tax Master slabs of this tax year (linked to their master rows) */}
                {can.edit && !editRows && (() => {
                  const y = cur?.taxYear ?? (() => { const d = new Date(), s = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; })();
                  return <button className="btn ghost sm" type="button" disabled={busy} onClick={() => run(() => importTaxMasterSlabs(y), `Tax Master slabs imported for ${y}`, () => { setYear(y); })}><Download />Import from Tax Master</button>;
                })()}
              </div></div>
            {errs.slabs && <p className="hint text-danger" style={{ padding: "0 16px" }}>{errs.slabs}</p>}
            <div className="table-wrap"><table className="tbl lines">
              <thead><tr><th>Slab</th><th className="num">From (Rs)</th><th className="num">To (Rs)</th><th className="num">Fixed tax (Rs)</th><th className="num">Rate on excess</th>{editRows && <th />}</tr></thead>
              <tbody>
                {editRows ? editRows.map((s, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    {(["incomeFrom", "incomeTo", "fixedTax", "ratePercent"] as const).map((k) => <td key={k} className="num"><input className="cell-input" inputMode="decimal" value={s[k]} placeholder={k === "incomeTo" ? "and above" : ""} onChange={(e) => setSlabEdit(editRows.map((x, j) => (j === i ? { ...x, [k]: e.target.value.replace(/[^\d.]/g, "") } : x)))} /></td>)}
                    <td className="actions"><button type="button" className="icon-btn-sm" aria-label="Remove slab" onClick={() => setSlabEdit(editRows.filter((_, j) => j !== i))}><Trash2 /></button></td>
                  </tr>
                )) : cur ? cur.slabs.map((s) => (
                  <tr key={s.id}><td>{s.slabNo}</td><td className="num">{rs(s.incomeFrom)}</td><td className="num">{s.incomeTo === null ? "and above" : rs(s.incomeTo)}</td><td className="num">{rs(s.fixedTax)}</td><td className="num">{s.ratePercent}%</td></tr>
                )) : <tr><td colSpan={5}><EmptyState title="No tax slabs yet" description="Enter the salaried slabs for a tax year from the Finance Act." /></td></tr>}
              </tbody>
            </table></div>
            {editRows && (
              <div className="row" style={{ padding: 16, gap: 8 }}>
                <button className="btn secondary sm" type="button" onClick={() => setSlabEdit([...editRows, { incomeFrom: editRows[editRows.length - 1]?.incomeTo ?? "0", incomeTo: "", fixedTax: "", ratePercent: "" }])}><Plus />Add slab</button>
                {slabErr && <small className="hint text-danger">{slabErr}</small>}
                <span className="spacer" />
                <button className="btn secondary sm" type="button" onClick={() => setSlabEdit(null)}>Cancel</button>
                <button className="btn primary sm" type="button" disabled={busy || !!slabErr} onClick={() => cur && run(() => saveTaxYear(cur.taxYear, editRows.map((s) => ({ ...s, incomeTo: s.incomeTo === "" ? null : s.incomeTo, fixedTax: s.fixedTax || 0 }))), `Tax year ${cur.taxYear} saved`, () => setSlabEdit(null))}>Save slabs</button>
              </div>
            )}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Tax calculator</h3><p>Tax year {cur?.taxYear ?? "—"}</p></div></div>
            <FormGrid cols={1}><Field label="Annual taxable income (Rs)"><input inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value.replace(/[^\d]/g, ""))} /></Field></FormGrid>
            <div className="banner info mt"><Calculator /><div><b>Tax Rs {rs(cur ? taxOn(Number(income || 0), cur.slabs) : null)} a year</b><p>≈ Rs {rs(cur ? Math.round(taxOn(Number(income || 0), cur.slabs) / 12) : null)} a month</p></div></div>
          </div>
        </div>
      )}

      {compEdit && (
        <RecordModal open wide onClose={() => setCompEdit(null)} busy={busy} title="Salary Component" subtitle={compEdit.row ? `${compEdit.row.name} · ${compEdit.row.code}` : "New component"}
          history={compEdit.row ? { schema: "Payroll", table: "SalaryComponents", id: compEdit.row.id } : null} active={compEdit.row?.status === "ACTIVE"}
          canSave={can.edit} canToggle={can.edit} canDelete={can.edit && !compEdit.row?.systemRole} saveLabel="Save component" onSave={saveComp}
          onToggle={() => compEdit.row && run(() => setComponentActive(compEdit.row!.id, compEdit.row!.status !== "ACTIVE", compEdit.row!.rowVersion), `${compEdit.row.code} ${compEdit.row.status === "ACTIVE" ? "deactivated" : "activated"}`, () => setCompEdit(null))}
          onDelete={async () => { if (compEdit.row) await run(() => deleteComponent(compEdit.row!.id, compEdit.row!.rowVersion), `${compEdit.row.code} deleted`, () => setCompEdit(null)); }}
          deleteNote="Only a component no structure or other component uses can be deleted; otherwise deactivate it.">
          <FormGrid cols={3}>
            <Field label="Code" required error={errs.code}><input value={f.code as string} maxLength={10} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Name" required error={errs.name}><input value={f.name as string} maxLength={80} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Type" required error={errs.componentType}><select value={f.componentType as string} disabled={!!compEdit.row?.systemRole} onChange={(e) => set("componentType", e.target.value)}>{lookupOptions(lookups, "ComponentType", f.componentType as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Calculation" error={errs.calcMethod}><select value={f.calcMethod as string} onChange={(e) => set("calcMethod", e.target.value)}>{lookupOptions(lookups, "SalaryComponentCalcMethod", f.calcMethod as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            {f.calcMethod === "PERCENT_OF" && <>
              <Field label="Percentage" error={errs.percent}><input inputMode="decimal" value={f.percent as string} onChange={(e) => set("percent", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              <Field label="Of" error={errs.baseBasis || errs.baseComponentId}>
                <select value={f.baseBasis === "COMPONENT" ? `C:${f.baseComponentId}` : (f.baseBasis as string)} onChange={(e) => { const v = e.target.value; if (v.startsWith("C:")) { set("baseBasis", "COMPONENT"); set("baseComponentId", v.slice(2)); } else { set("baseBasis", v); set("baseComponentId", ""); } }}>
                  {(comps ?? []).filter((c) => c.id !== compEdit.row?.id && c.componentType === "EARNING").map((c) => <option key={c.id} value={`C:${c.id}`}>{c.name} ({c.code})</option>)}
                  <option value="GROSS">Gross</option><option value="EOBI_WAGE">EOBI wage (min. wage)</option>
                </select>
              </Field>
              {(f.baseBasis === "EOBI_WAGE" || f.baseBasis === "GROSS") && <Field label={f.baseBasis === "GROSS" ? "Only when gross ≤ (Rs)" : "Minimum wage (Rs)"} error={errs.wageCeiling}><input inputMode="numeric" value={f.wageCeiling as string} onChange={(e) => set("wageCeiling", e.target.value.replace(/[^\d.]/g, ""))} /></Field>}
            </>}
            {f.calcMethod === "FIXED" && <Field label="Amount (Rs)" hint="Empty = set per structure" error={errs.fixedAmount}><input inputMode="numeric" value={f.fixedAmount as string} onChange={(e) => set("fixedAmount", e.target.value.replace(/[^\d.]/g, ""))} /></Field>}
            <Field label={f.calcMethod === "FORMULA" ? "Formula" : "Formula (advanced)"} full hint="Codes, numbers, + − × ÷, brackets, ROUND / MIN / MAX; other names are run-time inputs" error={errs.formula}>
              <input value={f.formula as string} disabled={f.calcMethod !== "FORMULA"} placeholder="ROUND(BAS * 0.45, 0)" onChange={(e) => set("formula", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Calculation shown as" full error={errs.calcDescription}><input value={f.calcDescription as string} maxLength={120} placeholder="e.g. 45% of Basic" onChange={(e) => set("calcDescription", e.target.value)} /></Field>
            {f.componentType !== "DEDUCTION" && <Field label="Debit account" required error={errs.debitAccountId}><select value={f.debitAccountId as string} onChange={(e) => set("debitAccountId", e.target.value)}><option value="">Choose…</option>{accounts(["5"]).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>}
            {f.componentType !== "EARNING" && <Field label="Credit account" required error={errs.creditAccountId}><select value={f.creditAccountId as string} onChange={(e) => set("creditAccountId", e.target.value)}><option value="">Choose…</option>{accounts(["1", "2"]).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>}
            <Field label="Tax treatment" error={errs.taxTreatment}><select value={f.taxTreatment as string} onChange={(e) => set("taxTreatment", e.target.value)}>{f.componentType !== "EARNING" && <option value="">—</option>}{lookupOptions(lookups, "TaxTreatment", f.taxTreatment as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            {f.taxTreatment === "EXEMPT_UPTO_LIMIT" && <>
              <Field label="Exempt up to (% of basic)" error={errs.exemptLimitPercentOfBasic}><input inputMode="decimal" value={f.exemptLimitPercentOfBasic as string} onChange={(e) => set("exemptLimitPercentOfBasic", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              <Field label="or Rs per year" error={errs.exemptLimitAnnualAmount}><input inputMode="numeric" value={f.exemptLimitAnnualAmount as string} onChange={(e) => set("exemptLimitAnnualAmount", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            </>}
            <Field label="Pro-rate on paid days" error={errs.prorateOnPaidDays}><select value={f.prorateOnPaidDays ? "1" : "0"} onChange={(e) => set("prorateOnPaidDays", e.target.value === "1")}><option value="1">Yes</option><option value="0">No</option></select></Field>
            <Check label="Show on payslip" checked={f.showOnPayslip as boolean} onChange={(e) => set("showOnPayslip", e.target.checked)} />
            <Check label="Include in gratuity base" checked={f.includeInGratuityBase as boolean} onChange={(e) => set("includeInGratuityBase", e.target.checked)} />
            <Check label="Include in EOBI wage" checked={f.includeInEobiWage as boolean} onChange={(e) => set("includeInEobiWage", e.target.checked)} />
          </FormGrid>
          {compEdit.row?.systemRole && <p className="small muted mt">System role: {L("SystemRole", compEdit.row.systemRole)} — payroll runs use this component for it, so it can be deactivated but not deleted.</p>}
        </RecordModal>
      )}

      {structEdit && opts && comps && (
        <StructureModal row={structEdit.row} components={comps} opts={opts} can={can} onClose={() => setStructEdit(null)} onSaved={() => { setStructEdit(null); reload(); }}
          onDuplicate={(s) => { setStructEdit(null); setDup({ from: s.id, code: "", name: `${s.name} (copy)` }); }} />
      )}

      {dup && (
        <Modal open onClose={() => setDup(null)} title="Duplicate structure" subtitle="The copy starts as a draft."
          foot={<><button type="button" className="btn secondary" onClick={() => setDup(null)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => run(() => duplicateStructure(dup.from, { code: dup.code, name: dup.name }), "Structure duplicated as draft", () => setDup(null))}><Copy />Duplicate</button></>}>
          <FormGrid cols={1}>
            <Field label="Copy from"><select value={dup.from} onChange={(e) => setDup({ ...dup, from: e.target.value, name: `${structs.find((s) => s.id === e.target.value)?.name ?? ""} (copy)` })}>{structs.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></Field>
            <Field label="New code" required error={errs.code}><input value={dup.code} maxLength={10} placeholder="G2B" onChange={(e) => setDup({ ...dup, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name" required error={errs.name}><input value={dup.name} maxLength={80} onChange={(e) => setDup({ ...dup, name: e.target.value })} /></Field>
          </FormGrid>
        </Modal>
      )}

      {groupEdit && (
        <RecordModal open onClose={() => setGroupEdit(null)} busy={busy} title={groupEdit.row ? `Edit ${groupEdit.row.code}` : "New pay group"} subtitle="Payroll runs are made per pay group."
          history={groupEdit.row ? { schema: "Payroll", table: "PayGroups", id: groupEdit.row.id } : null} active={groupEdit.row?.status === "ACTIVE"} canSave={can.edit} canToggle={can.edit} canDelete={can.edit} saveLabel="Save"
          onSave={() => run(() => (groupEdit.row ? updatePayGroup(groupEdit.row.id, { ...f, rowVersion: groupEdit.row.rowVersion }) : createPayGroup(f)), "Pay group saved", () => setGroupEdit(null))}
          onToggle={() => groupEdit.row && run(() => setPayGroupActive(groupEdit.row!.id, groupEdit.row!.status !== "ACTIVE", groupEdit.row!.rowVersion), "Pay group updated", () => setGroupEdit(null))}
          onDelete={async () => { if (groupEdit.row) await run(() => deletePayGroup(groupEdit.row!.id, groupEdit.row!.rowVersion), "Pay group deleted", () => setGroupEdit(null)); }}
          deleteNote="Only a pay group no salary or payroll run uses can be deleted; otherwise deactivate it.">
          <FormGrid>
            <Field label="Code" required error={errs.code}><input value={f.code as string} maxLength={20} placeholder="STAFF" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Name" required error={errs.name}><input value={f.name as string} maxLength={60} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Frequency" error={errs.frequency}><select value={f.frequency as string} onChange={(e) => set("frequency", e.target.value)}>{lookupOptions(lookups, "PayGroupFrequency", f.frequency as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
          </FormGrid>
        </RecordModal>
      )}

      <ConfirmDialog open={confirmYear} onClose={() => setConfirmYear(false)} title={`Delete tax year ${cur?.taxYear ?? ""}?`} confirmLabel="Delete" danger busy={busy}
        onConfirm={async () => { setConfirmYear(false); if (cur) await run(() => deleteTaxYear(cur.taxYear), `Tax year ${cur.taxYear} deleted`, () => setYear("")); }}>
        Its slabs are removed (kept in row history). Payroll runs for that year then can&apos;t compute income tax.
      </ConfirmDialog>
    </>
  );
}
