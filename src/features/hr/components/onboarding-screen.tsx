"use client";

import { AlertTriangle, ArrowDown, ArrowUp, CalendarCheck, CircleCheck, DoorOpen, GripVertical, ListChecks, Pencil, Plus, Star, Trash2, UserPlus } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { TASK_GROUPS, type OnboardingTemplate, type OnboardingTemplateTask } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createOnboardingTemplate, deleteOnboardingTemplate, listOnboardingTemplates, onboardingTemplateAction, updateOnboardingTemplate } from "../talent-api";
import { RecordModal } from "./record-modal";

type Can = { create: boolean; edit: boolean; remove: boolean };
type TaskRow = { key: string; id?: string; taskGroup: string; title: string; ownerFunction: string; dueOffsetDays: string; actionKind: string; description: string | null };
const LOOKUPS = ["Track", "TaskGroup", "OwnerFunction", "ActionKind"];
let seq = 0;
const newKey = () => `n${++seq}`;
const toRow = (t: OnboardingTemplateTask): TaskRow => ({ key: t.id, id: t.id, taskGroup: t.taskGroup, title: t.title, ownerFunction: t.ownerFunction, dueOffsetDays: String(t.dueOffsetDays), actionKind: t.actionKind, description: t.description });
const blankRow = (group = "DOCUMENTS"): TaskRow => ({ key: newKey(), taskGroup: group, title: "", ownerFunction: "HR", dueOffsetDays: "0", actionKind: "NONE", description: null });
const groupOrder = (g: string) => { const i = (TASK_GROUPS as readonly string[]).indexOf(g); return i < 0 ? 99 : i; };
const dueText = (d: number) => (d === 0 ? "Day 1" : d < 0 ? `${-d} day${d === -1 ? "" : "s"} before joining` : `Day ${d}`);

/**
 * Template app/hr/onboarding (51-hr-pay-talent.html): KPIs, New Joiners, the Checklist Template panel and Open Tasks.
 * New joiners and tasks arrive with onboardings (Phase 31). Added in template style: a template picker and the template
 * editor (the template's "Edit" is only a toast).
 */
