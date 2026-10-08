"use client";

import { AlertTriangle, CalendarCheck, CircleCheck, DoorOpen, History, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { OnboardingBoard, OnboardingDetail, OnboardingOptions } from "@/shared";
import { Field } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { initialsOf } from "@/features/auth/initials";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { cancelOnboarding, getOnboarding, onboardingBoard, onboardingOptions, startOnboarding, updateOnboardingTask } from "../lifecycle-api";
import { dmy } from "./attendance-ui";

/** Phase 31 parts of app/hr/onboarding: KPIs, New Joiners, Open Tasks, the start-onboarding modal and the joiner drawer. */
const TASK_STATUS: Record<string, [string, string]> = { NOT_STARTED: ["Not started", "neutral"], IN_PROGRESS: ["In progress", "warn"], SCHEDULED: ["Scheduled", "neutral"], COMPLETED: ["Completed", "good"], SKIPPED: ["Skipped", "neutral"] };
const OB_STATUS: Record<string, [string, string]> = { PRE_JOINING: ["Pre-joining", "info"], IN_PROGRESS: ["In progress", "good"], COMPLETED: ["Completed", "good"], CANCELLED: ["Cancelled", "neutral"] };
const weekOf = (joining: string, today: string) => Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${joining}T00:00:00Z`)) / (7 * 86_400_000)) + 1;

export function useOnboardingBoard() {
  const [board, setBoard] = useState<OnboardingBoard | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let c = false; onboardingBoard("OPEN").then((b) => !c && setBoard(b)).catch(() => !c && setBoard(null)); return () => { c = true; }; }, [attempt]);
  return { board, reload: useCallback(() => setAttempt((n) => n + 1), []) };
}

export function OnboardingKpis({ board }: { board: OnboardingBoard | null }) {
  const k = board?.kpis;
  return (
    <div className="kpi-grid mb">
      <div className="kpi"><div className="kpi-top"><span>In Onboarding</span><span className="icon-well"><DoorOpen /></span></div><strong>{k?.inOnboarding ?? "—"}</strong><small>{k ? `${k.joiningThisMonth} joining this month` : ""}</small></div>
      <div className="kpi teal"><div className="kpi-top"><span>Tasks Completed</span><span className="icon-well"><CircleCheck /></span></div><strong>{k ? `${k.tasksDone} / ${k.tasksTotal}` : "—"}</strong><small>{k && k.tasksTotal ? `${Math.round((k.tasksDone / k.tasksTotal) * 100)}% overall` : "No open onboardings"}</small></div>
      <div className="kpi red"><div className="kpi-top"><span>Overdue Tasks</span><span className="icon-well"><AlertTriangle /></span></div><strong>{k?.overdue ?? "—"}</strong><small className={k?.overdue ? "down" : undefined}>{k?.overdue ? k.overdueTitles.join(", ") : "Nothing overdue"}</small></div>
      <div className="kpi violet"><div className="kpi-top"><span>Probation Reviews Due</span><span className="icon-well"><CalendarCheck /></span></div><strong>{k?.probationDue ?? "—"}</strong><small>Next 30 days</small></div>
    </div>
  );
}

export function NewJoinersTable({ board, onOpen }: { board: OnboardingBoard | null; onOpen: (id: string) => void }) {
  if (!board) return <Skeleton style={{ height: 200 }} />;
  if (!board.items.length) return <EmptyState icon={<UserPlus />} title="No new joiners in onboarding" description="Start an onboarding for a new joiner with “Add new joiner”." />;
  return (
    <div className="table-wrap"><table className="tbl">
      <thead><tr><th>Employee</th><th>Position</th><th>Joining</th><th>Buddy</th><th>Progress</th><th>Status</th></tr></thead>
      <tbody>{board.items.map((o) => {
        const pct = o.tasksTotal ? Math.round((o.tasksDone / o.tasksTotal) * 100) : 0;
        const [label, tone] = o.overdue ? [`${o.overdue} overdue`, "warn"] : o.status === "IN_PROGRESS" ? [`Week ${Math.max(1, weekOf(o.joiningDate, board.today))}`, "good"] : OB_STATUS[o.status] ?? [o.status, "neutral"];
        return (
          <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => onOpen(o.id)}>
            <td><div className="cell-user"><span className="avatar sm">{initialsOf(o.employee.name)}</span><div><b>{o.employee.name}</b><small>{o.employee.code}{o.employee.branch ? ` · ${o.employee.branch}` : ""}</small></div></div></td>
            <td>{o.designation ?? o.employee.designation ?? "—"}</td><td className="nowrap">{dmy(o.joiningDate)}</td><td>{o.buddy?.name ?? "—"}</td>
            <td><div className={`progress${o.overdue ? " warn" : ""}`}><i style={{ width: `${pct}%` }} /></div><small>{o.tasksDone} / {o.tasksTotal}</small></td>
            <td><span className={`badge ${tone}`}>{label}</span></td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

export function OpenTasksPanel({ board, canEdit, onChanged }: { board: OnboardingBoard | null; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const lookups = useLookups(["OwnerFunction"]);
  const [chip, setChip] = useState<"ALL" | "OVERDUE" | "MINE">("ALL");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const tasks = board?.tasks ?? [];
  const mine = tasks.filter((t) => board?.myId && t.owner?.id === board.myId);
  const shown = chip === "OVERDUE" ? tasks.filter((t) => t.overdue) : chip === "MINE" ? mine : tasks;
  const complete = async (ids: string[]) => {
    setBusy(true);
    let done = 0;
    for (const id of ids) {
      const t = tasks.find((x) => x.id === id)!;
      try { await updateOnboardingTask(t.onboardingId, t.id, { status: "COMPLETED", rowVersion: t.rowVersion }); done++; } catch (e) { toast(apiMessage(e, `Could not complete ${t.title}`), { tone: "danger" }); }
    }
    if (done) toast(done === 1 ? "Marked complete" : `${done} tasks marked complete`, { tone: "good" });
    setSel(new Set()); setBusy(false); onChanged();
  };
  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Open Tasks</h3><p>Across all new joiners</p></div>
        <div className="panel-actions">
          {canEdit && sel.size > 0 && <button className="btn sm secondary" type="button" disabled={busy} onClick={() => complete([...sel])}>Complete selected ({sel.size})</button>}
          <div className="chips">{([["ALL", "All", tasks.length], ["OVERDUE", "Overdue", tasks.filter((t) => t.overdue).length], ["MINE", "Mine", mine.length]] as const).map(([c, l, n]) => <button key={c} type="button" className={chip === c ? "active" : ""} onClick={() => setChip(c)}>{l} <i>{n}</i></button>)}</div>
        </div>
      </div>
      {!board ? <Skeleton style={{ height: 160 }} /> : !shown.length ? <EmptyState icon={<CircleCheck />} title="No open tasks" description={chip === "ALL" ? "Tasks are created for each new joiner from the checklist template." : "Nothing in this view."} /> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th><input type="checkbox" aria-label="Select all" checked={shown.every((t) => sel.has(t.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((t) => t.id)) : new Set())} /></th><th>Task</th><th>New joiner</th><th>Owner</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>{shown.map((t) => (
            <tr key={t.id}>
              <td><input type="checkbox" aria-label={`Select ${t.title}`} checked={sel.has(t.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} /></td>
              <td><b>{t.title}</b></td><td>{t.joiner.name}</td>
              <td>{t.owner ? `${t.owner.name} · ` : ""}{labelOf(lookups, "OwnerFunction", t.ownerFunction) || t.ownerFunction}</td>
              <td className={`nowrap${t.overdue ? " neg" : ""}`}>{t.dueOn ? dmy(t.dueOn) : "—"}</td>
              <td>{t.overdue ? <span className="badge danger dot">Overdue</span> : <span className={`badge ${TASK_STATUS[t.status]?.[1] ?? "neutral"} dot`}>{TASK_STATUS[t.status]?.[0] ?? t.status}</span>}</td>
              <td className="actions">{canEdit && <button className="btn sm secondary" type="button" disabled={busy} onClick={() => complete([t.id])}>Complete</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

/** "Add new joiner": start an onboarding for an employee from a checklist template. Mounted only while open. */
export function StartOnboardingModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (o: OnboardingDetail) => void }) {
  const toast = useToast();
  const [opts, setOpts] = useState<OnboardingOptions | null>(null);
  const [f, setF] = useState({ employeeId: "", templateId: "", joiningDate: "", buddyEmployeeId: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { let c = false; onboardingOptions().then((o) => { if (!c) { setOpts(o); setF((x) => ({ ...x, templateId: x.templateId || (o.templates.find((t) => t.isDefault)?.id ?? o.templates[0]?.id ?? "") })); } }).catch(() => !c && setOpts(null)); return () => { c = true; }; }, []);
  const submit = async () => {
    setBusy(true);
    try { const r = await startOnboarding({ ...f, joiningDate: f.joiningDate || null, buddyEmployeeId: f.buddyEmployeeId || null }); toast(`Onboarding ${r.docNo} started for ${r.employee.name} · ${r.tasksTotal} tasks`, { tone: "good" }); onClose(); onDone(r); }
    catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not start the onboarding"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const emp = opts?.employees.find((e) => e.id === f.employeeId);
  return (
    <Modal open={open} onClose={onClose} title="Add new joiner" subtitle="Tasks are copied from the checklist template, due on the joining date plus each task's offset."
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={busy || !f.employeeId} onClick={submit}><UserPlus />Start onboarding</button></>}>
      <div className="form-grid">
        <Field label="Employee" required full error={errs.employeeId} hint="Add the employee first in Workforce › Add Employee">
          <select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value, joiningDate: "" })}><option value="">Select employee…</option>{opts?.employees.filter((e) => !e.hasOpen).map((e) => <option key={e.id} value={e.id}>{e.name} — {e.code} (joins {dmy(e.joiningDate)})</option>)}</select>
        </Field>
        <Field label="Checklist template" required error={errs.templateId}><select value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>{opts?.templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tasks} tasks){t.isDefault ? " · default" : ""}</option>)}</select></Field>
        <Field label="Joining date" error={errs.joiningDate} hint={emp ? `On record: ${dmy(emp.joiningDate)}` : undefined}><input type="date" value={f.joiningDate || emp?.joiningDate || ""} onChange={(e) => setF({ ...f, joiningDate: e.target.value })} /></Field>
        <Field label="Buddy" full error={errs.buddyEmployeeId}><select value={f.buddyEmployeeId} onChange={(e) => setF({ ...f, buddyEmployeeId: e.target.value })}><option value="">No buddy</option>{opts?.employees.filter((e) => e.id !== f.employeeId).map((e) => <option key={e.id} value={e.id}>{e.name} — {e.code}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

/** One joiner's onboarding: tasks (complete / reopen / skip), buddy, History, cancel. Render it with key={onboarding id}. */
export function JoinerDrawer({ id, onClose, canEdit, onChanged }: { id: string | null; onClose: () => void; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const lookups = useLookups(["TaskGroup", "OwnerFunction"]);
  const [o, setO] = useState<OnboardingDetail | null>(null);
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [cancel, setCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let c = false; if (id) getOnboarding(id).then((x) => !c && setO(x)).catch(() => !c && setO(null)); return () => { c = true; }; }, [id]);
  const run = async (work: () => Promise<OnboardingDetail>, done: string) => {
    setBusy(true);
    try { setO(await work()); toast(done, { tone: "good" }); onChanged(); } catch (e) { toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const isOpen = !!o && (o.status === "PRE_JOINING" || o.status === "IN_PROGRESS");
  const groups = o ? [...new Set(o.tasks.map((t) => t.taskGroup))] : [];
  return (
    <>
      <Drawer open={!!id} onClose={onClose} title={o ? `${o.docNo} · ${o.employee.name}` : "Onboarding"} subtitle={o ? `${o.template?.name ?? "Onboarding"} · joining ${dmy(o.joiningDate)}` : ""}
        foot={o && <>
          <button className="btn ghost" type="button" onClick={() => setTab(tab === "detail" ? "history" : "detail")}><History />{tab === "detail" ? "History" : "Details"}</button>
          {isOpen && canEdit && <button className="btn ghost" type="button" disabled={busy} onClick={() => setCancel(true)}>Cancel onboarding</button>}
          <span className="spacer" /><button className="btn secondary" type="button" onClick={onClose}>Close</button>
        </>}>
        {!o ? <Skeleton style={{ height: 300 }} /> : tab === "history" ? <HistoryTab schema="HumanResources" table="Onboardings" id={o.id} /> : <>
          <div className="dl">
            <div><span>Status</span><b><span className={`badge ${OB_STATUS[o.status]?.[1] ?? "neutral"}`}>{OB_STATUS[o.status]?.[0] ?? o.status}</span> · {o.tasksDone} / {o.tasksTotal} tasks{o.overdue ? ` · ${o.overdue} overdue` : ""}</b></div>
            <div><span>Position</span><b>{o.designation ?? "—"}</b></div>
            <div><span>Target</span><b>{o.targetDate ? dmy(o.targetDate) : "—"}</b></div>
            <div><span>Buddy</span><b>{o.buddy?.name ?? "—"}</b></div>
          </div>
          {groups.map((g) => (
            <div key={g}>
              <div className="form-section"><h4>{labelOf(lookups, "TaskGroup", g) || g}</h4></div>
              <div className="list">{o.tasks.filter((t) => t.taskGroup === g).map((t) => (
                <div className="list-item" key={t.id}>
                  <input type="checkbox" aria-label={t.title} checked={t.status === "COMPLETED"} disabled={!isOpen || !canEdit || busy}
                    onChange={(e) => run(() => updateOnboardingTask(o.id, t.id, { status: e.target.checked ? "COMPLETED" : "NOT_STARTED", rowVersion: t.rowVersion }), e.target.checked ? "Marked complete" : "Reopened")} />
                  <div><b style={t.status === "COMPLETED" || t.status === "SKIPPED" ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{t.title}</b>
                    <small>{t.owner ? `${t.owner.name} · ` : ""}{labelOf(lookups, "OwnerFunction", t.ownerFunction) || t.ownerFunction} · due {t.dueOn ? dmy(t.dueOn) : "—"}{t.completedBy ? ` · done by ${t.completedBy.name}` : ""}{t.completionNote ? ` — ${t.completionNote}` : ""}</small></div>
                  <span className="spacer" />
                  {t.overdue ? <span className="badge danger">Overdue</span> : <span className={`badge ${TASK_STATUS[t.status]?.[1] ?? "neutral"}`}>{TASK_STATUS[t.status]?.[0] ?? t.status}</span>}
                  {isOpen && canEdit && t.status !== "COMPLETED" && t.status !== "SKIPPED" && <button className="btn ghost sm" type="button" disabled={busy} onClick={() => run(() => updateOnboardingTask(o.id, t.id, { status: "SKIPPED", rowVersion: t.rowVersion }), "Task skipped")}>Skip</button>}
                </div>
              ))}</div>
            </div>
          ))}
        </>}
      </Drawer>
      <ConfirmDialog open={cancel && !!o} onClose={() => setCancel(false)} danger busy={busy} title="Cancel this onboarding?" confirmLabel="Cancel onboarding"
        onConfirm={async () => { setCancel(false); if (o) await run(() => cancelOnboarding(o.id, o.rowVersion, "Cancelled by HR"), "Onboarding cancelled"); }}>
        The tasks stay on record; a new onboarding can be started for the employee later.
      </ConfirmDialog>
    </>
  );
}
