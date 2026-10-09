"use client";

import Link from "next/link";
import { CalendarDays, CheckCheck, ClipboardList, Clock, FileText, Landmark, MoreHorizontal, Plus, ReceiptText, TriangleAlert, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApprovalInbox, ApprovalItem, Task, TodayView, WorkUser } from "@/shared";
import { TASK_MODULES } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Menu } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { approvalAct, approvalBulk, approvalInbox } from "@/features/ledger/api";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { completeTask, createTask, deleteTask, getToday, setTaskStatus, updateTask, workUsers } from "../api";
import { clock, dayName, fmtDate, longDate, money, MODULE_LABEL, PRIORITY, rs, rsShort, TASK_STATUS, whenShort } from "./work-ui";

type Chip = "ALL" | "PENDING" | "IN_PROGRESS" | "DONE";
const statusOf = (t: Task) => (t.overdue ? "OVERDUE" : t.status);

/** Template app/today (40-acc-core.html): KPIs, this week, my tasks, approvals queue, what is due, agenda, tax calculator. */
export function TodayScreen({ firstName, userId }: { firstName: string; userId: string }) {
  const toast = useToast();
  const [view, setView] = useState<TodayView | null>(null);
  const [inbox, setInbox] = useState<ApprovalInbox | null>(null);
  const [users, setUsers] = useState<WorkUser[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chip, setChip] = useState<Chip>("ALL");
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; task: Task } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getToday(), approvalInbox().catch(() => null)])
      .then(([v, a]) => { if (!cancelled) { setView(v); setInbox(a); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load today's work" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => { void workUsers().then(setUsers).catch(() => undefined); }, []);

  const tasks = useMemo(() => (view?.tasks ?? []).filter((t) => t.status !== "CANCELLED"), [view]);
  const todays = useMemo(() => tasks.filter((t) => t.dueDate <= (view?.date ?? "") || t.overdue), [tasks, view]);
  const shown = todays.filter((t) => chip === "ALL" || (chip === "DONE" ? t.status === "DONE" : t.status === chip));
  const count = (c: Chip) => (c === "ALL" ? todays.length : todays.filter((t) => (c === "DONE" ? t.status === "DONE" : t.status === c)).length);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, { tone: "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not complete that"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const toggleDone = (t: Task) => {
    if (!t.canEdit || busy) return;
    if (t.status === "DONE") return;
    void act(async () => {
      const r = await completeTask(t.id, t.rowVersion);
      if (r.next) toast(`Next "${t.title}" is due ${fmtDate(r.next.dueDate)}`, { tone: "info" });
    }, "Task done");
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const k = view?.kpis;
  const due = view?.due ?? [];
  const sections: { kind: string; title: string; icon: React.ReactNode }[] = [
    { kind: "INVOICE_DUE", title: "Invoices due (receivable)", icon: <ReceiptText /> },
    { kind: "BILL_DUE", title: "Bills due (payable)", icon: <FileText /> },
    { kind: "CHEQUE_MATURING", title: "Cheques maturing", icon: <Landmark /> },
  ];
  const agenda = tasks.filter((t) => t.dueDate === view?.date && t.dueTime).sort((a, b) => (a.dueTime ?? "").localeCompare(b.dueTime ?? ""));
  const approvals = (inbox?.items ?? []).slice(0, 8);

  return (
    <>
      <PageHead
        eyebrow="Workspace / Today"
        title="Today's Work"
        description={view ? `${longDate(view.date)} — good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${firstName}.` : undefined}
        actions={
          <>
            <Link className="btn secondary" href="/notifications"><CalendarDays />Notifications</Link>
            <Button variant="primary" icon={<Plus />} onClick={() => setEditing("new")}>Add Task</Button>
          </>
        }
      />

      {!view || !k ? <Skeleton style={{ height: 520 }} /> : (
        <>
          <div className="kpi-grid c5">
            <div className="kpi"><div className="kpi-top"><span>Tasks due today</span><span className="icon-well"><ClipboardList /></span></div><strong>{k.tasksDueToday}</strong><small>{k.tasksDoneToday} completed</small></div>
            <div className="kpi red"><div className="kpi-top"><span>Overdue</span><span className="icon-well"><TriangleAlert /></span></div><strong>{k.overdueTasks}</strong><small className={k.overdueTasks ? "down" : undefined}>{k.oldestOverdueDate ? `Since ${fmtDate(k.oldestOverdueDate).slice(0, 6)}` : "Nothing overdue"}</small></div>
            <div className="kpi yellow"><div className="kpi-top"><span>Awaiting approval</span><span className="icon-well"><Clock /></span></div><strong>{k.awaitingApprovalCount}</strong><small>{rsShort(k.awaitingApprovalValue)} total value</small></div>
            <div className="kpi blue"><div className="kpi-top"><span>Due today</span><span className="icon-well"><Wallet /></span></div><strong>{rs(k.dueTodayAmount)}</strong><small>Invoices, bills &amp; cheques</small></div>
            <div className="kpi violet"><div className="kpi-top"><span>Daily progress</span><span className="icon-well"><CheckCheck /></span></div><strong>{Math.round(k.dailyProgressPct)}%</strong><div className="progress mt"><i style={{ width: `${Math.min(100, k.dailyProgressPct)}%` }} /></div></div>
          </div>

          <div className="panel mt">
            <div className="panel-head"><div><h3>This week</h3><p>{fmtDate(view.week[0]?.date)} – {fmtDate(view.week[6]?.date)}</p></div></div>
            <div className="grid-7" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 10 }}>
              {view.week.map((d) => {
                const isToday = d.date === view.date;
                const weekend = ["Sat", "Sun"].includes(dayName(d.date));
                return (
                  <div key={d.date} className="panel" style={{ padding: 12, margin: 0, boxShadow: "none", ...(isToday ? { outline: "2px solid var(--primary)" } : {}) }}>
                    <small className={weekend ? "muted" : undefined}>{dayName(d.date)}{isToday ? " · Today" : ""}</small>
                    <b style={{ display: "block", fontSize: 18 }}>{d.date.slice(8, 10)}</b>
                    {d.overdue > 0 ? <Badge tone="danger">{d.overdue} overdue</Badge>
                      : d.tasks > 0 ? <Badge tone="warn">{d.tasks} task{d.tasks === 1 ? "" : "s"}</Badge>
                      : d.due > 0 ? <Badge tone="info">{d.due} due</Badge>
                      : <small className="muted">Free</small>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="split mt">
            <div className="stack">
              <div className="panel flush">
                <div className="panel-head">
                  <div><h3>My task list</h3><p>Sorted by due time</p></div>
                  <div className="panel-actions"><div className="chips">
                    {([["ALL", "All"], ["PENDING", "Pending"], ["IN_PROGRESS", "In progress"], ["DONE", "Done"]] as [Chip, string][]).map(([c, l]) => (
                      <button key={c} type="button" className={chip === c ? "active" : undefined} onClick={() => setChip(c)}>{l} <i>{count(c)}</i></button>
                    ))}
                  </div></div>
                </div>
                {!shown.length ? <EmptyState icon={<ClipboardList />} title={chip === "ALL" ? "Nothing due today" : "No tasks here"} description="Add a task for yourself or give one to a colleague." /> : (
                  <div className="table-wrap"><table className="tbl">
                    <thead><tr><th style={{ width: 36 }} /><th>Task</th><th>Module</th><th>Priority</th><th>Due</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {shown.map((t) => {
                        const st = TASK_STATUS[statusOf(t)]!;
                        const mod = MODULE_LABEL[t.module];
                        return (
                          <tr key={t.id}>
                            <td><input type="checkbox" aria-label={`Done: ${t.title}`} checked={t.status === "DONE"} disabled={!t.canEdit || t.status === "DONE" || busy} onChange={() => toggleDone(t)} /></td>
                            <td><b>{t.title}</b><small>{t.notes ?? (t.assignee?.id !== userId ? `For ${t.assignee?.name}` : t.assignedBy && t.assignedBy.id !== userId ? `From ${t.assignedBy.name}` : "")}</small></td>
                            <td>{mod ? <Link className="link" href={t.linkRoute ?? mod.href}>{mod.label}</Link> : t.module}</td>
                            <td><Badge tone={PRIORITY[t.priority]?.tone ?? "neutral"} dot>{PRIORITY[t.priority]?.label ?? t.priority}</Badge></td>
                            <td>{t.dueDate === view.date ? (t.dueTime ? clock(t.dueTime) : "Today") : fmtDate(t.dueDate)}</td>
                            <td><Badge tone={st.tone}>{st.label}</Badge></td>
                            <td className="actions">{t.canEdit && t.status !== "DONE" && <button type="button" className="icon-btn-sm" aria-label="Task actions" onClick={(e) => setMenu({ el: e.currentTarget, task: t })}><MoreHorizontal /></button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                )}
              </div>

              <div className="panel flush">
                <div className="panel-head">
                  <div><h3>Approvals queue</h3><p>Items waiting for you</p></div>
                  {approvals.length > 0 && <div className="panel-actions"><Button size="sm" disabled={!selected.size || busy} onClick={() => void act(async () => { const r = await approvalBulk({ ids: [...selected], action: "approve", reason: null }); setSelected(new Set()); if (r.failed.length) throw new Error(r.failed[0]!.message); }, `${selected.size} approved`)}>Approve selected</Button></div>}
                </div>
                {!approvals.length ? <EmptyState icon={<CheckCheck />} title="Nothing waiting for you" description="Documents routed to you for approval appear here." /> : (
                  <div className="table-wrap"><table className="tbl">
                    <thead><tr><th style={{ width: 36 }} /><th>Document</th><th>Requested by</th><th>Submitted</th><th className="num">Amount</th><th /></tr></thead>
                    <tbody>
                      {approvals.map((a) => (
                        <tr key={a.id}>
                          <td><input type="checkbox" aria-label={`Select ${a.docLabel}`} checked={selected.has(a.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} /></td>
                          <td><Link className="link" href={a.link || "/approvals"}>{a.docLabel}</Link><small>{a.title ?? a.workflow.name}</small></td>
                          <td>{a.requestedBy.name}</td>
                          <td>{whenShort(a.requestedAt)}</td>
                          <td className="num">{a.amount !== null ? money(a.amount) : "—"}</td>
                          <td className="actions" style={{ whiteSpace: "nowrap" }}>
                            <button type="button" className="btn primary sm" disabled={busy} onClick={() => void act(() => approvalAct(a.id, "approve", { reason: null, comment: null }), `${a.docLabel} approved`)}>Approve</button>{" "}
                            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setRejecting(a)}>Reject</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </div>
            </div>

            <div className="stack">
              <div className="panel">
                <div className="panel-head"><div><h3>Due today</h3><p>{rs(k.dueTodayAmount)} across {due.filter((d) => !d.isOverdue).length} item{due.filter((d) => !d.isOverdue).length === 1 ? "" : "s"}</p></div></div>
                {sections.map((s) => {
                  const items = due.filter((d) => d.kind === s.kind && !d.isOverdue);
                  return items.length ? (
                    <div key={s.kind}>
                      <div className="form-section"><h4>{s.title}</h4></div>
                      <div className="list">
                        {items.slice(0, 5).map((d, i) => (
                          <Link key={`${d.docNo}${i}`} className="list-item" href={d.href}>
                            <span className="icon-well">{s.icon}</span>
                            <div><b>{d.docNo ?? d.title}</b><small>{d.party ?? ""}</small></div>
                            <span className="spacer" />
                            <b className={d.direction === "OUT" ? "cr" : undefined}>{money(d.amount)}</b>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })}
                {!due.some((d) => !d.isOverdue) && <p className="small muted">Nothing falls due today.{due.length ? ` ${due.length} older item(s) are overdue.` : ""}</p>}
              </div>
              <div className="panel">
                <div className="panel-head"><div><h3>Agenda</h3></div><Button size="sm" onClick={() => setEditing("new")}>Remind me</Button></div>
                {!agenda.length ? <p className="small muted">No timed tasks today.</p> : (
                  <div className="timeline">
                    {agenda.map((t) => (
                      <div key={t.id} className="tl-item">
                        <span className={`tl-dot ${t.status === "DONE" ? "good" : t.overdue ? "danger" : t.priority === "HIGH" ? "warn" : ""}`} />
                        <div><b>{clock(t.dueTime)} · {t.title}</b><small>{MODULE_LABEL[t.module]?.label ?? t.module}{t.remindBeforeMin ? ` · reminder ${t.remindBeforeMin} min before` : ""}</small></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <TaxCalculator />
            </div>
          </div>
        </>
      )}

      {menu && (
        <Menu anchor={menu.el} onClose={() => setMenu(null)} items={[
          { label: "Edit", onClick: () => setEditing(menu.task) },
          ...(menu.task.status === "PENDING" ? [{ label: "Start", onClick: () => void act(() => setTaskStatus(menu.task.id, menu.task.rowVersion, "IN_PROGRESS"), "Task started") }] : [{ label: "Back to pending", onClick: () => void act(() => setTaskStatus(menu.task.id, menu.task.rowVersion, "PENDING"), "Task back to pending") }]),
          { label: "Mark done", onClick: () => toggleDone(menu.task) },
          { sep: true },
          menu.task.status === "PENDING"
            ? { label: "Delete", danger: true, onClick: () => setDeleting(menu.task) }
            : { label: "Cancel task", danger: true, onClick: () => void act(() => setTaskStatus(menu.task.id, menu.task.rowVersion, "CANCELLED"), "Task cancelled") },
        ]} />
      )}
      <TaskModal task={editing} users={users} userId={userId} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); toast(msg, { tone: "good" }); reload(); }} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger confirmLabel="Delete" title={`Delete "${deleting?.title ?? ""}"?`} busy={busy}
        onConfirm={() => deleting && void act(() => deleteTask(deleting.id, deleting.rowVersion), "Task deleted").then(() => setDeleting(null))}>
        The task is removed. Started tasks are cancelled instead.
      </ConfirmDialog>
      <RejectModal item={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); reload(); }} />
    </>
  );
}

/** Template modal acc-new-task: title, module, assignee, due date / time, priority, repeat, notes, reminder. */
function TaskModal({ task, users, userId, onClose, onSaved }: { task: Task | "new" | null; users: WorkUser[]; userId: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const toast = useToast();
  const blank = { title: "", module: "ACCOUNTING", assigneeUserId: userId, dueDate: new Date().toISOString().slice(0, 10), dueTime: "", priority: "MEDIUM", repeatRule: "NEVER", notes: "", remind: true };
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<Task | "new" | null>(null);
  if (task !== seen) {
    setSeen(task);
    setErrs({});
    if (task === "new") setF(blank);
    else if (task) setF({ title: task.title, module: task.module, assigneeUserId: task.assignee?.id ?? userId, dueDate: task.dueDate, dueTime: task.dueTime ?? "", priority: task.priority, repeatRule: task.repeatRule, notes: task.notes ?? "", remind: task.remindBeforeMin !== null });
  }
  const save = async () => {
    setBusy(true);
    setErrs({});
    const body = { title: f.title, module: f.module, assigneeUserId: f.assigneeUserId, dueDate: f.dueDate, dueTime: f.dueTime || null, priority: f.priority, repeatRule: f.repeatRule, notes: f.notes || null, remindBeforeMin: f.remind && f.dueTime ? 30 : null };
    try {
      if (task && task !== "new") await updateTask(task.id, { ...body, rowVersion: task.rowVersion });
      else await createTask(body);
      onSaved(task && task !== "new" ? "Task updated" : f.assigneeUserId !== userId ? "Task added and assigned" : "Task added");
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the task"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof blank, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={!!task} onClose={onClose} title={task && task !== "new" ? "Edit task" : "Add task"} subtitle="Create a personal or delegated task"
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : task && task !== "new" ? "Save" : "Add task"}</button></>}>
      <FormGrid>
        <Field label="Title" required full error={errs.title}><input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Reconcile HBL statement" /></Field>
        <Field label="Module" error={errs.module}>
          <select value={f.module} onChange={(e) => set("module", e.target.value)}>{TASK_MODULES.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]?.label ?? m}</option>)}</select>
        </Field>
        <Field label="Assign to" error={errs.assigneeUserId}>
          <select value={f.assigneeUserId} onChange={(e) => set("assigneeUserId", e.target.value)}>
            <option value={userId}>(me)</option>
            {users.filter((u) => u.id !== userId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Due date" required error={errs.dueDate}><input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field>
        <Field label="Due time" error={errs.dueTime}><input type="time" value={f.dueTime} onChange={(e) => set("dueTime", e.target.value)} /></Field>
        <Field label="Priority"><select value={f.priority} onChange={(e) => set("priority", e.target.value)}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></Field>
        <Field label="Repeat"><select value={f.repeatRule} onChange={(e) => set("repeatRule", e.target.value)}><option value="NEVER">Never</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></Field>
        <Field label="Notes" full error={errs.notes}><textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <Check full label="Remind me 30 minutes before" checked={f.remind} onChange={(e) => set("remind", e.target.checked)} disabled={!f.dueTime} />
      </FormGrid>
    </Modal>
  );
}

function RejectModal({ item, onClose, onDone }: { item: ApprovalItem | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<ApprovalItem | null>(null);
  if (item !== seen) { setSeen(item); setReason(""); }
  const save = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await approvalAct(item.id, "reject", { reason, comment: null });
      toast(`${item.docLabel} rejected`, { tone: "good" });
      onDone();
    } catch (e) {
      toast(apiMessage(e, "Could not reject it"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!item} onClose={onClose} title={`Reject ${item?.docLabel ?? ""}`} subtitle="The requester sees your reason."
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn danger solid" onClick={() => void save()} disabled={busy || reason.trim().length < 3}>{busy ? "Rejecting…" : "Reject"}</button></>}>
      <FormGrid cols={1}><Field label="Reason" required><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></FormGrid>
    </Modal>
  );
}

/** Template Tax Calculator (9K-calc.js wireTax): amount, rate and type → net, tax, total. The calculator tape is not ported. */
function TaxCalculator() {
  const TYPES = [{ k: "GST", label: "Sales Tax (GST)", rate: 18 }, { k: "WHT", label: "WHT 153(1)(a)", rate: 5 }, { k: "FT", label: "Further tax", rate: 4 }, { k: "PRA", label: "Provincial PRA", rate: 16 }];
  const [amount, setAmount] = useState("100000");
  const [type, setType] = useState("GST");
  const [rate, setRate] = useState("18");
  const a = Number(amount.replace(/,/g, "")) || 0;
  const r = Number(rate) || 0;
  const tax = Math.round(a * r) / 100;
  const total = type === "WHT" ? a - tax : a + tax;
  return (
    <div className="panel">
      <div className="panel-head"><div><h3>Tax Calculator</h3><p>Quick GST / WHT check</p></div><button type="button" className="btn ghost sm" onClick={() => { setAmount(""); setType("GST"); setRate("18"); }}>Reset</button></div>
      <FormGrid>
        <Field label="Amount (PKR)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Rate %"><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        <Field label="Type" full>
          <select value={type} onChange={(e) => { setType(e.target.value); setRate(String(TYPES.find((t) => t.k === e.target.value)?.rate ?? 0)); }}>
            {TYPES.map((t) => <option key={t.k} value={t.k}>{t.label} · {t.rate}%</option>)}
          </select>
        </Field>
      </FormGrid>
      <dl className="mt" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px" }}>
        <dt className="muted">Net amount</dt><dd className="num">{money(a)}</dd>
        <dt className="muted">{type === "WHT" ? "Tax withheld" : "Tax"}</dt><dd className="num">{money(tax)}</dd>
        <dt><b>{type === "WHT" ? "Payable after WHT" : "Total"}</b></dt><dd className="num"><b>{money(total)}</b></dd>
      </dl>
    </div>
  );
}