export function OnboardingScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<OnboardingTemplate[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [edit, setEdit] = useState<OnboardingTemplate | "new" | null>(null);
  const [f, setF] = useState<{ name: string; track: string }>({ name: "", track: "NEW_JOINER" });
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listOnboardingTemplates().then((r) => { if (!cancelled) { setRows(r.items); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load onboarding templates" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const shown = rows?.find((t) => t.id === picked) ?? rows?.find((t) => t.isDefault && t.track === "NEW_JOINER") ?? rows?.[0] ?? null;
  const groups = shown ? [...new Set(shown.tasks.map((t) => t.taskGroup))].sort((a, b) => groupOrder(a) - groupOrder(b)) : [];
  const row = edit && edit !== "new" ? edit : null;

  const open = (t: OnboardingTemplate | "new") => {
    setErrs({});
    setEdit(t);
    setF(t === "new" ? { name: "", track: "NEW_JOINER" } : { name: t.name, track: t.track });
    setTasks(t === "new" ? [blankRow()] : t.tasks.map(toRow));
  };
  const run = async (work: () => Promise<OnboardingTemplate | void>, done: string) => {
    setBusy(true);
    setErrs({});
    try {
      const saved = await work();
      toast(done, { tone: "good" });
      if (saved) setPicked(saved.id);
      setEdit(null);
      reload();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the template"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => {
    const body = {
      ...f,
      tasks: tasks.map((t) => ({ ...(t.id ? { id: t.id } : {}), taskGroup: t.taskGroup, title: t.title, description: t.description, ownerFunction: t.ownerFunction, dueOffsetDays: t.dueOffsetDays || "0", actionKind: t.actionKind })),
    };
    return run(() => (row ? updateOnboardingTemplate(row.id, { ...body, rowVersion: row.rowVersion }) : createOnboardingTemplate(body)), row ? `${f.name} saved` : "Template created");
  };
  const setTask = (i: number, k: keyof TaskRow, v: string) => { setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t))); setErrs((e) => ({ ...e, [`tasks.${i}.${k}`]: "" })); };
  const move = (from: number, to: number) => setTasks((ts) => {
    if (to < 0 || to >= ts.length || from === to) return ts;
    const next = [...ts];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t!);
    return next;
  });
  const editable = row ? can.edit : can.create;
  const taskErr = Object.entries(errs).find(([k, v]) => k.startsWith("tasks") && v)?.[1];

  return (
    <>
      <PageHead eyebrow="Workforce / Talent / Onboarding" title="Onboarding" description="Pre-joining and first-30-day tasks for new joiners, assigned to HR, IT, Admin and Finance."
        actions={<>
          {(can.edit || can.create) && <button className="btn secondary" type="button" disabled={!rows} onClick={() => (shown && can.edit ? open(shown) : open("new"))}><ListChecks />Edit template</button>}
          <button className="btn primary" type="button" disabled title="New joiners are onboarded from Phase 31"><UserPlus />Add new joiner</button>
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>In Onboarding</span><span className="icon-well"><DoorOpen /></span></div><strong>0</strong><small>Onboardings start in Phase 31</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Tasks Completed</span><span className="icon-well"><CircleCheck /></span></div><strong>0 / 0</strong><small>No open onboardings</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Overdue Tasks</span><span className="icon-well"><AlertTriangle /></span></div><strong>0</strong><small>Nothing overdue</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Probation Reviews Due</span><span className="icon-well"><CalendarCheck /></span></div><strong>0</strong><small>Next 30 days</small></div>
      </div>

      <div className="split mb">
        <div className="panel flush">
          <div className="panel-head"><div><h3>New Joiners</h3><p>{shown ? `Template: ${shown.name} (${shown.tasks.length} task${shown.tasks.length === 1 ? "" : "s"})` : "No template yet"}</p></div></div>
          <EmptyState icon={<UserPlus />} title="No new joiners in onboarding" description="Joiners appear here once onboardings start from a template (Phase 31)." />
        </div>
        <div className="panel">
          <div className="panel-head">
            <div><h3>Checklist Template</h3><p>{shown ? <>{shown.name}{shown.isDefault && " · default"}{!shown.isActive && " · inactive"}</> : "None yet"}</p></div>
            <div className="panel-actions" style={{ flexWrap: "nowrap", gap: 4 }}>
              {rows && rows.length > 1 && (
                <select aria-label="Template" value={shown?.id ?? ""} onChange={(e) => setPicked(e.target.value)}>
                  {rows.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}
                </select>
              )}
              {can.create && <button className="btn ghost sm" type="button" aria-label="New template" title="New template" onClick={() => open("new")}><Plus /></button>}
              {shown && <button className="btn ghost sm" type="button" onClick={() => open(shown)}><Pencil />{can.edit ? "Edit" : "View"}</button>}
            </div>
          </div>
          {!rows ? <Skeleton style={{ height: 300 }} /> : !shown ? (
            <EmptyState icon={<ListChecks />} title="No checklist template" description={can.create ? "Create the tasks every new joiner goes through." : "Templates HR creates appear here."}
              action={can.create ? <button className="btn primary sm" type="button" onClick={() => open("new")}><Plus />New template</button> : undefined} />
          ) : !shown.tasks.length ? (
            <EmptyState icon={<ListChecks />} title="No tasks in this template" description="Edit the template to add tasks." />
          ) : groups.map((g) => (
            <Fragment key={g}>
              <div className="form-section"><h4>{labelOf(lookups, "TaskGroup", g)}</h4></div>
              <div className="stack">
                {shown.tasks.filter((t) => t.taskGroup === g).map((t) => (
                  <label key={t.id} className="check" title={`${labelOf(lookups, "OwnerFunction", t.ownerFunction)} · ${dueText(t.dueOffsetDays)}`}><input type="checkbox" checked readOnly /> {t.title}</label>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Open Tasks</h3><p>Across all new joiners</p></div><div className="panel-actions"><div className="chips"><button type="button" className="active">All <i>0</i></button><button type="button">Overdue <i>0</i></button><button type="button">Mine <i>0</i></button></div></div></div>
        <EmptyState icon={<CircleCheck />} title="No open tasks" description="Tasks are created for each new joiner from the checklist template (Phase 31)." />
      </div>

      {edit && (
        <RecordModal open xl onClose={() => setEdit(null)} busy={busy} title={row ? `Edit ${row.name}` : "New onboarding template"}
          subtitle="Tasks are copied to every onboarding started from this template, grouped and in this order."
          history={row ? { schema: "HumanResources", table: "OnboardingTemplates", id: row.id } : null}
          canSave={editable} canToggle={can.edit} active={row?.isActive} canDelete={can.remove}
          saveLabel={row ? "Save template" : "Create template"} onSave={save}
          onToggle={() => row && run(() => onboardingTemplateAction(row.id, row.isActive ? "deactivate" : "activate", row.rowVersion), `${row.name} ${row.isActive ? "deactivated" : "activated"}`)}
          onDelete={async () => { if (row) await run(() => deleteOnboardingTemplate(row.id, row.rowVersion), `${row.name} deleted`); }}
          deleteNote="Templates onboardings were started from can only be deactivated.">
          <FormGrid>
            <Field label="Template name" required error={errs.name}><input value={f.name} maxLength={80} placeholder="e.g. Standard Staff Onboarding" disabled={!editable} onChange={(e) => { setF((x) => ({ ...x, name: e.target.value })); setErrs((x) => ({ ...x, name: "" })); }} /></Field>
            <Field label="Track" error={errs.track} hint={row?.isDefault ? "Default template for this track" : undefined}>
              <select value={f.track} disabled={!editable} onChange={(e) => setF((x) => ({ ...x, track: e.target.value }))}>{lookupOptions(lookups, "Track", f.track).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
            </Field>
            {row && !row.isDefault && can.edit && row.isActive && (
              <div className="full"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(() => onboardingTemplateAction(row.id, "default", row.rowVersion), `${row.name} is now the default`)}><Star />Make default for {labelOf(lookups, "Track", row.track).toLowerCase()}</button></div>
            )}
          </FormGrid>
          <div className="form-section"><h4>Tasks</h4></div>
          {taskErr && <div className="banner danger mb"><AlertTriangle /><div><b>Check the tasks</b><p>{taskErr}</p></div></div>}
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th aria-label="Order" /><th>Group</th><th>Task</th><th>Owner</th><th className="num">Due (day)</th><th>Action</th><th /></tr></thead>
            <tbody>
              {tasks.map((t, i) => (
                <tr key={t.key} draggable={editable} onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }} className={cn(drag === i && "row-flash")}>
                  <td style={{ cursor: editable ? "grab" : undefined }}><GripVertical /></td>
                  <td><select aria-label="Group" value={t.taskGroup} disabled={!editable} onChange={(e) => setTask(i, "taskGroup", e.target.value)}>{lookupOptions(lookups, "TaskGroup", t.taskGroup).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></td>
                  <td style={{ minWidth: 220 }}><input aria-label="Task" value={t.title} maxLength={160} disabled={!editable} aria-invalid={!!errs[`tasks.${i}.title`]} placeholder="e.g. EOBI registration (PR-02)" onChange={(e) => setTask(i, "title", e.target.value)} /></td>
                  <td><select aria-label="Owner" value={t.ownerFunction} disabled={!editable} onChange={(e) => setTask(i, "ownerFunction", e.target.value)}>{lookupOptions(lookups, "OwnerFunction", t.ownerFunction).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></td>
                  <td className="num"><input aria-label="Due day" type="number" min={-90} max={365} style={{ width: 80 }} value={t.dueOffsetDays} disabled={!editable} onChange={(e) => setTask(i, "dueOffsetDays", e.target.value)} /></td>
                  <td><select aria-label="Action" value={t.actionKind} disabled={!editable} onChange={(e) => setTask(i, "actionKind", e.target.value)}>{lookupOptions(lookups, "ActionKind", t.actionKind).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></td>
                  <td className="actions">{editable && <>
                    <button type="button" className="icon-btn-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp /></button>
                    <button type="button" className="icon-btn-sm" aria-label="Move down" disabled={i === tasks.length - 1} onClick={() => move(i, i + 1)}><ArrowDown /></button>
                    <button type="button" className="icon-btn-sm" aria-label="Remove task" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))}><Trash2 /></button>
                  </>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {!tasks.length && <EmptyState icon={<ListChecks />} title="No tasks" description="Add the first task." />}
          {editable && <button type="button" className="btn secondary sm mt" onClick={() => setTasks((ts) => [...ts, blankRow(ts.at(-1)?.taskGroup)])}><Plus />Add task</button>}
          <p className="small muted mt">Due day counts from the joining date (0 = day 1, negative = before joining). Drag rows or use the arrows to reorder.</p>
        </RecordModal>
      )}
    </>
  );
}
