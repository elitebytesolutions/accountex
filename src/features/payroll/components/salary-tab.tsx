"use client";

import { FileText, Layers, Plus, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { computeLines, type PayGroup, type SalaryComponent, type SalaryStructure, type SalaryView } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { addSalary, deleteSalary, employeeSalary, listComponents, listPayGroups, listStructures, reviseSalary } from "../api";

const rs = (n: number | null | undefined, dp = 2) => (n === null || n === undefined ? "varies" : n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const today = () => new Date().toISOString().slice(0, 10);

/** Loads an employee's salary view (used by the profile's KPI and Salary tab). */
export function useSalary(employeeId: string, enabled: boolean) {
  const [data, setData] = useState<SalaryView | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    employeeSalary(employeeId).then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the salary" }));
    return () => { cancelled = true; };
  }, [employeeId, enabled, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, reload, setData };
}

/** The KPI card text: gross and the last revision (template "Rs 185,000 · ▲ 12% increment Jul 2026"). */
export function grossKpi(v: SalaryView | null): { value: string; note: string; up: boolean } {
  const c = v?.current;
  if (!c) return { value: "—", note: "No salary yet", up: false };
  const prev = v!.history.find((h) => h.effectiveFrom < c.effectiveFrom);
  const change = prev ? Math.round(((c.grossAmount - prev.grossAmount) / prev.grossAmount) * 1000) / 10 : null;
  const when = new Date(`${c.effectiveFrom}T00:00:00`).toLocaleString("en-GB", { month: "short", year: "numeric" });
  return { value: `Rs ${rs(c.grossAmount, 0)}`, note: change !== null && change !== 0 ? `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% ${c.revisionType.toLowerCase()} ${when}` : `Since ${dateLabel(c.effectiveFrom)}`, up: !!change && change > 0 };
}

/** Template app/hr/employees/view tab "Salary": the current structure lines, employer contributions and the revision history. */
export function SalaryTab({ employee, gradeId, joiningDate, view, error, reload, onChanged, can }: {
  employee: { id: string; name: string; exited: boolean }; gradeId: string | null; joiningDate: string;
  view: SalaryView | null; error: { message: string; reference?: string } | null; reload: () => void; onChanged: (v: SalaryView) => void; can: { approve: boolean };
}) {
  const toast = useToast();
  const lookups = useLookups(["ComponentType", "RevisionType", "BankTransferChequeCashPayMode"]);
  const [revise, setRevise] = useState(false);
  const [hist, setHist] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!view) return <Skeleton style={{ height: 300 }} />;
  const c = view.current;
  const latest = view.history[0];

  if (!c) {
    return (
      <>
        <div className="panel"><EmptyState icon={<Layers />} title="No salary yet" description={can.approve ? "Choose the salary structure and basic to set this employee's salary." : "A payroll approver sets the salary."}
          action={can.approve && !employee.exited ? <button className="btn primary sm" type="button" onClick={() => setRevise(true)}><Plus />Add salary</button> : undefined} /></div>
        {revise && <ReviseModal first employee={employee} gradeId={gradeId} joiningDate={joiningDate} view={view} onClose={() => setRevise(false)} onSaved={(v) => { setRevise(false); onChanged(v); }} lookups={lookups} />}
      </>
    );
  }
  const earnings = c.lines.filter((l) => l.componentType === "EARNING");
  const deductions = c.lines.filter((l) => l.componentType === "DEDUCTION");
  const employer = c.lines.filter((l) => l.componentType === "EMPLOYER_CONTRIBUTION");
  const extra = Math.round((c.grossAmount - c.computedGross) * 100) / 100;
  const dedTotal = deductions.reduce((s, l) => s + (l.monthly ?? 0), 0) + (c.incomeTaxMonthly ?? 0);
  const net = c.grossAmount - dedTotal;
  const ctc = c.grossAmount + employer.reduce((s, l) => s + (l.monthly ?? 0), 0);
  const row = (l: { code: string; name: string; componentType: string; basis: string; monthly: number | null }, key: string) => (
    <tr key={key}>
      <td>{l.code === "BAS" || l.name === "Basic Salary" ? <b>{l.name}</b> : l.name}</td>
      <td><span className={cn("badge", l.componentType === "EARNING" ? "good" : "danger")}>{l.componentType === "EARNING" ? "Earning" : "Deduction"}</span></td>
      <td>{l.basis}</td>
      <td className={cn("num", l.componentType === "DEDUCTION" && "cr", l.monthly === null && "zero")}>{rs(l.monthly)}</td>
      <td className={cn("num", l.componentType === "DEDUCTION" && "cr", l.monthly === null && "zero")}>{l.monthly === null ? "—" : rs(l.monthly * 12)}</td>
    </tr>
  );

  return (
    <>
      <div className="split">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Salary structure</h3><p>Effective {dateLabel(c.effectiveFrom)} · structure &ldquo;{c.structure.name}&rdquo;{c.addon && ` + ${c.addon.name}`}</p></div>
            <div className="panel-actions">
              <Link className="btn ghost sm" href="/hr/payroll/structures">Structures</Link>
              {can.approve && !employee.exited && <button className="btn secondary sm" type="button" onClick={() => setRevise(true)}><TrendingUp />Revise</button>}
            </div></div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Component</th><th>Type</th><th>Basis</th><th className="num">Monthly (Rs)</th><th className="num">Annual (Rs)</th></tr></thead>
            <tbody>
              {earnings.map((l) => row(l, l.componentId))}
              {extra > 0 && row({ code: "", name: "Negotiated difference", componentType: "EARNING", basis: "Agreed gross above structure", monthly: extra }, "extra")}
              <tr className="total"><td colSpan={3}>Gross salary</td><td className="num">{rs(c.grossAmount)}</td><td className="num">{rs(c.grossAmount * 12)}</td></tr>
              {deductions.map((l) => row(l, l.componentId))}
              {c.incomeTaxMonthly !== null && !deductions.some((d) => d.code === "ITX") && row({ code: "ITX", name: "Income tax u/s 149", componentType: "DEDUCTION", basis: `FY ${c.taxYear} slab (estimate)`, monthly: c.incomeTaxMonthly }, "itx")}
              <tr className="total"><td colSpan={3}>Net pay (estimate)</td><td className="num">{rs(net)}</td><td className="num">{rs(net * 12)}</td></tr>
            </tbody>
          </table></div>
          <p className="small muted" style={{ padding: "0 16px 14px" }}>Income tax is estimated on the current salary{c.taxYear ? ` with the ${c.taxYear} slabs` : ""}; loans, advances and variable pay are calculated in payroll runs.</p>
        </div>
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Employer contributions</h3></div></div>
            <div className="dl">
              {employer.map((l) => <div key={l.componentId}><span>{l.name}</span><b>{l.monthly === null ? "varies" : `Rs ${rs(l.monthly, 0)}`}{l.monthly === 0 && <small className="muted"> — above ceiling</small>}</b></div>)}
              <div><span>Cost to company</span><b>Rs {rs(ctc, 0)} / mo</b></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Salary revisions</h3><p>Effective-dated; past salaries are never changed</p></div></div>
            <div className="list">
              {view.history.map((h) => (
                <div key={h.id} className="list-item">
                  <span className="icon-well"><FileText /></span>
                  <div><b>{labelOf(lookups, "RevisionType", h.revisionType)} · Rs {rs(h.grossAmount, 0)}</b><small>{dateLabel(h.effectiveFrom)}{h.effectiveTo ? ` – ${dateLabel(h.effectiveTo)}` : " onwards"}{h.approvedBy ? ` · approved by ${h.approvedBy.name}` : ""}{h.revisionReason ? ` · ${h.revisionReason}` : ""}</small></div>
                  <span className="spacer" />
                  <button className="btn ghost sm" type="button" onClick={() => setHist(h.id)}>History</button>
                  {can.approve && h.id === latest?.id && view.history.length > 0 && <button className="icon-btn-sm" type="button" aria-label="Remove this revision" onClick={() => setConfirmDel(true)}><Trash2 /></button>}
                </div>
              ))}
            </div>
            <p className="small muted mt">Payslips appear here once payroll runs are made.</p>
          </div>
        </div>
      </div>
      {revise && <ReviseModal employee={employee} gradeId={gradeId} joiningDate={joiningDate} view={view} onClose={() => setRevise(false)} onSaved={(v) => { setRevise(false); onChanged(v); }} lookups={lookups} />}
      {hist && <Modal open onClose={() => setHist(null)} title="Salary history" subtitle={employee.name} wide><HistoryTab schema="Payroll" table="EmployeeSalaries" id={hist} /></Modal>}
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} title="Remove the latest revision?" confirmLabel="Remove" danger busy={busy}
        onConfirm={async () => {
          setConfirmDel(false);
          if (!latest) return;
          setBusy(true);
          try { onChanged(await deleteSalary(latest.id, latest.rowVersion)); toast("Revision removed; the previous salary applies again", { tone: "good" }); } catch (e) { toast(apiMessage(e, "Could not remove"), { tone: "danger" }); } finally { setBusy(false); }
        }}>
        Only the latest revision can be removed, and only before a payroll run uses it. The previous salary becomes current again.
      </ConfirmDialog>
    </>
  );
}

