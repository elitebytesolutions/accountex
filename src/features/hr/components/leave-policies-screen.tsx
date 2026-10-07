"use client";

import { Baby, Ban, CalendarDays, Coffee, FileText, Heart, Landmark, Pencil, Plus, Repeat, Sun, Thermometer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { EMPLOYMENT_TYPES, type LeaveType } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createLeaveType, deleteLeaveType, leaveTypeOptions, listLeaveTypes, setLeaveTypeActive, updateLeaveType } from "../api";
import { RecordModal } from "./record-modal";

type Opts = Awaited<ReturnType<typeof leaveTypeOptions>>;
type Rule = { scope: "BRANCH" | "GRADE"; branchId: string; gradeId: string; isIncluded: boolean; daysOverride: string };
type Form = Record<string, string | boolean | string[] | Rule[]>;
const ICON: Record<string, ReactNode> = { ANNUAL: <Sun />, CASUAL: <Coffee />, SICK: <Thermometer />, MATERNITY: <Baby />, PATERNITY: <Heart />, HAJJ_UMRAH: <Landmark />, UNPAID: <Ban />, COMP_OFF: <Repeat /> };
const NUMS = ["daysPerYear", "accrualAmount", "carryForwardMax", "accumulationCap", "carryExpiryMonths", "encashMaxDays", "attachmentAfterDays", "backdateDays", "minNoticeDays", "maxConsecutiveDays", "maxPerMonth", "maxTimesInService", "applyWindowDays", "compOffExpiryDays", "hrApprovalAboveDays", "sortOrder"] as const;
const TEXTS = ["code", "name", "category", "colour", "unit", "description", "statuteNote", "accrualMethod", "carryForwardMode", "encashmentMode", "encashBasis", "deductionBasis", "gender", "availableAfter", "probationRule", "approvalWorkflow"] as const;
const BOOLS = ["isPaid", "prorateNewJoiners", "sandwichRule", "allowHalfDay", "allowNegative", "blockInPayrollLock", "attachmentRequired"] as const;
const TAB_OF: Record<string, string> = { accrualAmount: "accrual", carryForwardMax: "accrual", encashBasis: "accrual", encashmentMode: "accrual", deductionBasis: "accrual", attachmentAfterDays: "rules", employmentTypes: "eligibility", rules: "eligibility" };
const n = (x: number | null) => (x === null ? "" : String(x));
const days = (x: number) => `${x} day${x === 1 ? "" : "s"}`;

