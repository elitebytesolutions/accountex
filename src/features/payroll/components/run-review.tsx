"use client";

import { Banknote, ChevronDown, Download, HandCoins, Percent, Search, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { LINE_FLAGS, type PayrollRun, type RunLine } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { monthLabel, Person } from "@/features/hr/components/attendance-ui";
import { calculatePayrollRun, submitPayrollRun } from "../run-api";
import { PayrollDelta, PayrollKpi, PayrollNum, payrollError, payrollMoney, payrollRs } from "./run-ui";

const PAGE = 10;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Chip = "ALL" | "FLAGGED" | "NEW" | "REVISED";

function variance(l: RunLine) {
  if (l.isNewJoiner) return <Badge tone="info">New</Badge>;
  if (l.variancePct === null) return <Badge tone="neutral">—</Badge>;
  const v = l.variancePct;
  return <Badge tone={Math.abs(v) > 15 ? "warn" : v < 0 ? "danger" : v > 0 ? "good" : "neutral"}>{v > 0 ? "+" : v < 0 ? "−" : ""}{Math.abs(v).toFixed(1)}%</Badge>;
}

/** Step 3: warnings, KPIs vs the previous run, the employee lines (with their components), submit for approval. */
export function RunReviewStep({ run, onRun, onBack }: { run: PayrollRun; onRun: (r: PayrollRun, next?: number) => void; onBack: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [chip, setChip] = useState<Chip>("ALL");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const prev = run.previous;
  const prevMon = prev ? MON[Number(prev.payrollMonth.slice(5, 7)) - 1]! : "";
  const flagged = run.lines.filter((l) => l.flags.length);
  const flagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of run.lines) for (const f of l.flags) m.set(f, (m.get(f) ?? 0) + 1);
    return m;
  }, [run.lines]);
  const depts = [...new Set(run.lines.map((l) => l.employee.department).filter((x): x is string => !!x))].sort();
  const rows = run.lines.filter((l) => (chip === "ALL" || (chip === "FLAGGED" ? l.flags.length > 0 : chip === "NEW" ? l.isNewJoiner : l.isRevised))
    && (!dept || l.employee.department === dept) && (!q || `${l.employee.name} ${l.employee.code}`.toLowerCase().includes(q.toLowerCase())));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const sum = (k: keyof RunLine) => rows.reduce((s, l) => s + (l[k] as number), 0);

  const act = async (what: string, fn: () => Promise<PayrollRun>, msg: string, next?: number) => {
    setBusy(what);
    try { const r = await fn(); toast(msg, { tone: "good" }); onRun(r, next); } catch (e) { toast(payrollError(e), { tone: "danger" }); } finally { setBusy(null); }
  };
  const register = () => downloadCsv(`payroll-register-${run.docNo}.csv`, [
    ["Employee code", "Employee", "Department", "Paid days", "Gross", "Income tax", "EOBI", "PF", "Loan", "Other deductions", "Net", "Flags"],
    ...run.lines.map((l) => [l.employee.code, l.employee.name, l.employee.department, l.paidDays, l.grossAmount, l.taxAmount, l.eobiAmount, l.pfAmount, l.loanAmount, l.otherDeductionAmount, l.netAmount, l.flags.join(" ")]),
  ]);

  if (!run.lines.length) {
    return (
      <div className="wz-pane active">
        <div className="banner info mb"><div><b>Not calculated yet</b><p>Calculate the run from the Inputs step to see each employee&apos;s pay.</p></div></div>
        <div className="form-actions"><button type="button" className="btn secondary" onClick={onBack}>Back</button></div>
      </div>
    );
  }

  return (
    <div className="wz-pane active">
      {flagged.length > 0 && (
        <div className="banner warn mb">
          <TriangleAlert />
          <div><b>{flagged.length} employee{flagged.length === 1 ? "" : "s"} flagged — review before approval</b>
            <p>{[...flagCounts.entries()].map(([f, n]) => `${n} × ${LINE_FLAGS[f] ?? f}`).join(" · ")}.</p></div>
          <button type="button" className="btn sm secondary" onClick={() => { setChip(chip === "FLAGGED" ? "ALL" : "FLAGGED"); setPage(1); }}>{chip === "FLAGGED" ? "Show all" : "Show only flagged"}</button>
        </div>
      )}
      {run.status === "REVIEW" && !run.calculatedAt && <div className="banner info mb"><div><b>Recalculate before submitting</b><p>Inputs changed since this calculation.</p></div></div>}

      <div className="kpi-grid c5 mb">
        <PayrollKpi label="Gross" icon={<Wallet />} value={payrollRs(run.grossAmount)} sub={<PayrollDelta now={run.grossAmount} before={prev?.grossAmount} label={prevMon} />} />
        <PayrollKpi tone="yellow" label="Income Tax" icon={<Percent />} value={payrollRs(run.taxAmount)} sub={<PayrollDelta now={run.taxAmount} before={prev?.taxAmount} label={prevMon} invert />} />
        <PayrollKpi tone="violet" label="EOBI + PF (Emp.)" icon={<ShieldCheck />} value={payrollRs(run.eobiEmployeeAmount + run.pfEmployeeAmount, 2)} sub={<small>EOBI {payrollMoney(run.eobiEmployeeAmount, 2)} · PF {payrollMoney(run.pfEmployeeAmount, 2)}</small>} />
        <PayrollKpi tone="blue" label="Loans" icon={<HandCoins />} value={payrollRs(run.loanAmount)} sub={<small>{run.lines.filter((l) => l.loanAmount > 0).length} installments</small>} />
        <PayrollKpi tone="teal" label="Net Pay" icon={<Banknote />} value={payrollRs(run.netAmount, 2)} sub={<PayrollDelta now={run.netAmount} before={prev?.netAmount} label={prevMon} />} />
      </div>

      <div className="panel flush mb">
        <div className="panel-head"><div><h3>Employee payroll lines</h3><p>{monthLabel(run.payrollMonth.slice(0, 7))} · {run.lines.length} employees · click a line for its components</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search employee…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label="Department"><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
          <div className="chips">
            {([["ALL", "All", run.lines.length], ["FLAGGED", "Flagged", flagged.length], ["NEW", "New", run.lines.filter((l) => l.isNewJoiner).length], ["REVISED", "Revised", run.lines.filter((l) => l.isRevised).length]] as const).map(([k, label, n]) => (
              <button key={k} type="button" className={cn(chip === k && "active")} onClick={() => { setChip(k); setPage(1); }}>{label} <i>{n}</i></button>
            ))}
          </div>
          <span className="spacer" />
          <button type="button" className="btn secondary sm" onClick={register}><Download />Payroll register</button>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Employee</th><th>Dept</th><th className="num">Paid days</th><th className="num">Gross</th><th className="num">Tax</th><th className="num">EOBI</th><th className="num">PF</th><th className="num">Loan</th><th className="num">Net</th><th>vs {prevMon || "prev."}</th></tr></thead>
          <tbody>
            {shown.map((l) => (
              <Fragment key={l.id}>
                <tr onClick={() => setOpen(open === l.id ? null : l.id)} style={{ cursor: "pointer" }} title={l.flags.map((f) => LINE_FLAGS[f] ?? f).join(" · ") || undefined}>
                  <td><Person e={l.employee} sub={`${l.employee.code}${l.employee.designation ? ` · ${l.employee.designation}` : ""}`} /></td>
                  <td>{l.employee.department ?? "—"}{l.flags.length > 0 && <> <Badge tone="warn">{l.flags.length} flag{l.flags.length === 1 ? "" : "s"}</Badge></>}</td>
                  <td className="num">{payrollMoney(l.paidDays, l.paidDays % 1 ? 1 : 0)}</td>
                  <PayrollNum value={l.grossAmount} /><PayrollNum value={l.taxAmount} /><PayrollNum value={l.eobiAmount} /><PayrollNum value={l.pfAmount} /><PayrollNum value={l.loanAmount} />
                  <td className="num">{payrollMoney(l.netAmount)}</td>
                  <td>{variance(l)} <ChevronDown style={{ width: 14, height: 14, verticalAlign: -2, transform: open === l.id ? "rotate(180deg)" : undefined }} /></td>
                </tr>
                {open === l.id && (
                  <tr className="sub"><td colSpan={10}>
                    <div className="grid-2">
                      <table className="tbl"><thead><tr><th>Earnings &amp; employer</th><th>Basis</th><th className="num">Amount</th></tr></thead><tbody>
                        {l.components.filter((c) => c.componentType !== "DEDUCTION").map((c) => <tr key={c.id}><td>{c.label}{c.componentType === "EMPLOYER_CONTRIBUTION" && <small className="muted"> · employer</small>}</td><td className="muted">{c.basisText}{c.exemptAmount ? ` · exempt ${payrollMoney(c.exemptAmount, 2)}` : ""}</td><td className="num">{payrollMoney(c.amount, 2)}</td></tr>)}
                      </tbody></table>
                      <table className="tbl"><thead><tr><th>Deductions</th><th>Basis</th><th className="num">Amount</th></tr></thead><tbody>
                        {l.components.filter((c) => c.componentType === "DEDUCTION").map((c) => <tr key={c.id}><td>{c.label}</td><td className="muted">{c.basisText}</td><td className="num">{payrollMoney(c.amount, 2)}</td></tr>)}
                        <tr><td colSpan={3} className="muted small">Projected taxable {payrollRs(l.annualTaxableIncome)} · annual tax {payrollRs(l.annualTaxLiability)} · exempt {payrollRs(l.annualExemptAmount)}{l.lwpDays ? ` · unpaid days ${l.lwpDays}` : ""}{l.overtimeHours ? ` · overtime ${l.overtimeHours} h` : ""}</td></tr>
                      </tbody></table>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!shown.length && <tr><td colSpan={10} className="muted">No lines match.</td></tr>}
            <tr className="total"><td colSpan={3}>Total · {rows.length} employees</td><td className="num">{payrollMoney(sum("grossAmount"))}</td><td className="num">{payrollMoney(sum("taxAmount"))}</td><td className="num">{payrollMoney(sum("eobiAmount"))}</td><td className="num">{payrollMoney(sum("pfAmount"))}</td><td className="num">{payrollMoney(sum("loanAmount"))}</td><td className="num">{payrollMoney(sum("netAmount"))}</td><td>{prev && chip === "ALL" && !q && !dept ? variance({ ...run.lines[0]!, isNewJoiner: false, variancePct: prev.netAmount ? ((run.netAmount - prev.netAmount) / prev.netAmount) * 100 : null }) : null}</td></tr>
          </tbody>
        </table></div>
        <div className="table-foot"><span>Showing {rows.length ? (page - 1) * PAGE + 1 : 0}–{Math.min(page * PAGE, rows.length)} of {rows.length}</span>
          <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={cn(page === i + 1 && "active")} onClick={() => setPage(i + 1)}>{i + 1}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button></div>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onBack}>Back</button>
        {run.can.calculate && <button type="button" className="btn secondary" disabled={!!busy} onClick={() => act("calc", () => calculatePayrollRun(run.id), "Recalculated")}>{busy === "calc" ? "Calculating…" : "Recalculate"}</button>}
        {run.can.submit
          ? <button type="button" className="btn primary" disabled={!!busy} onClick={() => act("submit", () => submitPayrollRun(run.id), `${run.docNo} submitted for approval`, 4)}>{busy === "submit" ? "Submitting…" : "Submit for approval"}</button>
          : !["DRAFT", "REVIEW"].includes(run.status) && <button type="button" className="btn primary" onClick={() => onRun(run, 4)}>Continue to approval</button>}
      </div>
    </div>
  );
}
