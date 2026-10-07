"use client";

import { Building, Building2, Network, Pencil, Plus, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BranchHr, Department, Designation, Grade, HrFormOptions, Shift } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  branchHr, createDepartment, createDesignation, createGrade, deleteDepartment, deleteDesignation, deleteGrade, hrOptions, listDepartments, listDesignations, listGrades, listShifts, saveBranchHr,
  setDepartmentActive, setDesignationActive, setGradeActive, updateDepartment, updateDesignation, updateGrade,
} from "../api";
import { RecordModal } from "./record-modal";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Tab = "depts" | "desig" | "branches";
type Edit = { kind: "dept"; row: Department | null } | { kind: "desig"; row: Designation | null } | { kind: "grade"; row: Grade | null };
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const gradeTone = (rank: number) => (rank >= 7 ? "violet" : rank >= 5 ? "info" : "neutral");

/** Departments in tree order (parent, then its sub-departments), each with its depth. */
function treeOrder(rows: Department[]): { d: Department; depth: number }[] {
  const ids = new Set(rows.map((r) => r.id));
  const out: { d: Department; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const d of rows.filter((r) => (r.parent && ids.has(r.parent.id) ? r.parent.id : null) === parent)) { out.push({ d, depth }); walk(d.id, depth + 1); }
  };
  walk(null, 0);
  return out;
}