/** Template app/hr/leave/policies (50-hr-core.html): leave type cards, the policy matrix and the 4-tab policy modal. */
export function LeavePoliciesScreen({ can }: { can: { create: boolean; edit: boolean; remove: boolean } }) {
  const toast = useToast();
  const lookups = useLookups(["LeaveTypeCategory", "LeaveTypeColour", "LeaveTypeUnit", "AccrualMethod", "CarryForwardMode", "EncashmentMode", "EncashBasis", "DeductionBasis", "LeaveTypeGender", "AvailableAfter", "ProbationRule", "ApprovalWorkflow", "EmploymentType"]);
  const [rows, setRows] = useState<LeaveType[] | null>(null);
  const [opts, setOpts] = useState<Opts | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<{ row: LeaveType | null } | null>(null);
  const [tab, setTab] = useState("general");
  const [f, setF] = useState<Form>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listLeaveTypes(), leaveTypeOptions()])
      .then(([r, o]) => { if (!cancelled) { setRows(r); setOpts(o); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load leave policies" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((x) => x + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const L = (type: string, code: string | null) => (code ? labelOf(lookups, type, code) : "—");
  const open = (row: LeaveType | null) => {
    setErrs({});
    setTab("general");
    setEdit({ row });
    setF({
      ...Object.fromEntries(TEXTS.map((k) => [k, row ? (row[k] ?? "") : ""])), ...Object.fromEntries(NUMS.map((k) => [k, row ? n(row[k]) : ""])), ...Object.fromEntries(BOOLS.map((k) => [k, row ? row[k] : false])),
      ...(!row && { category: "OTHER", colour: "GREEN", unit: "DAYS", accrualMethod: "UPFRONT", carryForwardMode: "NONE", encashmentMode: "NOT_ALLOWED", gender: "ALL", availableAfter: "JOINING", probationRule: "ALLOWED", approvalWorkflow: "MANAGER_HR", isPaid: true, prorateNewJoiners: true, allowHalfDay: true, daysPerYear: "0", sortOrder: String((rows?.length ?? 0) + 1) }),
      employmentTypes: row?.employmentTypes ?? ["PERMANENT", "CONTRACT"],
      rules: (row?.rules ?? []).map((r) => ({ scope: r.scope as "BRANCH" | "GRADE", branchId: r.branch?.id ?? "", gradeId: r.grade?.id ?? "", isIncluded: r.isIncluded, daysOverride: n(r.daysOverride) })),
    });
  };
  const set = (k: string, val: Form[string]) => { setF((x) => ({ ...x, [k]: val })); setErrs((x) => ({ ...x, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); reload(); } catch (e) {
      const fe = apiFieldErrors(e);
      setErrs(fe);
      const first = Object.keys(fe)[0];
      if (first) setTab(TAB_OF[first.split(".")[0]!] ?? "general");
      toast(apiMessage(e, "Could not save"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const body = () => ({ ...f, rules: (f.rules as Rule[]).map((r) => ({ ...r, branchId: r.scope === "BRANCH" ? r.branchId : null, gradeId: r.scope === "GRADE" ? r.gradeId : null })) });
  const save = () => {
    if (!edit) return;
    const r = edit.row;
    return run(() => (r ? updateLeaveType(r.id, { ...body(), rowVersion: r.rowVersion }) : createLeaveType(body())), r ? `${f.name} saved` : "Leave type created");
  };

  const facts = (t: LeaveType): [string, string][] => {
    const out: [string, string][] = [["Entitlement", t.accrualMethod === "ONCE_IN_SERVICE" ? `${days(t.daysPerYear)}, once in service` : t.accrualMethod === "EVENT_BASED" ? `${days(t.daysPerYear)}${t.statuteNote ? ` (${t.statuteNote})` : ""}` : `${t.isPaid ? "" : "Up to "}${days(t.daysPerYear)} / year`]];
    if (t.accrualMethod === "MONTHLY" || t.accrualMethod === "QUARTERLY") out.push(["Accrual", `${t.accrualAmount} days ${t.accrualMethod === "MONTHLY" ? "monthly" : "quarterly"}`]);
    else if (t.accrualMethod === "UPFRONT") out.push(["Accrual", "Upfront each leave year"]);
    if (t.carryForwardMode === "CAPPED") out.push(["Carry forward", `Max ${days(t.carryForwardMax ?? 0)}`]);
    else if (t.carryForwardMode === "UNLIMITED") out.push(["Carry forward", t.accumulationCap ? `Accumulate to ${t.accumulationCap}` : "Unlimited"]);
    else if (t.isPaid && t.accrualMethod !== "EVENT_BASED" && t.accrualMethod !== "ONCE_IN_SERVICE") out.push(["Carry forward", "None — lapses"]);
    if (t.encashmentMode !== "NOT_ALLOWED") out.push(["Encashment", `Up to ${days(t.encashMaxDays ?? 0)} ${t.encashmentMode === "YEAR_END" ? "at year end" : "at exit"}`]);
    if (t.maxTimesInService) out.push(["Frequency", t.maxTimesInService === 1 ? "Once in service" : `${t.maxTimesInService} times in service`]);
    if (t.applyWindowDays) out.push(["Apply within", `Event ± ${t.applyWindowDays} days`]);
    if (t.maxConsecutiveDays && t.category === "CASUAL") out.push(["Max at a time", days(t.maxConsecutiveDays)]);
    if (t.attachmentRequired) out.push([t.category === "SICK" ? "Certificate" : "Proof", t.attachmentAfterDays ? `Required > ${days(t.attachmentAfterDays)}` : "Required"]);
    if (t.backdateDays) out.push(["Backdated", `Up to ${days(t.backdateDays)}`]);
    if (!t.isPaid && t.deductionBasis) out.push(["Deduction", L("DeductionBasis", t.deductionBasis)]);
    if (t.category === "CASUAL") out.push(["Half day", t.allowHalfDay ? "Allowed" : "Not allowed"]);
    out.push(["Eligible after", L("AvailableAfter", t.availableAfter)]);
    if (t.approvalWorkflow === "HR" || t.approvalWorkflow === "MANAGER_HR_CEO" || !t.isPaid) out.push(["Approval", L("ApprovalWorkflow", t.approvalWorkflow)]);
    return out.slice(0, 5);
  };
  const badge = (t: LeaveType) => t.status !== "ACTIVE" ? <span className="badge neutral">Inactive</span> : t.gender === "FEMALE" ? <span className="badge violet">Female only</span>
    : t.gender === "MALE" ? <span className="badge info">Male only</span> : !t.isPaid ? <span className="badge danger">Deducts pay</span> : <span className="badge good">Active</span>;

  const sel = (k: string, type: string, empty?: string) => <select value={f[k] as string} onChange={(e) => set(k, e.target.value)}>{empty !== undefined && <option value="">{empty}</option>}{lookupOptions(lookups, type, f[k] as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>;
  const num = (k: string, props: Record<string, unknown> = {}) => <input type="number" min={0} step="any" value={f[k] as string} onChange={(e) => set(k, e.target.value)} {...props} />;
  const sw = (k: string, label: string) => <Switch label={label} checked={f[k] as boolean} onChange={(e) => set(k, e.target.checked)} />;
  const rules = (f.rules ?? []) as Rule[];
  const setRule = (i: number, patch: Partial<Rule>) => set("rules", rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      <PageHead eyebrow={<>HR / Leave / Policies</>} title="Leave Types & Policies" description="Entitlements aligned with the West Pakistan Shops & Establishments Ordinance 1969 and company policy."
        actions={<>
          <button className="btn secondary" type="button" onClick={() => window.print()}><FileText />Policy PDF</button>
          {can.create && <button className="btn primary" type="button" onClick={() => open(null)}><Plus />New leave type</button>}
        </>} />

      {!rows ? <Skeleton style={{ height: 320 }} /> : !rows.length ? (
        <div className="panel"><EmptyState icon={<CalendarDays />} title="No leave types yet" description={can.create ? "Add the leave types your company offers." : "Leave types HR adds appear here."} /></div>
      ) : (
        <>
          <div className="card-grid mb">
            {rows.map((t) => (
              <div key={t.id} className={cn("card", t.status !== "ACTIVE" && "muted")}>
                <div className="row"><span className="icon-well">{ICON[t.category] ?? <CalendarDays />}</span><div><b>{t.name}</b><small className="muted" style={{ display: "block" }}>Code {t.code} · {t.isPaid ? "paid" : "unpaid"}</small></div><span className="spacer" />{badge(t)}</div>
                <div className="dl mt">{facts(t).map(([k, val]) => <div key={k}><span>{k}</span><b>{val}</b></div>)}</div>
                {can.edit && <div className="row mt"><button className="btn secondary sm" type="button" onClick={() => open(t)}><Pencil />Edit</button></div>}
              </div>
            ))}
          </div>

          <div className="panel flush">
            <div className="panel-head"><div><h3>Policy matrix</h3><p>Rules applied by the leave engine</p></div></div>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Leave type</th><th className="num">Days</th><th>Accrual</th><th>Carry forward</th><th>Encashment</th><th>Sandwich rule</th><th>Gender</th><th>Probation</th><th>Half day</th><th>Approval</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={cn(t.status !== "ACTIVE" && "muted")} style={can.edit ? { cursor: "pointer" } : undefined} onClick={() => can.edit && open(t)}>
                    <td><b>{t.name.replace(/ \(.*\)$/, "")}</b></td><td className="num">{t.daysPerYear}</td>
                    <td>{t.accrualMethod === "MONTHLY" || t.accrualMethod === "QUARTERLY" ? `${L("AccrualMethod", t.accrualMethod)} ${t.accrualAmount}` : t.accrualMethod === "NONE" ? "—" : L("AccrualMethod", t.accrualMethod)}</td>
                    <td>{t.carryForwardMode === "CAPPED" ? `Max ${t.carryForwardMax}` : t.carryForwardMode === "UNLIMITED" ? (t.accumulationCap ? `Accumulate to ${t.accumulationCap}` : "Unlimited") : t.accrualMethod === "EVENT_BASED" || t.accrualMethod === "ONCE_IN_SERVICE" || !t.isPaid ? "—" : "Lapses"}</td>
                    <td>{t.encashmentMode === "NOT_ALLOWED" ? <span className="badge neutral">No</span> : <span className="badge good">Yes — {days(t.encashMaxDays ?? 0)}</span>}</td>
                    <td>{t.sandwichRule ? <span className="badge warn">Applied</span> : <span className="badge neutral">Not applied</span>}</td>
                    <td>{t.gender === "ALL" ? "All" : t.gender === "FEMALE" ? "Female" : "Male"}</td>
                    <td>{L("ProbationRule", t.probationRule)}</td><td>{t.allowHalfDay ? "Yes" : "No"}</td><td>{L("ApprovalWorkflow", t.approvalWorkflow)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </>
      )}

      {edit && (
        <RecordModal open xl onClose={() => setEdit(null)} busy={busy} title={edit.row ? `Leave type — ${edit.row.name}` : "New leave type"} subtitle="Changes take effect from the next accrual cycle."
          history={edit.row ? { schema: "HumanResources", table: "LeaveTypes", id: edit.row.id } : null} active={edit.row?.status === "ACTIVE"}
          canSave={edit.row ? can.edit : can.create} canToggle={can.edit} canDelete={can.remove} saveLabel="Save policy" onSave={save}
          onToggle={() => edit.row && run(() => setLeaveTypeActive(edit.row!.id, edit.row!.status !== "ACTIVE", edit.row!.rowVersion), `${edit.row.name} ${edit.row.status === "ACTIVE" ? "deactivated" : "activated"}`)}
          onDelete={async () => { if (edit.row) await run(() => deleteLeaveType(edit.row!.id, edit.row!.rowVersion), `${edit.row.name} deleted`); }}
          deleteNote="Only a leave type no request or balance uses can be deleted; otherwise deactivate it.">
          <div className="tabs">
            {([["general", "General"], ["accrual", "Accrual & carry forward"], ["rules", "Rules"], ["eligibility", "Eligibility"]] as const).map(([k, l]) => <button key={k} type="button" className={cn(tab === k && "active")} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === "general" && (
            <FormGrid cols={3}>
              <Field label="Name" required error={errs.name}><input value={f.name as string} maxLength={60} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Code" required error={errs.code}><input value={f.code as string} maxLength={4} placeholder="AL" onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} /></Field>
              <Field label="Category" error={errs.category}>{sel("category", "LeaveTypeCategory")}</Field>
              <Field label="Colour" error={errs.colour}>{sel("colour", "LeaveTypeColour")}</Field>
              <Field label="Paid / unpaid" error={errs.isPaid}><select value={f.isPaid ? "1" : "0"} onChange={(e) => set("isPaid", e.target.value === "1")}><option value="1">Paid</option><option value="0">Unpaid</option></select></Field>
              <Field label="Days per year" error={errs.daysPerYear}>{num("daysPerYear", { max: 366 })}</Field>
              <Field label="Unit" error={errs.unit}>{sel("unit", "LeaveTypeUnit")}</Field>
              <Field label="Statute" error={errs.statuteNote}><input value={f.statuteNote as string} maxLength={120} placeholder="e.g. Shops & Establishments Ordinance 1969" onChange={(e) => set("statuteNote", e.target.value)} /></Field>
              <Field label="Display order" error={errs.sortOrder}>{num("sortOrder")}</Field>
              <Field label="Description (shown on ESS)" full error={errs.description}><textarea rows={2} maxLength={300} value={f.description as string} onChange={(e) => set("description", e.target.value)} /></Field>
            </FormGrid>
          )}
          {tab === "accrual" && (
            <FormGrid cols={3}>
              <Field label="Accrual method" error={errs.accrualMethod}>{sel("accrualMethod", "AccrualMethod")}</Field>
              <Field label="Accrual per period" error={errs.accrualAmount}>{num("accrualAmount", { disabled: f.accrualMethod !== "MONTHLY" && f.accrualMethod !== "QUARTERLY" })}</Field>
              <Field label="Pro-rate new joiners" error={errs.prorateNewJoiners}><select value={f.prorateNewJoiners ? "1" : "0"} onChange={(e) => set("prorateNewJoiners", e.target.value === "1")}><option value="1">Yes — by joining month</option><option value="0">No</option></select></Field>
              <Field label="Carry forward" error={errs.carryForwardMode}>{sel("carryForwardMode", "CarryForwardMode")}</Field>
              <Field label="Max carry forward" error={errs.carryForwardMax}>{num("carryForwardMax", { disabled: f.carryForwardMode !== "CAPPED" })}</Field>
              <Field label="Accumulation cap" error={errs.accumulationCap}>{num("accumulationCap", { disabled: f.carryForwardMode === "NONE" })}</Field>
              <Field label="Carried leave expires after" error={errs.carryExpiryMonths}><select value={f.carryExpiryMonths as string} onChange={(e) => set("carryExpiryMonths", e.target.value)}><option value="">Never</option>{[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} months</option>)}</select></Field>
              <Field label="Encashment" error={errs.encashmentMode}>{sel("encashmentMode", "EncashmentMode")}</Field>
              <Field label="Max days encashable" error={errs.encashMaxDays}>{num("encashMaxDays", { disabled: f.encashmentMode === "NOT_ALLOWED" })}</Field>
              <Field label="Encashment rate" error={errs.encashBasis}><select value={f.encashBasis as string} disabled={f.encashmentMode === "NOT_ALLOWED"} onChange={(e) => set("encashBasis", e.target.value)}><option value="">—</option>{lookupOptions(lookups, "EncashBasis", f.encashBasis as string).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
              <Field label="Unpaid deduction" error={errs.deductionBasis} hint="For unpaid leave">{sel("deductionBasis", "DeductionBasis", "—")}</Field>
            </FormGrid>
          )}
          {tab === "rules" && (
            <>
              <div className="stack">
                {sw("sandwichRule", "Sandwich rule — weekly offs / holidays between leave days count as leave")}
                {sw("allowHalfDay", "Allow half-day leave")}
                {sw("allowNegative", "Allow negative balance")}
                {sw("blockInPayrollLock", "Block during payroll lock period (25th – month end)")}
                {sw("attachmentRequired", "Require attachment")}
              </div>
              <FormGrid cols={3}>
                <Field label="Attachment after (days)" error={errs.attachmentAfterDays}>{num("attachmentAfterDays", { disabled: !f.attachmentRequired })}</Field>
                <Field label="Min. notice (days)" error={errs.minNoticeDays}>{num("minNoticeDays")}</Field>
                <Field label="Max consecutive days" error={errs.maxConsecutiveDays}>{num("maxConsecutiveDays")}</Field>
                <Field label="Max per month" error={errs.maxPerMonth}>{num("maxPerMonth")}</Field>
                <Field label="Backdated up to (days)" error={errs.backdateDays}>{num("backdateDays")}</Field>
                <Field label="Times in service" error={errs.maxTimesInService}>{num("maxTimesInService")}</Field>
                <Field label="Apply within (days of event)" error={errs.applyWindowDays}>{num("applyWindowDays")}</Field>
                <Field label="Comp-off expires after (days)" error={errs.compOffExpiryDays}>{num("compOffExpiryDays")}</Field>
                <Field label="HR approval above (days)" error={errs.hrApprovalAboveDays}>{num("hrApprovalAboveDays")}</Field>
              </FormGrid>
            </>
          )}
          {tab === "eligibility" && (
            <>
              <FormGrid cols={3}>
                <Field label="Gender" error={errs.gender}>{sel("gender", "LeaveTypeGender")}</Field>
                <Field label="Available after" error={errs.availableAfter}>{sel("availableAfter", "AvailableAfter")}</Field>
                <Field label="During probation" error={errs.probationRule}>{sel("probationRule", "ProbationRule")}</Field>
                <Field label="Approval workflow" error={errs.approvalWorkflow}>{sel("approvalWorkflow", "ApprovalWorkflow")}</Field>
                <Field label="Employment types" full error={errs.employmentTypes}>
                  <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <label key={t} className="check"><input type="checkbox" checked={(f.employmentTypes as string[]).includes(t)}
                        onChange={(e) => set("employmentTypes", e.target.checked ? [...(f.employmentTypes as string[]), t] : (f.employmentTypes as string[]).filter((x) => x !== t))} /> {L("EmploymentType", t)}</label>
                    ))}
                  </div>
                </Field>
              </FormGrid>
              <div className="form-section"><h4>Branch &amp; grade overrides</h4><p>By default the type applies to all branches and grades. Exclude some, or give them different days.</p></div>
              {errs.rules && <p className="hint text-danger">{errs.rules}</p>}
              {rules.length > 0 && (
                <div className="table-wrap"><table className="tbl lines">
                  <thead><tr><th>Applies to</th><th>Branch / grade</th><th>Included</th><th className="num">Days instead</th><th /></tr></thead>
                  <tbody>
                    {rules.map((r, i) => (
                      <tr key={i}>
                        <td><select className="cell-input" value={r.scope} onChange={(e) => setRule(i, { scope: e.target.value as Rule["scope"] })}><option value="BRANCH">Branch</option><option value="GRADE">Grade</option></select></td>
                        <td>{r.scope === "BRANCH"
                          ? <select className="cell-input" value={r.branchId} onChange={(e) => setRule(i, { branchId: e.target.value })}><option value="">Choose…</option>{opts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                          : <select className="cell-input" value={r.gradeId} onChange={(e) => setRule(i, { gradeId: e.target.value })}><option value="">{opts?.grades.length ? "Choose…" : "No grades yet"}</option>{opts?.grades.map((g) => <option key={g.id} value={g.id}>{g.code} ({g.name})</option>)}</select>}
                          {errs[`rules.${i}`] && <small className="hint text-danger">{errs[`rules.${i}`]}</small>}</td>
                        <td><input type="checkbox" checked={r.isIncluded} onChange={(e) => setRule(i, { isIncluded: e.target.checked })} aria-label="Included" /></td>
                        <td className="num"><input className="cell-input" type="number" min={0} value={r.daysOverride} disabled={!r.isIncluded} onChange={(e) => setRule(i, { daysOverride: e.target.value })} /></td>
                        <td className="actions"><button type="button" className="icon-btn-sm" aria-label="Remove" onClick={() => set("rules", rules.filter((_, j) => j !== i))}><Trash2 /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
              <button type="button" className="btn secondary sm mt" onClick={() => set("rules", [...rules, { scope: "BRANCH", branchId: "", gradeId: "", isIncluded: true, daysOverride: "" }])}><Plus />Add override</button>
              {!opts?.grades.length && <p className="muted small mt">Grades are set on <Link className="link" href="/hr/departments">Departments &amp; Designations</Link>.</p>}
            </>
          )}
        </RecordModal>
      )}
    </>
  );
}
