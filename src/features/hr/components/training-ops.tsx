"use client";

import { CalendarCheck, CalendarDays, UserPlus, Video } from "lucide-react";
import { useEffect, useState } from "react";
import type { TrainingEnrolmentItem, TrainingOptions, TrainingSessionItem } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createTrainingSession, enrolEmployees, enrolmentAction, getTrainingOptions, updateEnrolment, updateTrainingSession } from "../talent-ops-api";
import { tDm, tDmy, tFromLocal, tInitials, tLocalInput, tRs, tTime, tToday, tLocalDate } from "./talent-ui";

/** One upcoming session line (template list-item). */
export function SessionLine({ s, onClick }: { s: TrainingSessionItem; onClick?: () => void }) {
  const seats = s.seats ? `${Math.min(s.enrolled, s.seats)} / ${s.seats}` : `${s.enrolled} enrolled`;
  return (
    <div className="list-item" style={onClick ? { cursor: "pointer" } : undefined} onClick={onClick}>
      <span className="icon-well">{s.deliveryMode === "ONLINE" ? <Video /> : <CalendarDays />}</span>
      <div><b>{s.title}</b><small>{tDm(tLocalDate(s.startsAt))} · {tTime(s.startsAt)}–{tTime(s.endsAt)}{s.venue ? ` · ${s.venue}` : s.branch ? ` · ${s.branch.name}` : ""}{s.trainer ? ` · ${s.trainer}` : ""}{s.seats ? ` · ${s.seats} seats` : ""}</small></div>
      <span className="spacer" />
      {s.isMandatory ? <span className="badge warn">Mandatory</span> : <span className="badge info">{seats}</span>}
    </div>
  );
}

type SessionForm = { programId: string; title: string; date: string; from: string; to: string; deliveryMode: string; venue: string; branchId: string; trainer: string; seats: string; isMandatory: boolean };

/** Template modal #po-trn-session: schedule (or edit / cancel) a session under a programme. */
export function SessionModal({ session, programs, defaultProgramId, onClose, onSaved }: {
  session: TrainingSessionItem | null; programs: { id: string; name: string }[]; defaultProgramId?: string; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [opts, setOpts] = useState<TrainingOptions | null>(null);
  const local = (iso: string) => tLocalInput(iso);
  const [f, setF] = useState<SessionForm>(session ? {
    programId: session.program.id, title: session.title, date: local(session.startsAt).slice(0, 10), from: local(session.startsAt).slice(11), to: local(session.endsAt).slice(11),
    deliveryMode: session.deliveryMode, venue: session.venue ?? "", branchId: session.branch?.id ?? "", trainer: session.trainer ?? "", seats: session.seats ? String(session.seats) : "", isMandatory: session.isMandatory,
  } : { programId: defaultProgramId ?? "", title: "", date: tToday(), from: "09:30", to: "17:00", deliveryMode: "IN_PERSON", venue: "", branchId: "", trainer: "", seats: "20", isMandatory: false });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { getTrainingOptions().then(setOpts).catch(() => undefined); }, []);
  const body = () => ({
    title: f.title, startsAt: tFromLocal(`${f.date}T${f.from}`), endsAt: tFromLocal(`${f.date}T${f.to}`), deliveryMode: f.deliveryMode, venue: f.venue, branchId: f.branchId,
    trainer: f.trainer, seats: f.seats, isMandatory: f.isMandatory,
  });
  const go = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true); setErrs({});
    try { await work(); toast(done, { tone: "good" }); onSaved(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the session"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => (session
    ? go(() => updateTrainingSession(session.id, { ...body(), rowVersion: session.rowVersion }), "Session saved")
    : f.programId ? go(() => createTrainingSession(f.programId, body()), `Session scheduled${f.seats ? ` · ${f.seats} seats` : ""}`) : setErrs({ programId: "Choose the programme" }));
  return (
    <Modal open onClose={onClose} title={session ? session.title : "Schedule a session"} subtitle={session ? `${session.program.name} · ${tDmy(tLocalDate(session.startsAt))}` : "Sessions are the schedule of a programme; enrolled employees attend them."}
      foot={<>
        {session && session.status === "SCHEDULED" && <>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void go(() => updateTrainingSession(session.id, { status: "CANCELLED", rowVersion: session.rowVersion }), "Session cancelled")}>Cancel session</button>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void go(() => updateTrainingSession(session.id, { status: "COMPLETED", rowVersion: session.rowVersion }), "Session marked held")}>Mark held</button>
        </>}
        <span className="spacer" /><button className="btn secondary" type="button" onClick={onClose}>Close</button>
        <button className="btn primary" type="button" disabled={busy} onClick={() => void save()}><CalendarCheck />{session ? "Save" : "Schedule"}</button>
      </>}>
      <FormGrid>
        {!session && <Field label="Programme" required full error={errs.programId}><select value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value })}><option value="">Choose…</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
        <Field label="Session title" required full error={errs.title}><input value={f.title} maxLength={160} placeholder="e.g. Advanced Excel — Module 5" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Date" required error={errs.startsAt}><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="From – to" required error={errs.endsAt}><div className="row" style={{ gap: 6 }}><input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div></Field>
        <Field label="Seats" error={errs.seats}><input type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></Field>
        <Field label="Mode" error={errs.deliveryMode}><select value={f.deliveryMode} onChange={(e) => setF({ ...f, deliveryMode: e.target.value })}><option value="IN_PERSON">In person</option><option value="ONLINE">Online</option><option value="HYBRID">Hybrid</option></select></Field>
        <Field label="Branch" error={errs.branchId}><select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}><option value="">—</option>{opts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Venue" full error={errs.venue}><input value={f.venue} maxLength={160} placeholder="e.g. Lahore HQ · Training room / Microsoft Teams" onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
        <Field label="Trainer" error={errs.trainer}><input value={f.trainer} maxLength={120} onChange={(e) => setF({ ...f, trainer: e.target.value })} /></Field>
        <Check label="Mandatory" checked={f.isMandatory} onChange={(e) => setF({ ...f, isMandatory: e.target.checked })} />
      </FormGrid>
    </Modal>
  );
}

