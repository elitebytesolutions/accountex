"use client";

import { AlertTriangle, CalendarDays, CalendarPlus, GraduationCap, Plus, Search, Shield, UserPlus, Users, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TRAINING_TRANSITIONS, type Department, type TrainingProgram } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { listDepartments } from "../api";
import { createTrainingProgram, deleteTrainingProgram, listTrainingPrograms, setTrainingProgramStatus, updateTrainingProgram } from "../talent-api";
import { TableFoot } from "./people-ui";
import { RecordModal } from "./record-modal";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = Record<string, string | boolean>;
const LOOKUPS = ["TrainingProgramFormat", "TrainingProgramStatus"];
const PAGE = 12;
const CHIPS = [["", "All"], ["PLANNED", "Planned"], ["IN_PROGRESS", "In progress"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]] as const;
const ACTION_LABEL: Record<string, string> = { IN_PROGRESS: "Start program", COMPLETED: "Mark completed", CANCELLED: "Cancel program", PLANNED: "Reinstate as planned" };
const rs = (n: number) => `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
const TEXT = ["code", "name", "audience", "departmentId", "format", "durationLabel", "durationHours", "provider", "seats", "targetParticipants", "budget", "costPerHead", "grantsCertification", "certificationValidityMonths", "startDate", "endDate", "description"] as const;
const blank = (): Form => ({ ...Object.fromEntries(TEXT.map((k) => [k, ""])), format: "WORKSHOP", isMandatory: false, isCpdCertified: false });
const fromProgram = (p: TrainingProgram): Form => ({
  ...Object.fromEntries(TEXT.map((k) => [k, k === "departmentId" ? p.department?.id ?? "" : String((p as Record<string, unknown>)[k] ?? "")])),
  isMandatory: p.isMandatory, isCpdCertified: p.isCpdCertified, grants: !!p.grantsCertification,
});
/** The card's grey line, as in the template: mandatory · audience · format / provider / duration / cost. */
function cardLine(p: TrainingProgram, format: string) {
  const who = p.audience ?? p.department?.name;
  const how = [p.durationLabel ?? format, p.provider, p.isCpdCertified ? "CPD-certified" : null, p.costPerHead ? `${rs(p.costPerHead)} / head` : null].filter(Boolean).join(" · ");
  return [p.isMandatory ? "Mandatory" : null, who, how].filter(Boolean).join(" · ");
}

/**
 * Template app/hr/training (51-hr-pay-talent.html): KPIs, the program card grid and the po-trn-program modal (its five
 * fields first, then the rest of the program and its history). Sessions, enrolments and expiring certifications stay
 * empty until Phase 33.
 */
export function TrainingScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [data, setData] = useState<{ items: TrainingProgram[]; total: number } | null>(null);
  const [all, setAll] = useState<TrainingProgram[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<TrainingProgram | "new" | null>(null);
  const [f, setF] = useState<Form>(blank());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { listDepartments({ status: "ACTIVE" }).then((r) => setDepartments(r.items)).catch(() => undefined); }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([listTrainingPrograms({ search, status, page, pageSize: PAGE }), listTrainingPrograms({ pageSize: 100 })])
      .then(([d, a]) => { if (!cancelled) { setData(d); setAll(a.items); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load training programs" }));
    return () => { cancelled = true; };
  }, [search, status, page, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const live = all.filter((p) => p.status !== "CANCELLED");
  const budget = live.reduce((t, p) => t + (p.budget ?? 0), 0);
  const running = all.filter((p) => p.status === "IN_PROGRESS").length;
  const count = (st: string) => (st ? all.filter((p) => p.status === st).length : all.length);
  const row = edit && edit !== "new" ? edit : null;
  const editable = row ? can.edit : can.create;
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const open = (p: TrainingProgram | "new") => { setErrs({}); setF(p === "new" ? blank() : fromProgram(p)); setEdit(p); };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); reload(); }
    catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the program"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const save = () => {
    const body: Record<string, unknown> = Object.fromEntries(TEXT.map((k) => [k, s(k)]));
    body.isMandatory = Boolean(f.isMandatory);
    body.isCpdCertified = Boolean(f.isCpdCertified);
    if (!f.grants) { body.grantsCertification = ""; body.certificationValidityMonths = ""; }
    return run(() => (row ? updateTrainingProgram(row.id, { ...body, rowVersion: row.rowVersion }) : createTrainingProgram(body)), row ? `${s("name")} saved` : `Program ${s("name")} created`);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const filtered = !!(search || status);

  return (
    <>
      <PageHead eyebrow="Workforce / Talent / Training" title="Training & Development"
        description={`Programs, sessions, enrolments and certifications${budget ? ` · budget ${rs(budget)}` : ""}.`}
        actions={<>
          <button className="btn secondary" type="button" disabled title="Sessions arrive with enrolments (Phase 33)"><CalendarPlus />Schedule session</button>
          {can.create && <button className="btn primary" type="button" onClick={() => open("new")}><Plus />New Program</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Training Hours (FY)</span><span className="icon-well"><GraduationCap /></span></div><strong>0 hrs</strong><small>Logged from sessions (Phase 33)</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Budget Utilised</span><span className="icon-well"><Wallet /></span></div><strong>Rs 0</strong><small>{budget ? `0% of ${rs(budget)}` : "No program budgets yet"}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Active Enrolments</span><span className="icon-well"><Users /></span></div><strong>0</strong><small>{running} program{running === 1 ? "" : "s"} running</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Certifications Expiring</span><span className="icon-well"><AlertTriangle /></span></div><strong>0</strong><small>Next 60 days</small></div>
      </div>

      <div className="toolbar">
        <label className="search-field" style={{ minWidth: "min(100%, 240px)" }}><Search /><input placeholder="Search program, code, audience or provider…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <span className="spacer" />
        <div className="chips">{CHIPS.map(([v, l]) => <button key={l} type="button" className={cn(status === v && "active")} onClick={() => { setStatus(v); setPage(1); }}>{l} <i>{count(v)}</i></button>)}</div>
      </div>

      {!data ? <Skeleton style={{ height: 260, marginBottom: 16 }} /> : !data.items.length ? (
        <div className="panel mb"><EmptyState icon={<GraduationCap />} title={filtered ? "No program matches" : "No training programs yet"}
          description={filtered ? "Try another search or status." : can.create ? "Add the programs your people attend: workshops, online courses and certifications." : "Programs HR adds appear here."}
          action={!filtered && can.create ? <button className="btn primary sm" type="button" onClick={() => open("new")}><Plus />New Program</button> : undefined} /></div>
      ) : (
        <>
          <div className="card-grid mb">
            {data.items.map((p) => {
              const target = p.targetParticipants ?? p.seats;
              return (
                <button key={p.id} type="button" className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => open(p)}>
                  <div className="row"><span className="icon-well">{p.isMandatory ? <Shield /> : <GraduationCap />}</span><b>{p.name}</b></div>
                  <p className="small muted">{cardLine(p, labelOf(lookups, "TrainingProgramFormat", p.format))}</p>
                  <div className="progress"><i style={{ width: "0%" }} /></div>
                  <div className="row small mt"><span>{target ? `0 / ${target} completed` : "No enrolments yet"}</span><span className="spacer" /><span className={cn("badge", toneOf(lookups, "TrainingProgramStatus", p.status))}>{labelOf(lookups, "TrainingProgramStatus", p.status)}</span></div>
                </button>
              );
            })}
          </div>
          {pages > 1 && <TableFoot label={`Showing ${(page - 1) * PAGE + 1}–${(page - 1) * PAGE + data.items.length} of ${data.total}`} page={page} pages={pages} go={setPage} />}
        </>
      )}

      <div className="grid-2 mb">
        <div className="panel">
          <div className="panel-head"><div><h3>Upcoming Sessions</h3></div></div>
          <EmptyState icon={<CalendarDays />} title="No sessions scheduled" description="Sessions are scheduled per program from Phase 33." />
        </div>
        <div className="panel flush">
          <div className="panel-head"><div><h3>Certifications Expiring</h3><p>Next 60 days</p></div></div>
          <EmptyState icon={<AlertTriangle />} title="Nothing expiring" description="Certifications are tracked from completed enrolments (Phase 33)." />
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Enrolments</h3><p>Current programs</p></div><div className="panel-actions"><button className="btn secondary sm" type="button" disabled title="Enrolments arrive in Phase 33"><UserPlus />Enrol employees</button></div></div>
        <EmptyState icon={<Users />} title="No enrolments yet" description="Employees are enrolled in programs from Phase 33." />
      </div>

      {edit && (
        <RecordModal open wide onClose={() => setEdit(null)} busy={busy} title={row ? row.name : "New training program"} subtitle="Programs hold sessions, enrolments and certifications."
          history={row ? { schema: "HumanResources", table: "TrainingPrograms", id: row.id } : null}
          canSave={editable} canDelete={can.remove} saveLabel={row ? "Save program" : "Create program"} onSave={save}
          onDelete={async () => { if (row) await run(() => deleteTrainingProgram(row.id, row.rowVersion), `${row.name} deleted`); }}
          deleteNote="Programs with sessions or enrolments can only be cancelled.">
          <FormGrid>
            <Field label="Program name" required full error={errs.name}><input value={s("name")} maxLength={120} placeholder="e.g. Customer Service Excellence" disabled={!editable} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Audience" error={errs.audience}><input value={s("audience")} maxLength={120} placeholder="e.g. Sales & Support" disabled={!editable} onChange={(e) => set("audience", e.target.value)} /></Field>
            <Field label="Format" error={errs.format}><select value={s("format")} disabled={!editable} onChange={(e) => set("format", e.target.value)}>{lookupOptions(lookups, "TrainingProgramFormat", s("format")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Seats" error={errs.seats}><input type="number" min={1} value={s("seats")} disabled={!editable} onChange={(e) => set("seats", e.target.value)} /></Field>
            <Field label="Budget (Rs)" error={errs.budget}><input type="number" min={0} step="any" value={s("budget")} disabled={!editable} onChange={(e) => set("budget", e.target.value)} /></Field>
          </FormGrid>
          <div className="form-section"><h4>Details</h4></div>
          <FormGrid>
            <Field label="Code" error={errs.code} hint="Optional"><input value={s("code")} maxLength={20} placeholder="e.g. TRN-SALES-01" disabled={!editable} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Department" error={errs.departmentId}>
              <select value={s("departmentId")} disabled={!editable} onChange={(e) => set("departmentId", e.target.value)}>
                <option value="">All departments</option>
                {row?.department && !departments.some((d) => d.id === row.department!.id) && <option value={row.department.id}>{row.department.name}</option>}
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Duration" error={errs.durationLabel}><input value={s("durationLabel")} maxLength={60} placeholder="e.g. 3-day workshop" disabled={!editable} onChange={(e) => set("durationLabel", e.target.value)} /></Field>
            <Field label="Hours" error={errs.durationHours}><input type="number" min={0.25} step="any" value={s("durationHours")} disabled={!editable} onChange={(e) => set("durationHours", e.target.value)} /></Field>
            <Field label="Provider / trainer" error={errs.provider}><input value={s("provider")} maxLength={120} placeholder="e.g. Rescue 1122 trainers" disabled={!editable} onChange={(e) => set("provider", e.target.value)} /></Field>
            <Field label="Target participants" error={errs.targetParticipants}><input type="number" min={1} value={s("targetParticipants")} disabled={!editable} onChange={(e) => set("targetParticipants", e.target.value)} /></Field>
            <Field label="Cost per head (Rs)" error={errs.costPerHead}><input type="number" min={0} step="any" value={s("costPerHead")} disabled={!editable} onChange={(e) => set("costPerHead", e.target.value)} /></Field>
            <Field label="Starts" error={errs.startDate}><input type="date" value={s("startDate")} disabled={!editable} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="Ends" error={errs.endDate}><input type="date" value={s("endDate")} min={s("startDate") || undefined} disabled={!editable} onChange={(e) => set("endDate", e.target.value)} /></Field>
            <Check label="Mandatory (compliance)" checked={Boolean(f.isMandatory)} disabled={!editable} onChange={(e) => set("isMandatory", e.target.checked)} />
            <Check label="CPD-certified (e.g. ICAP)" checked={Boolean(f.isCpdCertified)} disabled={!editable} onChange={(e) => set("isCpdCertified", e.target.checked)} />
            <Check full label="Grants a certification" checked={Boolean(f.grants)} disabled={!editable} onChange={(e) => set("grants", e.target.checked)} />
            {Boolean(f.grants) && <>
              <Field label="Certification" required error={errs.grantsCertification}><input value={s("grantsCertification")} maxLength={120} placeholder="e.g. Forklift Operator Licence" disabled={!editable} onChange={(e) => set("grantsCertification", e.target.value)} /></Field>
              <Field label="Valid for (months)" error={errs.certificationValidityMonths} hint="Blank = does not expire"><input type="number" min={1} value={s("certificationValidityMonths")} disabled={!editable} onChange={(e) => set("certificationValidityMonths", e.target.value)} /></Field>
            </>}
            <Field label="Description" full error={errs.description}><textarea rows={3} maxLength={2000} value={s("description")} disabled={!editable} onChange={(e) => set("description", e.target.value)} /></Field>
          </FormGrid>
          {row && (
            <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="small muted">Status</span><span className={cn("badge", toneOf(lookups, "TrainingProgramStatus", row.status))}>{labelOf(lookups, "TrainingProgramStatus", row.status)}</span>
              <span className="spacer" />
              {can.edit && (TRAINING_TRANSITIONS[row.status] ?? []).map((st) => (
                <button key={st} type="button" className={cn("btn sm", st === "CANCELLED" ? "ghost" : "secondary")} disabled={busy}
                  onClick={() => run(() => setTrainingProgramStatus(row.id, st, row.rowVersion), `${row.name}: ${labelOf(lookups, "TrainingProgramStatus", st).toLowerCase()}`)}>{ACTION_LABEL[st] ?? st}</button>
              ))}
            </div>
          )}
        </RecordModal>
      )}
    </>
  );
}