/** Add the first salary or a revision (approvers only). Gross defaults to the structure's computed gross. */
function ReviseModal({ first, employee, gradeId, joiningDate, view, onClose, onSaved, lookups }: {
  first?: boolean; employee: { id: string; name: string }; gradeId: string | null; joiningDate: string; view: SalaryView; onClose: () => void; onSaved: (v: SalaryView) => void; lookups: ReturnType<typeof useLookups>;
}) {
  const toast = useToast();
  const cur = view.current;
  const [data, setData] = useState<{ structures: SalaryStructure[]; components: SalaryComponent[]; groups: PayGroup[] } | null>(null);
  const [f, setF] = useState({
    structureId: cur?.structure.id ?? "", addonStructureId: cur?.addon?.id ?? "", payGroupId: cur?.payGroup?.id ?? "", basicAmount: cur?.basicAmount.toString() ?? "", grossAmount: "",
    payMode: cur?.payMode ?? "BANK_TRANSFER", revisionType: first ? "JOINING" : "INCREMENT", revisionReason: "", effectiveFrom: first ? joiningDate : today(),
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([listStructures(), listComponents(), listPayGroups()]).then(([structures, components, groups]) => setData({ structures, components, groups })).catch(() => toast("Could not load structures", { tone: "danger" }));
  }, [toast]);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const grades = data?.structures.filter((s) => s.structureKind === "GRADE" && s.status === "ACTIVE") ?? [];
  const addons = data?.structures.filter((s) => s.structureKind === "ADDON" && s.status === "ACTIVE") ?? [];
  const structureId = f.structureId || grades.find((s) => s.grade?.id === gradeId)?.id || "";
  const s = grades.find((x) => x.id === structureId);
  const a = addons.find((x) => x.id === f.addonStructureId);
  const basic = Number(f.basicAmount || 0);
  const lines = [...(s?.lines ?? []), ...(a?.lines ?? [])].map((l) => ({ componentId: l.component.id, calcMethod: l.calcMethod, percent: l.percent, fixedAmount: l.fixedAmount, quantity: l.quantity, formula: l.formula, displayText: l.displayText }));
  const computed = data && basic > 0 ? computeLines(lines, data.components.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null })), basic).gross : null;
  const outside = s && basic > 0 && ((s.basicMin !== null && basic < s.basicMin) || (s.basicMax !== null && basic > s.basicMax));
  const save = async () => {
    setBusy(true);
    setErrs({});
    const body = { ...f, structureId, grossAmount: f.grossAmount || null };
    try {
      const v = first ? await addSalary({ ...body, employeeId: employee.id }) : await reviseSalary(employee.id, { ...body, rowVersion: view.history[0]!.rowVersion });
      toast(first ? "Salary set" : "Salary revised", { tone: "good" });
      onSaved(v);
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} wide title={first ? "Add salary" : "Revise salary"} subtitle={first ? employee.name : `${employee.name} · current gross Rs ${rs(cur?.grossAmount, 0)} since ${dateLabel(cur?.effectiveFrom)}`}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || !data} onClick={save}>{busy ? "Saving…" : first ? "Set salary" : "Save revision"}</button></>}>
      {!data ? <Skeleton style={{ height: 200 }} /> : (
        <FormGrid cols={3}>
          <Field label="Structure" required error={errs.structureId}><select value={structureId} onChange={(e) => set("structureId", e.target.value)}><option value="">{grades.length ? "Choose…" : "No active structures"}</option>{grades.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></Field>
          <Field label="Add-on" error={errs.addonStructureId}><select value={f.addonStructureId} onChange={(e) => set("addonStructureId", e.target.value)}><option value="">None</option>{addons.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></Field>
          <Field label="Pay group" error={errs.payGroupId}><select value={f.payGroupId} onChange={(e) => set("payGroupId", e.target.value)}><option value="">—</option>{data.groups.filter((g) => g.status === "ACTIVE").map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Basic monthly (Rs)" required error={errs.basicAmount} hint={outside ? `Outside the structure's band (Rs ${rs(s!.basicMin, 0)} – ${rs(s!.basicMax, 0)})` : undefined}><input inputMode="numeric" value={f.basicAmount} onChange={(e) => set("basicAmount", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Gross monthly (Rs)" error={errs.grossAmount} hint={computed !== null ? `Structure gives Rs ${rs(computed, 0)}` : undefined}><input inputMode="numeric" value={f.grossAmount} placeholder={computed !== null ? String(computed) : ""} onChange={(e) => set("grossAmount", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          <Field label="Pay mode" error={errs.payMode}><select value={f.payMode} onChange={(e) => set("payMode", e.target.value)}>{lookupOptions(lookups, "BankTransferChequeCashPayMode", f.payMode).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
          <Field label="Revision type" error={errs.revisionType}><select value={f.revisionType} onChange={(e) => set("revisionType", e.target.value)}>{lookupOptions(lookups, "RevisionType", f.revisionType).filter((o) => first ? o.code === "JOINING" : o.code !== "JOINING").map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
          <Field label="Effective from" required error={errs.effectiveFrom} hint={!first && cur ? `After ${dateLabel(cur.effectiveFrom)}; the current salary ends the day before` : undefined}><input type="date" value={f.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} /></Field>
          <Field label="Reason" error={errs.revisionReason}><input value={f.revisionReason} maxLength={300} placeholder={first ? "" : "e.g. Annual appraisal"} onChange={(e) => set("revisionReason", e.target.value)} /></Field>
        </FormGrid>
      )}
    </Modal>
  );
}