/** Template app/hr/departments (50-hr-core.html): Departments · Designations & Grades · Branches, with the add / edit modals. */
export function DepartmentsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(["Division", "BranchHrSettingSocialSecurityScheme"]);
  const [tab, setTab] = useState<Tab>("depts");
  const [depts, setDepts] = useState<Department[] | null>(null);
  const [desigs, setDesigs] = useState<Designation[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [opts, setOpts] = useState<HrFormOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [band, setBand] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [branchSet, setBranchSet] = useState<BranchHr[] | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [branchEdit, setBranchEdit] = useState<BranchHr | null>(null);
  const [bf, setBf] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    // Shifts need att:view; without it the branch default shift just isn't editable.
    listShifts().then((s) => !cancelled && setShifts(s)).catch(() => undefined);
    Promise.all([listDepartments(), listDesignations(), listGrades(), hrOptions(), branchHr()])
      .then(([d, s, g, o, b]) => { if (!cancelled) { setDepts(d.items); setDesigs(s); setGrades(g); setOpts(o); setBranchSet(b); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the organisation" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const tree = useMemo(() => treeOrder(depts ?? []), [depts]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const open = (e: Edit) => {
    setErrs({});
    setEdit(e);
    if (e.kind === "dept") setF({ name: e.row?.name ?? "", code: e.row?.code ?? "", parentId: e.row?.parent?.id ?? "", division: e.row?.division ?? "", costCentreId: e.row?.costCentre?.id ?? "", headEmployeeId: e.row?.head?.id ?? "", annualBudget: e.row?.annualBudget?.toString() ?? "", description: e.row?.description ?? "" });
    if (e.kind === "desig") setF({ title: e.row?.title ?? "", departmentId: e.row?.department.id ?? "", gradeId: e.row?.grade?.id ?? "", approvedPositions: String(e.row?.approvedPositions ?? 1), reportsToDesignationId: e.row?.reportsTo?.id ?? "" });
    if (e.kind === "grade") {
      const next = Math.max(0, ...grades.map((g) => g.levelRank)) + 1;
      setF({ code: e.row?.code ?? `G-${next}`, levelRank: String(e.row?.levelRank ?? next), levelName: e.row?.levelName ?? "", minSalary: e.row?.minSalary.toString() ?? "", midSalary: e.row?.midSalary.toString() ?? "", maxSalary: e.row?.maxSalary.toString() ?? "" });
    }
  };
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => {
    if (!edit) return;
    if (edit.kind === "dept") return run(() => (edit.row ? updateDepartment(edit.row.id, { ...f, rowVersion: edit.row.rowVersion }) : createDepartment(f)), edit.row ? `${f.name} saved` : "Department created");
    if (edit.kind === "desig") return run(() => (edit.row ? updateDesignation(edit.row.id, { ...f, rowVersion: edit.row.rowVersion }) : createDesignation(f)), edit.row ? `${f.title} saved` : "Designation added");
    return run(() => (edit.row ? updateGrade(edit.row.id, { ...f, rowVersion: edit.row.rowVersion }) : createGrade(f)), edit.row ? `${f.code} saved` : "Grade added");
  };
  const toggle = () => {
    if (!edit?.row) return;
    const r = edit.row;
    if (edit.kind === "dept") return run(() => setDepartmentActive(r.id, !r.isActive, r.rowVersion), `${(r as Department).name} ${r.isActive ? "deactivated" : "activated"}`);
    if (edit.kind === "desig") return run(() => setDesignationActive(r.id, !r.isActive, r.rowVersion), `${(r as Designation).title} ${r.isActive ? "deactivated" : "activated"}`);
    return run(() => setGradeActive(r.id, !r.isActive, r.rowVersion), `${(r as Grade).code} ${r.isActive ? "deactivated" : "activated"}`);
  };
  const remove = async () => {
    if (!edit?.row) return;
    const r = edit.row;
    await run(() => (edit.kind === "dept" ? deleteDepartment(r.id, r.rowVersion) : edit.kind === "desig" ? deleteDesignation(r.id, r.rowVersion) : deleteGrade(r.id, r.rowVersion)), "Deleted");
  };

  const qq = q.trim().toLowerCase();
  const shown = tree.filter(({ d }) => !qq || `${d.name} ${d.code} ${d.description ?? ""}`.toLowerCase().includes(qq));
  const dqq = dq.trim().toLowerCase();
  const desigShown = desigs.filter((d) => (!dqq || `${d.title} ${d.department.name}`.toLowerCase().includes(dqq))
    && (!band || (band === "low" ? (d.grade?.levelRank ?? 0) <= 3 : band === "mid" ? (d.grade?.levelRank ?? 0) >= 4 && (d.grade?.levelRank ?? 0) <= 6 : (d.grade?.levelRank ?? 0) >= 7)));
  const budget = (depts ?? []).reduce((s, d) => s + (d.annualBudget ?? 0), 0);
  const descendants = (id: string): Set<string> => { const out = new Set<string>(); const walk = (p: string) => (depts ?? []).filter((d) => d.parent?.id === p).forEach((d) => { out.add(d.id); walk(d.id); }); walk(id); return out; };

  return (
    <>
      <PageHead eyebrow="HR / Organisation" title="Departments & Designations" description="Organisation structure master data used across payroll, approvals and cost centres."
        actions={<>
          <Link className="btn secondary" href="/hr/org"><Network />Org chart</Link>
          {can.create && <button className="btn primary" type="button" onClick={() => open({ kind: "dept", row: null })}><Plus />Add department</button>}
        </>} />
      <div className="tabs" role="tablist">
        {([["depts", "Departments"], ["desig", "Designations & Grades"], ["branches", "Branches"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={cn(tab === k && "active")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "depts" && (
        <div className="panel flush">
          <div className="panel-head"><div><h3>Departments</h3><p>{depts ? `${depts.length} department${depts.length === 1 ? "" : "s"} · heads, cost centres and headcount` : "Loading…"}</p></div></div>
          <div className="toolbar"><label className="search-field"><Search /><input placeholder="Search department or head…" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Department</th><th>Code</th><th>Head</th><th className="num">Headcount</th><th>Cost centre</th><th className="num">Annual budget (Rs)</th><th className="num">YTD payroll (Rs)</th><th>Utilisation</th><th /></tr></thead>
            <tbody>
              {!depts ? <tr><td colSpan={9}><Skeleton style={{ height: 140 }} /></td></tr> : shown.length ? shown.map(({ d, depth }) => (
                <tr key={d.id} className={cn(!d.isActive && "muted")}>
                  <td style={{ paddingLeft: 16 + depth * 22 }}><b>{depth > 0 && <span className="muted">↳ </span>}{d.name}</b><small>{d.description || (d.division ? labelOf(lookups, "Division", d.division) : `${d.designationCount} designation${d.designationCount === 1 ? "" : "s"}`)}{!d.isActive && " · inactive"}</small></td>
                  <td>{d.code}</td>
                  <td>{d.head ? <Link className="link" href={`/hr/employees/${d.head.id}`}>{d.head.name}</Link> : <span className="muted">—</span>}</td>
                  <td className="num">{d.headcount}</td>
                  <td>{d.costCentre ? <span title={d.costCentre.name}>{d.costCentre.code}</span> : <span className="muted">—</span>}</td>
                  <td className="num">{d.annualBudget === null ? "—" : fmt(d.annualBudget)}</td>
                  <td className="num muted">—</td>
                  <td><div className="progress"><i style={{ width: "0%" }} /></div></td>
                  <td className="actions"><button className="icon-btn-sm" type="button" aria-label={`Edit ${d.name}`} onClick={() => open({ kind: "dept", row: d })}><Pencil /></button></td>
                </tr>
              )) : <tr><td colSpan={9}><EmptyState icon={<Building2 />} title={qq ? "No department matches" : "No departments yet"} description={qq ? "Try another search." : can.create ? "Add your departments: Sales, Finance, Operations…" : "Departments HR adds appear here."} /></td></tr>}
              {!!depts?.length && <tr className="total"><td colSpan={3}>Total</td><td className="num">{depts.reduce((s, d) => s + d.headcount, 0)}</td><td /><td className="num">{fmt(budget)}</td><td className="num">—</td><td /><td /></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "desig" && (
        <>
          <div className="toolbar">
            <label className="search-field"><Search /><input placeholder="Search designations…" value={dq} onChange={(e) => setDq(e.target.value)} /></label>
            <select value={band} onChange={(e) => setBand(e.target.value)} aria-label="Grade band"><option value="">All grades</option><option value="low">G-1 – G-3</option><option value="mid">G-4 – G-6</option><option value="high">G-7+</option></select>
            <span className="spacer" />
            {can.create && <button className="btn secondary sm" type="button" onClick={() => open({ kind: "grade", row: null })}><Plus />Add grade</button>}
            {can.create && <button className="btn primary sm" type="button" disabled={!depts?.some((d) => d.isActive)} title={depts?.some((d) => d.isActive) ? undefined : "Add a department first"} onClick={() => open({ kind: "desig", row: null })}><Plus />Add designation</button>}
          </div>
          <div className="grid-2">
            <div className="panel flush">
              <div className="panel-head"><div><h3>Grade bands</h3><p>Monthly gross</p></div></div>
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Grade</th><th>Level</th><th className="num">Min (Rs)</th><th className="num">Mid (Rs)</th><th className="num">Max (Rs)</th><th className="num">Staff</th></tr></thead>
                <tbody>
                  {grades.length ? grades.map((g) => (
                    <tr key={g.id} className={cn(!g.isActive && "muted")} style={{ cursor: "pointer" }} onClick={() => open({ kind: "grade", row: g })}>
                      <td><b>{g.code}</b></td><td>{g.levelName}{!g.isActive && " (inactive)"}</td><td className="num">{fmt(g.minSalary)}</td><td className="num">{fmt(g.midSalary)}</td><td className="num">{fmt(g.maxSalary)}</td><td className="num">{g.staff}</td>
                    </tr>
                  )) : <tr><td colSpan={6}><EmptyState title="No grades yet" description={can.create ? "Add grade bands (G-1 …) with their salary ranges." : "Grades HR adds appear here."} /></td></tr>}
                </tbody>
              </table></div>
            </div>
            <div className="panel flush">
              <div className="panel-head"><div><h3>Designations</h3><p>Showing {desigShown.length} of {desigs.length}</p></div></div>
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Designation</th><th>Department</th><th>Grade</th><th className="num">Filled</th><th className="num">Open</th></tr></thead>
                <tbody>
                  {desigShown.length ? desigShown.map((d) => {
                    const openPos = d.approvedPositions - d.filled;
                    return (
                      <tr key={d.id} className={cn(!d.isActive && "muted")} style={{ cursor: "pointer" }} onClick={() => open({ kind: "desig", row: d })}>
                        <td><b>{d.title}</b>{d.reportsTo && <small>Reports to {d.reportsTo.title}</small>}</td><td>{d.department.name}</td>
                        <td>{d.grade ? <span className={cn("badge", gradeTone(d.grade.levelRank))}>{d.grade.code}</span> : <span className="muted">—</span>}</td>
                        <td className="num">{d.filled}</td><td className={cn("num", openPos <= 0 && "zero")}>{openPos > 0 ? openPos : "—"}</td>
                      </tr>
                    );
                  }) : <tr><td colSpan={5}><EmptyState title={desigs.length ? "No designation matches" : "No designations yet"} description={desigs.length ? "Try another search or grade band." : "Positions are budgeted per department."} /></td></tr>}
                </tbody>
              </table></div>
            </div>
          </div>
        </>
      )}

      {tab === "branches" && (
        <>
          <div className="toolbar"><span className="muted small">{opts?.branches.length ?? 0} branch{opts?.branches.length === 1 ? "" : "es"}</span><span className="spacer" /><Link className="btn secondary sm" href="/settings/branches"><Settings />Manage branches</Link></div>
          <div className="grid-4">
            {(branchSet ?? []).map((b) => (
              <div key={b.id} className="card">
                <div className="row"><span className="icon-well">{b.isHeadOffice ? <Building2 /> : <Building />}</span><div><b>{b.name}</b><small className="muted" style={{ display: "block" }}>{b.isHeadOffice ? "Head office" : "Branch"} · {b.code}</small></div><span className="spacer" />{b.isHeadOffice && <span className="badge good">HQ</span>}</div>
                <div className="dl mt">
                  <div><span>Headcount</span><b>{b.headcount}</b></div><div><span>City</span><b>{b.city ?? "—"}</b></div>
                  <div><span>Manager</span><b>{b.manager ? <Link className="link" href={`/hr/employees/${b.manager.id}`}>{b.manager.name}</Link> : "—"}</b></div>
                  <div><span>Social security</span><b>{b.socialSecurityScheme === "NONE" ? "None" : labelOf(lookups, "BranchHrSettingSocialSecurityScheme", b.socialSecurityScheme)}</b></div>
                  <div><span>Default shift</span><b>{b.defaultShift?.name ?? "Company default"}</b></div>
                  <div><span>Devices</span><b>{b.devices ? `${b.devices} ZKTeco` : "—"}</b></div>
                </div>
                {can.edit && <div className="row mt"><button className="btn secondary sm" type="button" onClick={() => { setBranchEdit(b); setBf({ managerEmployeeId: b.manager?.id ?? "", defaultShiftId: b.defaultShift?.id ?? "", socialSecurityScheme: b.socialSecurityScheme }); setErrs({}); }}><Pencil />HR settings</button></div>}
              </div>
            ))}
          </div>
        </>
      )}

      {branchEdit && (
        <RecordModal open onClose={() => setBranchEdit(null)} busy={busy} title={`${branchEdit.name} — HR settings`} subtitle="Branch manager, default shift and social security scheme."
          history={branchEdit.settingId ? { schema: "HumanResources", table: "BranchHrSettings", id: branchEdit.settingId } : null} canSave={can.edit} saveLabel="Save"
          onSave={() => { const b = branchEdit; void run(async () => { await saveBranchHr(b.id, { ...bf, rowVersion: b.rowVersion }); setBranchEdit(null); }, `${b.name} saved`); }}>
          <FormGrid>
            <Field label="Branch manager" error={errs.managerEmployeeId}><select value={bf.managerEmployeeId} onChange={(e) => setBf((x) => ({ ...x, managerEmployeeId: e.target.value }))}><option value="">—</option>{opts?.employees.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.code}</option>)}</select></Field>
            <Field label="Default shift" error={errs.defaultShiftId} hint="Empty = the company default shift"><select value={bf.defaultShiftId} onChange={(e) => setBf((x) => ({ ...x, defaultShiftId: e.target.value }))}><option value="">Company default</option>{shifts.filter((s) => s.status === "ACTIVE" || s.id === bf.defaultShiftId).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime} – {s.endTime})</option>)}</select></Field>
            <Field label="Social security" error={errs.socialSecurityScheme}><select value={bf.socialSecurityScheme} onChange={(e) => setBf((x) => ({ ...x, socialSecurityScheme: e.target.value }))}>{lookupOptions(lookups, "BranchHrSettingSocialSecurityScheme", bf.socialSecurityScheme).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
          </FormGrid>
        </RecordModal>
      )}

      {edit && (
        <RecordModal open onClose={() => setEdit(null)} busy={busy}
          title={edit.kind === "dept" ? (edit.row ? `Edit ${edit.row.name}` : "Add department") : edit.kind === "desig" ? (edit.row ? `Edit ${edit.row.title}` : "Add designation") : edit.row ? `Edit ${edit.row.code}` : "Add grade"}
          subtitle={edit.kind === "dept" ? "Links to a cost centre for budgets and reports." : edit.kind === "desig" ? "Positions are budgeted per department." : "Monthly gross salary band."}
          history={edit.row ? { schema: "HumanResources", table: edit.kind === "dept" ? "Departments" : edit.kind === "desig" ? "Designations" : "Grades", id: edit.row.id } : null}
          active={edit.row?.isActive} canSave={edit.row ? can.edit : can.create} canToggle={can.edit} canDelete={can.remove}
          saveLabel={edit.row ? "Save" : edit.kind === "dept" ? "Create department" : "Save"} onSave={save} onToggle={toggle} onDelete={remove}>
          {edit.kind === "dept" && (
            <FormGrid>
              <Field label="Department name" required error={errs.name}><input value={f.name} maxLength={80} placeholder="e.g. Quality Assurance" onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Code" required error={errs.code}><input value={f.code} maxLength={10} placeholder="QA" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
              <Field label="Parent department" error={errs.parentId}>
                <select value={f.parentId} onChange={(e) => set("parentId", e.target.value)}>
                  <option value="">— None —</option>
                  {(() => { const banned = edit.row ? descendants(edit.row.id) : new Set<string>(); return (depts ?? []).filter((d) => d.isActive && d.id !== edit.row?.id && !banned.has(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>); })()}
                </select>
              </Field>
              <Field label="Department head" error={errs.headEmployeeId}><select value={f.headEmployeeId} onChange={(e) => set("headEmployeeId", e.target.value)}><option value="">{opts?.employees.length ? "Select employee…" : "No employees yet"}</option>{opts?.employees.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.code}</option>)}</select></Field>
              <Field label="Cost centre" error={errs.costCentreId}><select value={f.costCentreId} onChange={(e) => set("costCentreId", e.target.value)}><option value="">— None —</option>{opts?.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></Field>
              <Field label="Annual budget (Rs)" error={errs.annualBudget}><input inputMode="decimal" value={f.annualBudget} onChange={(e) => set("annualBudget", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              <Field label="Division" error={errs.division}><select value={f.division} onChange={(e) => set("division", e.target.value)}><option value="">—</option>{lookupOptions(lookups, "Division", f.division).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
              <Field label="Description" full error={errs.description}><textarea rows={2} maxLength={200} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
            </FormGrid>
          )}
          {edit.kind === "desig" && (
            <FormGrid>
              <Field label="Title" required full error={errs.title}><input value={f.title} maxLength={80} placeholder="e.g. Senior Sales Executive" onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label="Department" required error={errs.departmentId}><select value={f.departmentId} onChange={(e) => set("departmentId", e.target.value)}><option value="">Choose…</option>{(depts ?? []).filter((d) => d.isActive || d.id === f.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Grade" error={errs.gradeId}><select value={f.gradeId} onChange={(e) => set("gradeId", e.target.value)}><option value="">— None —</option>{grades.filter((g) => g.isActive || g.id === f.gradeId).map((g) => <option key={g.id} value={g.id}>{g.code} ({g.levelName})</option>)}</select></Field>
              <Field label="Approved positions" error={errs.approvedPositions}><input type="number" min={0} value={f.approvedPositions} onChange={(e) => set("approvedPositions", e.target.value)} /></Field>
              <Field label="Reports to" error={errs.reportsToDesignationId}><select value={f.reportsToDesignationId} onChange={(e) => set("reportsToDesignationId", e.target.value)}><option value="">— None —</option>{desigs.filter((d) => d.id !== edit.row?.id && d.isActive).map((d) => <option key={d.id} value={d.id}>{d.title} · {d.department.name}</option>)}</select></Field>
            </FormGrid>
          )}
          {edit.kind === "grade" && (
            <FormGrid>
              <Field label="Grade code" required error={errs.code}><input value={f.code} maxLength={6} placeholder="G-5" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
              <Field label="Level rank" required error={errs.levelRank} hint="1 = lowest"><input type="number" min={1} max={99} value={f.levelRank} onChange={(e) => set("levelRank", e.target.value)} /></Field>
              <Field label="Level name" required full error={errs.levelName}><input value={f.levelName} maxLength={60} placeholder="e.g. Executive" onChange={(e) => set("levelName", e.target.value)} /></Field>
              <Field label="Min (Rs)" required error={errs.minSalary}><input inputMode="numeric" value={f.minSalary} onChange={(e) => set("minSalary", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              <Field label="Mid (Rs)" required error={errs.midSalary}><input inputMode="numeric" value={f.midSalary} onChange={(e) => set("midSalary", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              <Field label="Max (Rs)" required error={errs.maxSalary}><input inputMode="numeric" value={f.maxSalary} onChange={(e) => set("maxSalary", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            </FormGrid>
          )}
        </RecordModal>
      )}
    </>
  );
}
