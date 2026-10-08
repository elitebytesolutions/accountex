"use client";

import { CalendarClock, CalendarPlus, HeartPulse, History, Siren, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MAINTENANCE_COMPONENTS, type MaintenanceWindow } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { ApiError } from "@/lib/api/errors";
import { IncidentsSection } from "@/features/platform-ops/components/incidents-section";
import { cancelMaintenanceWindow, createMaintenanceWindow, listMaintenanceWindows, updateMaintenanceWindow } from "../api";

const TZ = "Asia/Karachi";
const compLabel = (c: string) => MAINTENANCE_COMPONENTS.find((x) => x.code === c)?.label ?? c;
/** Date / time parts in PKT (the template schedules in PKT). */
const pkt = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, wd: p.weekday ?? "", d: p.day ?? "", mon: new Date(iso).toLocaleString("en-GB", { timeZone: TZ, month: "short" }) };
};
const toIso = (date: string, time: string) => new Date(`${date}T${time || "02:00"}:00+05:00`).toISOString();
const tomorrow = () => pkt(new Date(Date.now() + 864e5).toISOString()).date;
const STATUS_TONE: Record<string, string> = { SCHEDULED: "info", IN_PROGRESS: "warn", COMPLETED: "good", CANCELLED: "neutral" };
const STATUS_LABEL: Record<string, string> = { SCHEDULED: "Scheduled", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };

type Form = { title: string; date: string; time: string; dur: number; lead: number; msg: string; comps: string[]; readOnly: boolean };
const EMPTY: () => Form = () => ({ title: "Planned maintenance", date: tomorrow(), time: "02:00", dur: 60, lead: 72, msg: "Payroll runs and FBR submissions scheduled in this window will run right after.", comps: ["WEB_APP", "PAYROLL_ENGINE"], readOnly: false });

/**
 * Template admin/status (3A-admin-plus.html, 9B-admin-plus.js ~1950): status banner, public status page and incidents
 * (Phase 43: IncidentsSection), and the maintenance part: "Schedule maintenance" form with banner preview and "Upcoming
 * windows". Added: a read-only-mode switch (in the DB, not the template), edit and cancel of a window.
 */
