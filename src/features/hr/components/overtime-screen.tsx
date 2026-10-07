"use client";

import { AlertTriangle, BarChart3, Hourglass, Plus, Search, Send, Settings2, Timer, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { OvertimePolicy } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createOvertimePolicy, deleteOvertimePolicy, listOvertimePolicies, overtimeGrades, setOvertimePolicyActive, updateOvertimePolicy } from "../api";
import { RecordModal } from "./record-modal";

type Grade = { id: string; code: string; name: string };
const MONTH = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
const x = (n: number) => `${Number.isInteger(n) ? n.toFixed(1) : n}×`;

/** Template app/hr/overtime (50-hr-core.html): the policy panel and its modal now; claims, approvals and payroll posting arrive with attendance. */
export function OvertimeScreen({ can }: { can: { create: boolean; edit: boolean; remove: boolean } }) {
  const toast = useToast();
  const lookups = useLookups(["HourlyRateBasis", "Rounding"]);
  const [rows, setRows] = useState<OvertimePolicy[] | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<{ row: OvertimePolicy | null } | null>(null);
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listOvertimePolicies(), overtimeGrades()])
      .then(([r, g]) => { if (!cancelled) { setRows(r); setGrades(g); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load overtime" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const active = rows?.find((p) => p.isActive) ?? null;
  const open = (row: OvertimePolicy | null) => {
    setErrs({});
    setEdit({ row });
    setF({
      name: row?.name ?? (active ? "" : "Standard"), statuteNote: row?.statuteNote ?? "", weekdayMultiplier: String(row?.weekdayMultiplier ?? 1.5), weeklyOffMultiplier: String(row?.weeklyOffMultiplier ?? 2),
      holidayMultiplier: String(row?.holidayMultiplier ?? 2), hourlyRateBasis: row?.hourlyRateBasis ?? "GROSS_26_8", dailyCapHours: row?.dailyCapHours?.toString() ?? "", monthlyCapHours: row?.monthlyCapHours?.toString() ?? "",
      minMinutes: String(row?.minMinutes ?? 30), rounding: row?.rounding ?? "NEAREST_30", eligibleUpToGradeId: row?.eligibleUpToGrade?.id ?? "", requiresPreApproval: row?.requiresPreApproval ?? true,
      allowCompOff: row?.allowCompOff ?? true, effectiveFrom: row?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    });
  };
  const set = (k: string, v: string | boolean) => { setF((p) => ({ ...p, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => edit && run(() => (edit.row ? updateOvertimePolicy(edit.row.id, { ...f, rowVersion: edit.row.rowVersion }) : createOvertimePolicy(f)), "Overtime policy saved");
  const gradeLabel = (p: OvertimePolicy) => {
    if (!p.eligibleUpToGrade) return "All grades";
    const first = grades[0];
    return first && first.id !== p.eligibleUpToGrade.id ? `${first.code} to ${p.eligibleUpToGrade.code} only` : `${p.eligibleUpToGrade.code} only`;
  };
  const num = (k: string, props: Record<string, unknown> = {}) => <input inputMode="decimal" value={f[k] as string} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ""))} {...props} />;

  return (
    <>
      <PageHead eyebrow="HR / Attendance" title="Overtime" description={`Overtime claims, approvals and payroll posting · ${MONTH} cycle.`}
        actions={<>
          <button className="btn secondary" type="button" disabled={!active && !can.create} onClick={() => (active ? open(active) : open(null))}><Settings2 />OT policy</button>
          <button className="btn secondary" type="button" disabled title="Approved overtime posts with payroll runs (later phase)"><Send />Push to payroll</button>
          <button className="btn primary" type="button" disabled title="Overtime claims arrive with attendance"><Plus />Log overtime</button>
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>OT hours</span><span className="icon-well"><Timer /></span></div><strong>—</strong><small>From approved claims (with attendance)</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>OT cost</span><span className="icon-well"><Wallet /></span></div><strong>—</strong><small>Paid with payroll</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Pending approval</span><span className="icon-well"><Hourglass /></span></div><strong>0</strong><small>No claims yet</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Over monthly cap</span><span className="icon-well"><AlertTriangle /></span></div><strong>0</strong><small>{active?.monthlyCapHours ? `Cap ${active.monthlyCapHours} hrs / employee` : "No monthly cap"}</small></div>
      </div>

      <div className="split">
        <div>
          <div className="panel flush">
            <div className="panel-head"><div><h3>Overtime claims</h3><p>{MONTH} · paid with payroll</p></div></div>
            <div className="toolbar">
              <label className="search-field"><Search /><input placeholder="Search employee or OT #…" disabled /></label>
              <div className="chips"><button type="button" className="active">All <i>0</i></button><button type="button">Pending <i>0</i></button><button type="button">Approved <i>0</i></button><button type="button">Rejected <i>0</i></button></div>
            </div>
            <EmptyState icon={<Timer />} title="No overtime claims yet" description="Claims are logged from attendance (or on behalf of an employee) once attendance is live. They are priced with the active policy." />
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Overtime policy</h3><p>{active?.statuteNote ?? (active ? active.name : "No active policy")}</p></div>
              <div className="panel-actions">{active && can.edit && <button className="btn ghost sm" type="button" onClick={() => open(active)}>Edit</button>}{!active && can.create && <button className="btn ghost sm" type="button" onClick={() => open(null)}><Plus />New</button>}</div></div>
            {!rows ? <Skeleton style={{ height: 200 }} /> : active ? (
              <div className="dl">
                <div><span>Weekday rate</span><b>{x(active.weekdayMultiplier)} hourly rate</b></div>
                <div><span>Weekly off / public holiday</span><b>{active.weeklyOffMultiplier === active.holidayMultiplier ? `${x(active.weeklyOffMultiplier)} hourly rate` : `${x(active.weeklyOffMultiplier)} / ${x(active.holidayMultiplier)}`}</b></div>
                <div><span>Hourly rate basis</span><b>{labelOf(lookups, "HourlyRateBasis", active.hourlyRateBasis).replace(/÷ (\d+) ÷ (\d+)/, "÷ $1 days ÷ $2 hrs")}</b></div>
                <div><span>Minimum to count</span><b>{active.minMinutes} min after shift end</b></div>
                <div><span>Daily cap</span><b>{active.dailyCapHours ? `${active.dailyCapHours} hrs` : "None"}</b></div>
                <div><span>Monthly cap</span><b>{active.monthlyCapHours ? `${active.monthlyCapHours} hrs` : "None"}</b></div>
                <div><span>Eligible grades</span><b>{gradeLabel(active)}</b></div>
                <div><span>Pre-approval</span><b>{active.requiresPreApproval ? "Required (ESS request)" : "Not required"}</b></div>
                <div><span>Effective from</span><b>{dateLabel(active.effectiveFrom)}</b></div>
              </div>
            ) : <EmptyState title="No active policy" description="Overtime can't be priced until one policy is active." />}
            {rows && rows.filter((p) => !p.isActive).length > 0 && (
              <div className="list mt">
                {rows.filter((p) => !p.isActive).map((p) => (
                  <button key={p.id} type="button" className="list-item" onClick={() => open(p)}><span className="icon-well"><Settings2 /></span><div><b>{p.name}</b><small>Inactive · from {dateLabel(p.effectiveFrom)}</small></div></button>
                ))}
              </div>
            )}
            {active && can.create && <button className="btn ghost sm mt" type="button" onClick={() => open(null)}><Plus />New policy (inactive until switched)</button>}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>OT hours by department</h3><p>{MONTH}</p></div></div>
            <EmptyState icon={<BarChart3 />} title="No overtime yet" description="Hours by department appear once claims are approved." />
          </div>
        </div>
      </div>

      {edit && (
        <RecordModal open wide onClose={() => setEdit(null)} busy={busy} title={edit.row ? "Overtime policy" : "New overtime policy"} subtitle="Changes apply from the next payroll run."
          history={edit.row ? { schema: "HumanResources", table: "OvertimePolicies", id: edit.row.id } : null} active={edit.row?.isActive}
          canSave={edit.row ? can.edit : can.create} canToggle={can.edit} canDelete={can.remove} saveLabel="Save policy" onSave={save}
          onToggle={() => edit.row && run(() => setOvertimePolicyActive(edit.row!.id, !edit.row!.isActive, edit.row!.rowVersion), edit.row.isActive ? "Policy deactivated" : "Policy activated")}
          onDelete={async () => { if (edit.row) await run(() => deleteOvertimePolicy(edit.row!.id, edit.row!.rowVersion), "Policy deleted"); }}
          deleteNote="Only a policy no overtime claim uses can be deleted.">
          <FormGrid cols={3}>
            <Field label="Policy name" required error={errs.name}><input value={f.name as string} maxLength={60} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Statute" error={errs.statuteNote}><input value={f.statuteNote as string} maxLength={120} onChange={(e) => set("statuteNote", e.target.value)} /></Field>
            <Field label="Effective from" error={errs.effectiveFrom}><input type="date" value={f.effectiveFrom as string} onChange={(e) => set("effectiveFrom", e.target.value)} /></Field>
            <Field label="Weekday multiplier" error={errs.weekdayMultiplier}>{num("weekdayMultiplier")}</Field>
            <Field label="Weekly off multiplier" error={errs.weeklyOffMultiplier}>{num("weeklyOffMultiplier")}</Field>
            <Field label="Public holiday multiplier" error={errs.holidayMultiplier}>{num("holidayMultiplier")}</Field>
            <Field label="Hourly rate basis" error={errs.hourlyRateBasis}><select value={f.hourlyRateBasis as string} onChange={(e) => set("hourlyRateBasis", e.target.value)}>{lookupOptions(lookups, "HourlyRateBasis", f.hourlyRateBasis as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Daily cap (hrs)" error={errs.dailyCapHours}>{num("dailyCapHours", { placeholder: "None" })}</Field>
            <Field label="Monthly cap (hrs)" error={errs.monthlyCapHours}>{num("monthlyCapHours", { placeholder: "None" })}</Field>
            <Field label="Min. minutes to count" error={errs.minMinutes}>{num("minMinutes")}</Field>
            <Field label="Rounding" error={errs.rounding}><select value={f.rounding as string} onChange={(e) => set("rounding", e.target.value)}>{lookupOptions(lookups, "Rounding", f.rounding as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Eligible up to grade" error={errs.eligibleUpToGradeId}><select value={f.eligibleUpToGradeId as string} onChange={(e) => set("eligibleUpToGradeId", e.target.value)}><option value="">All</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.code} ({g.name})</option>)}</select></Field>
            <Check full label="Require pre-approval via ESS" checked={f.requiresPreApproval as boolean} onChange={(e) => set("requiresPreApproval", e.target.checked)} />
            <Check full label="Allow compensatory off as alternative" checked={f.allowCompOff as boolean} onChange={(e) => set("allowCompOff", e.target.checked)} />
          </FormGrid>
          {edit.row && !edit.row.isActive && active && <p className={cn("small muted mt")}>Only one policy can be active: deactivate “{active.name}” before activating this one.</p>}
        </RecordModal>
      )}
    </>
  );
}