/** Template modal #po-trn-enrol: a programme and the people to enrol (programme-level, within its seats). */
export function EnrolModal({ defaultProgramId, onClose, onSaved }: { defaultProgramId?: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [opts, setOpts] = useState<TrainingOptions | null>(null);
  const [programId, setProgramId] = useState(defaultProgramId ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { getTrainingOptions().then((o) => { setOpts(o); setProgramId((p) => p || o.programs[0]?.id || ""); }).catch(() => undefined); }, []);
  const prog = opts?.programs.find((p) => p.id === programId);
  const list = (opts?.employees ?? []).filter((e) => !e.enrolledIn.includes(programId) && (!q || `${e.name} ${e.code} ${e.department ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const left = prog?.seats != null ? prog.seats - prog.enrolled : null;
  const save = async () => {
    setBusy(true);
    try { const r = await enrolEmployees({ programId, employeeIds: picked }); toast(`${r.enrolled} employee${r.enrolled === 1 ? "" : "s"} enrolled in ${prog?.name ?? "the programme"}`, { tone: "good" }); onSaved(); }
    catch (e) { toast(apiMessage(e, "Could not enrol"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Enrol employees" subtitle="Pick a program and the people to enrol."
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !picked.length || !programId} onClick={() => void save()}><UserPlus />Enrol selected{picked.length ? ` (${picked.length})` : ""}</button></>}>
      <FormGrid>
        <Field label="Program" full><select value={programId} onChange={(e) => { setProgramId(e.target.value); setPicked([]); }}>{opts?.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Search" full hint={left != null ? `${Math.max(0, left)} of ${prog!.seats} seats left${prog?.costPerHead ? ` · ${tRs(prog.costPerHead)} / head` : ""}` : prog?.costPerHead ? `${tRs(prog.costPerHead)} / head` : undefined}><input value={q} placeholder="Name, code or department" onChange={(e) => setQ(e.target.value)} /></Field>
      </FormGrid>
      <div className="list mt" style={{ maxHeight: 320, overflow: "auto" }}>
        {!opts ? <p className="small muted">Loading…</p> : !list.length ? <p className="small muted">Everyone matching is already enrolled.</p> : list.map((e) => (
          <label key={e.id} className="list-item"><input type="checkbox" checked={picked.includes(e.id)} onChange={(x) => setPicked(x.target.checked ? [...picked, e.id] : picked.filter((p) => p !== e.id))} />
            <span className="avatar sm">{tInitials(e.name)}</span><div><b>{e.name}</b><small>{e.department ?? "—"} · {e.code}</small></div></label>
        ))}
      </div>
    </Modal>
  );
}

/** An enrolment: progress / score / hours / cost, behind flag, complete (issues the certificate) or withdraw, and History. */
export function EnrolmentModal({ e, canEdit, onClose, onSaved }: { e: TrainingEnrolmentItem; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<"form" | "history">("form");
  const [f, setF] = useState({ progressPct: String(Math.min(99, e.progressPct)), scorePct: e.scorePct == null ? "" : String(e.scorePct), hoursCompleted: String(e.hoursCompleted), cost: String(e.cost), behind: e.status === "BEHIND", completedOn: tToday() });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const open = canEdit && !["COMPLETED", "WITHDRAWN"].includes(e.status);
  const go = async (work: () => Promise<TrainingEnrolmentItem>, done: (r: TrainingEnrolmentItem) => string) => {
    setBusy(true); setErrs({});
    try { const r = await work(); toast(done(r), { tone: "good" }); onSaved(); } catch (x) { setErrs(apiFieldErrors(x)); toast(apiMessage(x, "Could not save the enrolment"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${e.employee.name} · ${e.program.name}`} subtitle={`Enrolled ${tDmy(e.enrolledOn)}${e.completedOn ? ` · completed ${tDmy(e.completedOn)}` : ""}`}
      foot={<>
        {open && <button className="btn ghost" type="button" disabled={busy} onClick={() => void go(() => enrolmentAction(e.id, "withdraw", { rowVersion: e.rowVersion }), () => "Enrolment withdrawn")}>Withdraw</button>}
        <span className="spacer" /><button className="btn secondary" type="button" onClick={onClose}>Close</button>
        {open && tab === "form" && <>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void go(() => updateEnrolment(e.id, { progressPct: f.progressPct, scorePct: f.scorePct, hoursCompleted: f.hoursCompleted, cost: f.cost, behind: f.behind, rowVersion: e.rowVersion }), () => "Enrolment saved")}>Save progress</button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => void go(() => enrolmentAction(e.id, "complete", { scorePct: f.scorePct, completedOn: f.completedOn, rowVersion: e.rowVersion }), (r) => r.certification ? `Completed · ${r.certification.name} issued${r.certification.expiresOn ? `, valid to ${tDmy(r.certification.expiresOn)}` : ""}` : "Enrolment completed")}>Mark completed</button>
        </>}
      </>}>
      <div className="tabs mb"><button type="button" className={cn(tab === "form" && "active")} onClick={() => setTab("form")}>Enrolment</button><button type="button" className={cn(tab === "history" && "active")} onClick={() => setTab("history")}>History</button></div>
      {tab === "history" ? <HistoryTab schema="HumanResources" table="TrainingEnrolments" id={e.id} /> : <>
        <FormGrid>
          <Field label="Progress (%)" error={errs.progressPct}><input type="number" min={0} max={99} disabled={!open} value={f.progressPct} onChange={(x) => setF({ ...f, progressPct: x.target.value })} /></Field>
          <Field label="Score (%)" error={errs.scorePct}><input type="number" min={0} max={100} disabled={!open} value={f.scorePct} onChange={(x) => setF({ ...f, scorePct: x.target.value })} /></Field>
          <Field label="Hours completed" error={errs.hoursCompleted}><input type="number" min={0} step="any" disabled={!open} value={f.hoursCompleted} onChange={(x) => setF({ ...f, hoursCompleted: x.target.value })} /></Field>
          <Field label="Cost (Rs)" error={errs.cost}><input type="number" min={0} disabled={!open} value={f.cost} onChange={(x) => setF({ ...f, cost: x.target.value })} /></Field>
          {open && <Field label="Completed on" error={errs.completedOn} hint="Used by Mark completed"><input type="date" value={f.completedOn} onChange={(x) => setF({ ...f, completedOn: x.target.value })} /></Field>}
          {open && <Check label="Behind schedule" checked={f.behind} onChange={(x) => setF({ ...f, behind: x.target.checked })} />}
        </FormGrid>
        {e.program.grantsCertification && <p className="small muted mt">{e.certification ? `Certificate: ${e.certification.name}${e.certification.expiresOn ? ` · expires ${tDmy(e.certification.expiresOn)}` : " · no expiry"}` : `Completing issues “${e.program.grantsCertification}”${e.program.certificationValidityMonths ? `, valid ${e.program.certificationValidityMonths} months` : ""}.`}</p>}
      </>}
    </Modal>
  );
}