export function StatusScreen() {
  const toast = useToast();
  const [windows, setWindows] = useState<MaintenanceWindow[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<MaintenanceWindow | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [cancelAsk, setCancelAsk] = useState<MaintenanceWindow | null>(null);
  const [history, setHistory] = useState<MaintenanceWindow | null>(null);
  const [now] = useState(() => Date.now());
  const [declare, setDeclare] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMaintenanceWindows("upcoming")
      .then((w) => { if (!cancelled) { setWindows(w); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load maintenance windows" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const start = new Date(`${form.date}T${form.time || "02:00"}:00+05:00`);
  const end = new Date(start.getTime() + form.dur * 60000);
  const valid = !Number.isNaN(start.getTime());
  const days = valid ? Math.max(0, Math.round((start.getTime() - now) / 864e5)) : 0;
  const s = valid ? pkt(start.toISOString()) : null, e = valid ? pkt(end.toISOString()) : null;

  const edit = (w: MaintenanceWindow) => {
    const a = pkt(w.startsAt);
    setEditing(w); setErrors({});
    setForm({ title: w.title, date: a.date, time: a.time, dur: Math.round((new Date(w.endsAt).getTime() - new Date(w.startsAt).getTime()) / 60000), lead: w.bannerLeadHours, msg: w.message ?? "", comps: w.components, readOnly: w.readOnlyMode });
  };
  const submit = async () => {
    if (!valid || end.getTime() <= Date.now()) { setErrors({ startsAt: "Pick a future date" }); toast("Pick a future date", { tone: "warn" }); return; }
    if (!form.comps.length) { setErrors({ components: "Select at least one component" }); toast("Select at least one component", { tone: "warn" }); return; }
    setBusy(true);
    const body = { title: form.title, message: form.msg, startsAt: toIso(form.date, form.time), endsAt: end.toISOString(), components: form.comps, bannerLeadHours: form.lead, readOnlyMode: form.readOnly };
    try {
      if (editing) await updateMaintenanceWindow(editing.id, { ...body, rowVersion: editing.rowVersion });
      else await createMaintenanceWindow(body);
      toast(editing ? "Maintenance window updated" : "Maintenance scheduled · banner and emails are sent with email delivery", { tone: "good" });
      setEditing(null); setForm(EMPTY()); setErrors({}); reload();
    } catch (err) {
      setErrors(adminFieldErrors(err));
      toast(adminErrorMessage(err, "Could not save the window"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const cancelWindow = async (w: MaintenanceWindow) => {
    setBusy(true);
    try { await cancelMaintenanceWindow(w.id, w.rowVersion); toast("Maintenance window cancelled", { tone: "warn" }); if (editing?.id === w.id) { setEditing(null); setForm(EMPTY()); } reload(); }
    catch (err) { toast(adminErrorMessage(err, "Could not cancel the window"), { tone: "danger" }); }
    finally { setBusy(false); setCancelAsk(null); }
  };

  return (
    <>
      <PageHead eyebrow="System / Status & Incidents" title="Status & Incidents" description="What tenants see on the status page, live incident updates and planned maintenance."
        actions={<>
          <Link className="btn secondary" href="/admin/system"><HeartPulse />System health</Link>
          <button type="button" className="btn danger" onClick={() => setDeclare(true)}><Siren />Declare incident</button>
        </>} />

      <IncidentsSection declareOpen={declare} onDeclareClose={() => setDeclare(false)} />

      <div className="grid-2 ap-maint">
        <div className="panel">
          <div className="panel-head"><div><h3>{editing ? "Edit maintenance window" : "Schedule maintenance"}</h3><p>Tenants get an in-app banner and an email</p></div>
            {editing && <div className="panel-actions"><button type="button" className="btn ghost sm" onClick={() => { setEditing(null); setForm(EMPTY()); setErrors({}); }}><X />New window</button></div>}</div>
          <div className="form-grid">
            <label className="full"><span>Title</span><input value={form.title} maxLength={120} onChange={(ev) => setForm({ ...form, title: ev.target.value })} aria-invalid={!!errors.title} /></label>
            <label><span>Date</span><input type="date" value={form.date} min={pkt(new Date(now).toISOString()).date} onChange={(ev) => setForm({ ...form, date: ev.target.value })} aria-invalid={!!errors.startsAt} />{errors.startsAt && <small className="hint text-danger">{errors.startsAt}</small>}</label>
            <label><span>Start (PKT)</span><input type="time" value={form.time} onChange={(ev) => setForm({ ...form, time: ev.target.value })} /></label>
            <label><span>Duration</span>
              <select value={form.dur} onChange={(ev) => setForm({ ...form, dur: Number(ev.target.value) })}>
                {[...new Set([30, 60, 90, 120, form.dur])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}
              </select>
              {errors.endsAt && <small className="hint text-danger">{errors.endsAt}</small>}
            </label>
            <label><span>Show banner</span><select value={form.lead} onChange={(ev) => setForm({ ...form, lead: Number(ev.target.value) })}><option value={72}>72 hours before</option><option value={24}>24 hours before</option><option value={1}>1 hour before</option></select></label>
            <label className="full"><span>What tenants should know</span><input value={form.msg} maxLength={1000} onChange={(ev) => setForm({ ...form, msg: ev.target.value })} /></label>
          </div>
          <div className="ap-lbl ap-mt">Affected components</div>
          <div className="ap-chipsel">
            {MAINTENANCE_COMPONENTS.map((c) => <button key={c.code} type="button" className={cn(form.comps.includes(c.code) && "on")} onClick={() => setForm({ ...form, comps: form.comps.includes(c.code) ? form.comps.filter((x) => x !== c.code) : [...form.comps, c.code] })}>{c.label}</button>)}
          </div>
          {errors.components && <small className="hint text-danger">{errors.components}</small>}
          <label className="switch ap-mt"><input type="checkbox" checked={form.readOnly} onChange={(ev) => setForm({ ...form, readOnly: ev.target.checked })} /><i /><span>Read-only mode for tenants during the window</span></label>
          <div className="form-actions ap-mt">
            {editing && <button type="button" className="btn ghost" disabled={busy} onClick={() => setCancelAsk(editing)}>Cancel window</button>}
            <button type="button" className="btn primary" disabled={busy} onClick={submit}><CalendarPlus />{busy ? "Saving…" : editing ? "Save changes" : "Schedule window"}</button>
          </div>
        </div>
        <div className="stack">
          <div className="panel"><div className="panel-head"><div><h3>In-app banner preview</h3><p>Exactly what tenants will see at the top of Accountex</p></div></div>
            <div className="ap-bprev"><div className="ap-bprev-app"><span className="ap-bprev-sb" /><div>
              <div className="ap-mbanner">{s && e && <><Wrench /><span><b>Scheduled maintenance</b> · {s.wd} {s.d} {s.mon}, {s.time}–{e.time} PKT. {form.comps.length ? `${form.comps.map(compLabel).join(", ")} may be unavailable.` : ""}{form.readOnly ? " Accountex will be read-only." : ""} {form.msg}</span><em>in {days} d</em><button type="button" aria-label="Dismiss">✕</button></>}</div>
              <div className="ap-bprev-lines"><i /><i /><i /></div>
            </div></div></div>
          </div>
          <div className="panel"><div className="panel-head"><div><h3>Upcoming windows</h3></div></div>
            {error ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : !windows ? <Skeleton style={{ height: 60 }} /> : windows.length === 0 ? (
              <EmptyState icon={<CalendarClock />} title="No upcoming windows" description="Scheduled maintenance appears here." />
            ) : (
              <div className="list">
                {windows.map((w) => {
                  const a = pkt(w.startsAt), b = pkt(w.endsAt);
                  return <div key={w.id} className={cn("list-item", editing?.id === w.id && "active")}>
                    <span className="icon-well yellow"><CalendarClock /></span>
                    <div><b>{a.wd} {a.d} {a.mon} · {a.time}–{b.time} PKT</b><small>{w.components.map(compLabel).join(", ")} · {w.title}{w.readOnlyMode ? " · read-only" : ""}</small></div>
                    <span className="spacer" />
                    <span className={cn("badge", STATUS_TONE[w.status] ?? "info")}>{STATUS_LABEL[w.status] ?? w.status}</span>
                    <button type="button" className="btn ghost sm" onClick={() => edit(w)}>Edit</button>
                    <button type="button" className="icon-btn-sm" aria-label="History" onClick={() => setHistory(w)}><History /></button>
                  </div>;
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog open={!!cancelAsk} onClose={() => setCancelAsk(null)} busy={busy} danger title="Cancel this maintenance window?" confirmLabel="Cancel window"
        onConfirm={() => cancelAsk && void cancelWindow(cancelAsk)}>The banner is withdrawn. The window stays in the history as cancelled.</ConfirmDialog>
      <Modal open={!!history} onClose={() => setHistory(null)} title="Window history" subtitle={history?.title}>
        {history && <AdminHistoryTab table="MaintenanceWindows" id={history.id} />}
      </Modal>
    </>
  );
}
