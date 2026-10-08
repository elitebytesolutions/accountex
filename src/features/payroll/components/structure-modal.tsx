"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { computeLines, type PayrollOptions, type SalaryComponent, type SalaryStructure } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { RecordModal } from "@/features/hr/components/record-modal";
import { lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createStructure, deleteStructure, structureStatus, updateStructure } from "../api";

type Line = { id?: string; componentId: string; calcMethod: string; value: string; displayText: string };
type Tier = { id?: string; achievementFromPct: string; achievementToPct: string; commissionRatePct: string };
const fmt = (n: number | null) => (n === null ? "varies" : n.toLocaleString("en-US", { maximumFractionDigits: 0 }));
const blank = (v: string) => (v.trim() === "" ? null : Number(v));

/** Structure editor (no template: built in the template's modal style). Lines override a component's calculation per grade. */
export function StructureModal({ row, components, opts, can, onClose, onSaved, onDuplicate }: {
  row: SalaryStructure | null; components: SalaryComponent[]; opts: PayrollOptions; can: { edit: boolean };
  onClose: () => void; onSaved: () => void; onDuplicate: (s: SalaryStructure) => void;
}) {
  const toast = useToast();
  const lookups = useLookups(["SalaryComponentCalcMethod"]);
  const [f, setF] = useState({
    code: row?.code ?? "", name: row?.name ?? "", structureKind: row?.structureKind ?? "GRADE", gradeId: row?.grade?.id ?? "", basicMin: row?.basicMin?.toString() ?? "",
    basicMax: row?.basicMax?.toString() ?? "", commissionCapPercentOfBasic: row?.commissionCapPercentOfBasic?.toString() ?? "", description: row?.description ?? "", effectiveFrom: row?.effectiveFrom ?? "",
  });
  const basic = components.find((c) => c.systemRole === "BASIC");
  const [lines, setLines] = useState<Line[]>(row ? row.lines.map((l) => ({ id: l.id, componentId: l.component.id, calcMethod: l.calcMethod ?? "", value: (l.calcMethod === "FIXED" || (!l.calcMethod && l.fixedAmount !== null) ? l.fixedAmount : l.percent)?.toString() ?? "", displayText: l.displayText ?? "" }))
    : basic ? [{ componentId: basic.id, calcMethod: "", value: "", displayText: "" }] : []);
  const [tiers, setTiers] = useState<Tier[]>(row?.tiers.map((t) => ({ id: t.id, achievementFromPct: String(t.achievementFromPct), achievementToPct: t.achievementToPct?.toString() ?? "", commissionRatePct: String(t.commissionRatePct) })) ?? []);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const retired = row?.status === "RETIRED";
  const editable = (row ? can.edit : true) && !retired;
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const comp = (id: string) => components.find((c) => c.id === id);
  const method = (l: Line) => l.calcMethod || comp(l.componentId)?.calcMethod || "FIXED";

  const toLine = (l: Line) => {
    const m = method(l);
    const v = blank(l.value);
    return { ...(l.id && { id: l.id }), componentId: l.componentId, calcMethod: l.calcMethod || null, percent: m === "PERCENT_OF" ? v : null, fixedAmount: m === "FIXED" ? v : null, quantity: null, formula: null, displayText: l.displayText || null };
  };
  const mid = (() => { const a = blank(f.basicMin); const b = blank(f.basicMax); return a !== null && b !== null ? (a + b) / 2 : a ?? b ?? 0; })();
  const preview = computeLines(lines.filter((l) => l.componentId).map(toLine), components.map((c) => ({ ...c, baseComponentId: c.baseComponent?.id ?? null })), mid);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); onSaved(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const body = () => ({
    ...f, gradeId: f.gradeId || null, effectiveFrom: f.effectiveFrom || undefined, lines: lines.filter((l) => l.componentId).map(toLine),
    tiers: f.structureKind === "ADDON" ? tiers.map((t) => ({ ...(t.id && { id: t.id }), achievementFromPct: t.achievementFromPct, achievementToPct: t.achievementToPct, commissionRatePct: t.commissionRatePct })) : [],
  });
  const save = () => run(() => (row ? updateStructure(row.id, { ...body(), rowVersion: row.rowVersion }) : createStructure(body())), row ? `${f.code} saved` : "Structure created as draft");
  const used = new Set(lines.map((l) => l.componentId));

  return (
    <RecordModal open xl onClose={onClose} busy={busy} title={row ? `Structure — ${row.name}` : "New salary structure"}
      subtitle={row ? `${row.code} · ${row.status === "DRAFT" ? "Draft" : row.status === "ACTIVE" ? "Active" : "Retired"}${row.staff ? ` · ${row.staff} employee${row.staff === 1 ? "" : "s"}` : ""}` : "Starts as a draft; activate it to use it for salaries."}
      history={row ? { schema: "Payroll", table: "SalaryStructures", id: row.id } : null} canSave={editable} saveLabel={row ? "Save structure" : "Create draft"} onSave={save}
      active={row?.status === "ACTIVE"} canToggle={can.edit && !retired} toggleLabels={["Retire", "Activate"]} canDelete={can.edit}
      onToggle={() => row && run(() => structureStatus(row.id, row.status === "ACTIVE" ? "retire" : "activate", row.rowVersion), row.status === "ACTIVE" ? `${row.code} retired` : `${row.code} activated`)}
      onDelete={async () => { if (row) await run(() => deleteStructure(row.id, row.rowVersion), `${row.code} deleted`); }}
      deleteNote="Only a structure no salary uses can be deleted; otherwise retire it."
      extra={row && can.edit ? <button type="button" className="btn ghost" onClick={() => onDuplicate(row)}><Copy />Duplicate</button> : undefined}>
      <FormGrid cols={3}>
        <Field label="Code" required error={errs.code}><input value={f.code} maxLength={10} disabled={!editable} placeholder="G2" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
        <Field label="Name" required error={errs.name}><input value={f.name} maxLength={80} disabled={!editable} placeholder="Officers & Executives" onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Kind" error={errs.structureKind}><select value={f.structureKind} disabled={!editable || !!row?.staff} onChange={(e) => set("structureKind", e.target.value)}><option value="GRADE">Grade structure</option><option value="ADDON">Add-on (commission plan)</option></select></Field>
        <Field label={f.structureKind === "ADDON" ? "For grade (optional)" : "Grade"} required={f.structureKind !== "ADDON"} error={errs.gradeId}>
          <select value={f.gradeId} disabled={!editable} onChange={(e) => set("gradeId", e.target.value)}><option value="">{opts.grades.length ? "Choose…" : "No grades yet"}</option>{opts.grades.map((g) => <option key={g.id} value={g.id}>{g.code} ({g.name})</option>)}</select>
        </Field>
        {f.structureKind !== "ADDON" && <>
        <Field label="Basic from (Rs)" error={errs.basicMin}><input inputMode="numeric" value={f.basicMin} disabled={!editable} onChange={(e) => set("basicMin", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        <Field label="Basic to (Rs)" error={errs.basicMax}><input inputMode="numeric" value={f.basicMax} disabled={!editable} onChange={(e) => set("basicMax", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        </>}
        {f.structureKind === "ADDON" && <Field label="Commission cap (% of basic)" error={errs.commissionCapPercentOfBasic}><input inputMode="decimal" value={f.commissionCapPercentOfBasic} disabled={!editable} onChange={(e) => set("commissionCapPercentOfBasic", e.target.value.replace(/[^\d.]/g, ""))} /></Field>}
        <Field label="Effective from" error={errs.effectiveFrom}><input type="date" value={f.effectiveFrom} disabled={!editable} onChange={(e) => set("effectiveFrom", e.target.value)} /></Field>
        <Field label="Description" full error={errs.description}><input value={f.description} maxLength={200} disabled={!editable} placeholder="e.g. Staff — Warehouse & Drivers" onChange={(e) => set("description", e.target.value)} /></Field>
      </FormGrid>

      <div className="form-section"><h4>Components</h4><p>Leave the value empty to use the component&apos;s own calculation.{f.structureKind === "GRADE" && ` Preview at basic Rs ${fmt(mid)} (mid of the band).`}</p></div>
      {errs.lines && <p className="hint text-danger">{errs.lines}</p>}
      <div className="table-wrap"><table className="tbl lines">
        <thead><tr><th>Component</th><th>Calculation</th><th className="num">Value</th><th>Display</th><th className="num">Monthly (Rs)</th><th /></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const c = comp(l.componentId);
            const m = method(l);
            const amount = preview.lines.find((p) => p.componentId === l.componentId);
            return (
              <tr key={l.id ?? `n${i}`}>
                <td><select className="cell-input" value={l.componentId} disabled={!editable} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, componentId: e.target.value, calcMethod: "", value: "" } : y)))}>
                  <option value="">Choose…</option>
                  {components.filter((k) => k.status === "ACTIVE" || k.id === l.componentId).filter((k) => k.id === l.componentId || !used.has(k.id)).map((k) => <option key={k.id} value={k.id}>{k.code} · {k.name}</option>)}
                </select>{errs[`lines.${i}.componentId`] && <small className="hint text-danger">{errs[`lines.${i}.componentId`]}</small>}</td>
                <td>{c?.systemRole === "BASIC" ? <span className="muted">The basic</span> : (
                  <select className="cell-input" value={l.calcMethod} disabled={!editable || !c} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, calcMethod: e.target.value } : y)))}>
                    <option value="">As component ({c ? lookupOptions(lookups, "SalaryComponentCalcMethod", c.calcMethod).find((o) => o.code === c.calcMethod)?.label ?? c.calcMethod : "—"})</option>
                    <option value="FIXED">Fixed amount</option>{c?.calcMethod === "PERCENT_OF" && <option value="PERCENT_OF">Percentage</option>}
                  </select>)}</td>
                <td className="num">{c?.systemRole === "BASIC" || (m !== "FIXED" && m !== "PERCENT_OF") ? <span className="muted">—</span> : (
                  <input className="cell-input" inputMode="decimal" value={l.value} disabled={!editable} placeholder={m === "PERCENT_OF" ? `${c?.percent ?? ""}%` : c?.fixedAmount?.toString() ?? "Rs"} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, value: e.target.value.replace(/[^\d.]/g, "") } : y)))} />)}</td>
                <td><input className="cell-input" value={l.displayText} maxLength={60} disabled={!editable} placeholder={amount?.basis ?? ""} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, displayText: e.target.value } : y)))} /></td>
                <td className={cn("num", c?.componentType === "DEDUCTION" && "cr")}>{amount ? fmt(amount.monthly) : "—"}</td>
                <td className="actions">{editable && <button type="button" className="icon-btn-sm" aria-label="Remove" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}><Trash2 /></button>}</td>
              </tr>
            );
          })}
          {f.structureKind === "GRADE" && <tr className="total"><td colSpan={4}>Gross (mid)</td><td className="num">{fmt(preview.gross)}</td><td /></tr>}
        </tbody>
      </table></div>
      {editable && <button type="button" className="btn secondary sm mt" onClick={() => setLines((x) => [...x, { componentId: "", calcMethod: "", value: "", displayText: "" }])}><Plus />Add component</button>}

      {f.structureKind === "ADDON" && (
        <>
          <div className="form-section"><h4>Commission tiers</h4><p>By sales-target achievement; the last tier may be open-ended.</p></div>
          {errs.tiers && <p className="hint text-danger">{errs.tiers}</p>}
          <div className="table-wrap"><table className="tbl lines">
            <thead><tr><th className="num">Achievement from %</th><th className="num">to %</th><th className="num">Commission % of sales</th><th /></tr></thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={t.id ?? `t${i}`}>
                  {(["achievementFromPct", "achievementToPct", "commissionRatePct"] as const).map((k) => (
                    <td key={k} className="num"><input className="cell-input" inputMode="decimal" value={t[k]} disabled={!editable} placeholder={k === "achievementToPct" ? "open" : ""} onChange={(e) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, [k]: e.target.value.replace(/[^\d.]/g, "") } : y)))} /></td>
                  ))}
                  <td className="actions">{editable && <button type="button" className="icon-btn-sm" aria-label="Remove" onClick={() => setTiers((x) => x.filter((_, j) => j !== i))}><Trash2 /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {editable && <button type="button" className="btn secondary sm mt" onClick={() => setTiers((x) => [...x, { achievementFromPct: x.length ? x[x.length - 1]!.achievementToPct || "" : "0", achievementToPct: "", commissionRatePct: "" }])}><Plus />Add tier</button>}
        </>
      )}
    </RecordModal>
  );
}
