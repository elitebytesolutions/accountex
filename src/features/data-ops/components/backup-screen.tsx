"use client";

import { Archive, CircleCheck, CircleX, Clock, DatabaseBackup, Download, FileDown, HardDrive, Info, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BackupSettingsSchema, RestoreRequestSchema, type BackupOverview, type BackupSnapshot } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, Switch } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { companyTimeZone } from "@/lib/company-time";
import { backupDownloadUrl, backups, cancelRestore, requestRestore, runBackup, saveBackupSettings } from "../api";
import "./backup-screen.css";

export type BackupCan = { create: boolean; export: boolean };

const KIND: Record<string, string> = { SCHEDULED: "Scheduled", MANUAL: "Manual", MONTHLY: "Monthly", YEAR_END: "Year-end", SAFETY: "Safety" };
const SNAP_STATUS: Record<string, [string, string]> = { COMPLETED: ["good dot", "Completed"], RUNNING: ["info dot", "Running…"], PARTIAL: ["warn dot", "Partial"], FAILED: ["danger dot", "Failed"] };
const RESTORE_STATUS: Record<string, [string, string]> = {
  REQUESTED: ["neutral", "Requested"], SCHEDULED: ["warn", "Scheduled"], RUNNING: ["info dot", "Running"], COMPLETED: ["good dot", "Completed"], FAILED: ["danger dot", "Failed"], CANCELLED: ["neutral", "Cancelled"],
};
const FREQ: Record<string, string> = { DAILY: "Daily", EVERY_12_HOURS: "Every 12 hours", WEEKLY: "Weekly" };

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: companyTimeZone(), day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtShort = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: companyTimeZone(), day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function fmtBytes(n: number | null) {
  if (n === null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
}
const fmtDuration = (s: number | null) => (s === null ? "" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

type Schedule = { frequency: string; runAt: string; keepDailyDays: number; keepMonthlyMonths: number; includeAttachments: boolean; emailOwnerOnFailure: boolean };

/** Settings › Backup & Restore (template 60-settings-ess.html app/settings/backup). Restores are requested here and carried out by Accountex support. */
export function BackupScreen({ can }: { can: BackupCan }) {
  const toast = useToast();
  const [data, setData] = useState<BackupOverview | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    backups()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load backups" }); });
    return () => { cancelled = true; };
  }, [attempt]);

  const running = data?.snapshots.some((s) => s.status === "RUNNING") ?? false;
  // While a snapshot runs, poll every 3 s until it finishes.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [running, reload]);

  const [starting, setStarting] = useState(false);
  const [restore, setRestore] = useState<{ snapshotId: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; code: string } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const completed = (data?.snapshots ?? []).filter((s) => s.status === "COMPLETED");

  const backUp = async () => {
    setStarting(true);
    try {
      await runBackup();
      toast("Backup started — refresh to see it complete", { tone: "info" });
      reload();
    } catch (e) {
      toast(errMsg(e, "Could not start the backup"), { tone: e instanceof ApiError && e.code === "BACKUP_RUNNING" ? "warn" : "danger" });
    } finally {
      setStarting(false);
    }
  };

  const k = data?.kpis;
  const lastOk = k?.lastStatus === "COMPLETED";

  return (
    <>
      <PageHead eyebrow="Settings / Backup & Restore" title="Backup & Restore"
        description="Encrypted snapshots of your company data, scheduled backups and restore on request."
        actions={can.create && <>
          <button type="button" className="btn danger" disabled={!data || completed.length === 0} title={data && completed.length === 0 ? "No completed backup to restore from" : undefined}
            onClick={() => setRestore({ snapshotId: completed[0]?.id ?? "" })}><RotateCcw />Restore…</button>
          <button type="button" className="btn primary" disabled={starting || running} onClick={() => void backUp()}><DatabaseBackup />{running ? "Backing up…" : starting ? "Starting…" : "Back up now"}</button>
        </>} />

      {error && <ErrorState message={error.message} reference={error.reference} onRetry={reload} />}

      {(data || !error) && <div className="kpi-grid">
        {!data || !k ? [0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 104 }} />) : <>
          <div className="kpi"><div className="kpi-top"><span>Last backup</span><span className="icon-well">{k.lastStatus && !lastOk ? <CircleX /> : <CircleCheck />}</span></div>
            <strong>{k.lastBackupAt ? fmtShort(k.lastBackupAt) : "Never"}</strong>
            {k.lastStatus ? <small className={lastOk ? "up" : "down"}>{lastOk ? "Successful" : k.lastStatus === "PARTIAL" ? "Partial" : "Failed"}{k.lastDurationSec !== null && ` · ${fmtDuration(k.lastDurationSec)}`}</small> : <small>No backup yet</small>}</div>
          <div className="kpi teal"><div className="kpi-top"><span>Backup size</span><span className="icon-well"><HardDrive /></span></div>
            <strong>{fmtBytes(k.lastSizeBytes)}</strong><small>{data.settings.includeAttachments ? "Incl. attachments" : "Attachments excluded"}</small></div>
          <div className="kpi blue"><div className="kpi-top"><span>Retention</span><span className="icon-well"><Archive /></span></div>
            <strong>{k.retentionDays} days</strong><small>+ {data.settings.keepMonthlyMonths} monthly snapshots</small></div>
          <div className="kpi violet"><div className="kpi-top"><span>Next scheduled</span><span className="icon-well"><Clock /></span></div>
            <strong>{k.nextRunAt ? fmtShort(k.nextRunAt) : "Not scheduled"}</strong><small>{FREQ[data.settings.frequency] ?? data.settings.frequency} · {data.settings.timezone}</small></div>
        </>}
      </div>}

      <div className="split mt">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Backups</h3><p>Encrypted company snapshots · download as JSON</p></div></div>
          {!data ? (error ? null : <Skeleton style={{ height: 200 }} />) : data.snapshots.length === 0 ? (
            <EmptyState icon={<DatabaseBackup />} title="No backups yet" description={can.create ? "Take the first snapshot with Back up now." : "No snapshots have been taken yet."} />
          ) : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Snapshot</th><th>Type</th><th>Started</th><th className="num">Size</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.snapshots.map((s) => <SnapshotRow key={s.id} s={s} can={can} onRestore={() => setRestore({ snapshotId: s.id })} />)}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="stack">
          {data ? <SchedulePanel key={data.settings.rowVersion ?? "new"} overview={data} canEdit={can.create} onSaved={setData} /> : !error && <Skeleton style={{ height: 320 }} />}
          <div className="panel">
            <div className="panel-head"><div><h3>Export data</h3><p>Download per module</p></div></div>
            <EmptyState icon={<FileDown />} title="Per-module export arrives later" description="Use a backup download for a full copy of your data meanwhile." />
          </div>
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Restore requests</h3><p>Restores are carried out by Accountex support, who contact you before they start</p></div></div>
        {!data ? (error ? null : <Skeleton style={{ height: 80 }} />) : data.restoreRequests.length === 0 ? (
          <EmptyState icon={<RotateCcw />} title="No restore requests" description="Requests you make from a completed backup appear here." />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Snapshot</th><th>Reason</th><th>Requested</th><th>Safety backup</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.restoreRequests.map((r) => {
                const [tone, label] = RESTORE_STATUS[r.status] ?? ["neutral", r.status];
                return (
                  <tr key={r.id}>
                    <td><b>{r.snapshot.snapshotCode}</b></td>
                    <td>{r.reason ?? "—"}</td>
                    <td>{fmtDateTime(r.requestedAt)}{r.requestedBy && <small>by {r.requestedBy.name}</small>}</td>
                    <td>{r.takeSafetyBackup ? (r.safetySnapshotCode ?? "Yes") : "No"}</td>
                    <td><span className={`badge ${tone}`}>{label}</span>{r.error && <small className="text-danger">{r.error}</small>}{r.completedAt && <small>{fmtDateTime(r.completedAt)}</small>}</td>
                    <td className="actions">{can.create && (r.status === "REQUESTED" || r.status === "SCHEDULED") && (
                      <button type="button" className="btn ghost sm" onClick={() => setCancelling({ id: r.id, code: r.snapshot.snapshotCode })}>Cancel</button>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {restore && data && <RestoreModal key={restore.snapshotId} overview={data} snapshots={completed} initialId={restore.snapshotId} onClose={() => setRestore(null)} onDone={reload} />}
      <ConfirmDialog open={!!cancelling} onClose={() => setCancelling(null)} confirmLabel="Cancel request" busy={cancelBusy} title="Cancel this restore request?"
        onConfirm={async () => {
          const c = cancelling!;
          setCancelBusy(true);
          try {
            await cancelRestore(c.id);
            toast("Restore request cancelled", { tone: "good" });
            setCancelling(null);
            reload();
          } catch (e) {
            toast(errMsg(e, "Could not cancel the request"), { tone: "danger" });
          } finally {
            setCancelBusy(false);
          }
        }}>
        The restore from {cancelling?.code} will not be carried out.
      </ConfirmDialog>
    </>
  );
}

function SnapshotRow({ s, can, onRestore }: { s: BackupSnapshot; can: BackupCan; onRestore: () => void }) {
  const [tone, label] = s.isLocked && s.status === "COMPLETED" ? ["violet dot", "Locked"] : SNAP_STATUS[s.status] ?? ["neutral", s.status];
  const ok = s.status === "COMPLETED";
  return (
    <tr>
      <td><b>{s.snapshotCode}</b>{s.note && <small>{s.note}</small>}</td>
      <td>{KIND[s.kind] ?? s.kind}</td>
      <td>{fmtDateTime(s.startedAt)}{s.requestedBy && <small>by {s.requestedBy.name}</small>}</td>
      <td className={s.sizeBytes === null ? "num zero" : "num"}>{fmtBytes(s.sizeBytes)}</td>
      <td><span className={`badge ${tone}`}>{label}</span>{s.statusNote && <small className={cn(s.status === "FAILED" && "text-danger")}>{s.statusNote}</small>}</td>
      <td className="actions"><div className="row bak-nowrap">
        {can.export && ok && <a className="icon-btn-sm" href={backupDownloadUrl(s.id)} download aria-label={`Download ${s.snapshotCode}`} title="Download"><Download /></a>}
        {can.create && ok && !s.isLocked && <button type="button" className="icon-btn-sm" aria-label={`Restore ${s.snapshotCode}`} title="Restore…" onClick={onRestore}><RotateCcw /></button>}
      </div></td>
    </tr>
  );
}

function SchedulePanel({ overview, canEdit, onSaved }: { overview: BackupOverview; canEdit: boolean; onSaved: (o: BackupOverview) => void }) {
  const toast = useToast();
  const st = overview.settings;
  const [f, setF] = useState<Schedule>({
    frequency: st.frequency, runAt: st.runAt.slice(0, 5), keepDailyDays: st.keepDailyDays, keepMonthlyMonths: st.keepMonthlyMonths,
    includeAttachments: st.includeAttachments, emailOwnerOnFailure: st.emailOwnerOnFailure,
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Schedule>(key: K, v: Schedule[K]) => { setF((x) => ({ ...x, [key]: v })); setErrs((x) => ({ ...x, [key]: "" })); };

  const save = async () => {
    const parsed = BackupSettingsSchema.safeParse(f);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      setErrs(e);
      return;
    }
    setBusy(true);
    try {
      onSaved(await saveBackupSettings(parsed.data));
      toast("Backup schedule saved", { tone: "good" });
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrs(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])));
      toast(errMsg(e, "Could not save the schedule"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head"><div><h3>Schedule</h3></div></div>
      <div className="form-grid">
        <Field label="Frequency" error={errs.frequency}><select value={f.frequency} disabled={!canEdit} onChange={(e) => set("frequency", e.target.value)}>
          {Object.entries(FREQ).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Time" error={errs.runAt}><input type="time" value={f.runAt} disabled={!canEdit} aria-invalid={!!errs.runAt} onChange={(e) => set("runAt", e.target.value)} /></Field>
        <Field label="Keep daily for" error={errs.keepDailyDays}><select value={f.keepDailyDays} disabled={!canEdit} onChange={(e) => set("keepDailyDays", Number(e.target.value))}>
          {[14, 35, 90].map((n) => <option key={n} value={n}>{n} days</option>)}</select></Field>
        <Field label="Monthly snapshots" error={errs.keepMonthlyMonths}><select value={f.keepMonthlyMonths} disabled={!canEdit} onChange={(e) => set("keepMonthlyMonths", Number(e.target.value))}>
          {[12, 24].map((n) => <option key={n} value={n}>{n} months</option>)}</select></Field>
      </div>
      <div className="stack mt bak-switches">
        <Switch label="Include attachments & receipts" checked={f.includeAttachments} disabled={!canEdit} onChange={(e) => set("includeAttachments", e.target.checked)} />
        <Switch label="Email Owner on failure" checked={f.emailOwnerOnFailure} disabled={!canEdit} onChange={(e) => set("emailOwnerOnFailure", e.target.checked)} />
        <Switch label="Copy to my Google Drive (coming later)" checked={false} disabled readOnly />
      </div>
      <p className="small muted mt bak-note"><Info className="bak-ico" /> Scheduled runs start with the background job scheduler (later phase); use Back up now meanwhile.</p>
      {canEdit && <div className="form-actions"><button type="button" className="btn primary sm" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save schedule"}</button></div>}
    </div>
  );
}

function RestoreModal({ overview, snapshots, initialId, onClose, onDone }: {
  overview: BackupOverview; snapshots: BackupSnapshot[]; initialId: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [snapshotId, setSnapshotId] = useState(initialId || snapshots[0]?.id || "");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [takeSafetyBackup, setTakeSafetyBackup] = useState(true);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const code = overview.companyCode;

  const go = async () => {
    const e: Record<string, string> = {};
    if (!snapshotId) e.snapshotId = "Pick a completed backup";
    const parsed = RestoreRequestSchema.safeParse({ reason, confirmText, takeSafetyBackup });
    if (!parsed.success) for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
    if (!e.confirmText && confirmText.trim() !== code) e.confirmText = `Type ${code} exactly`;
    setErrs(e);
    setFormError(null);
    if (Object.keys(e).length || !parsed.success) return;
    setBusy(true);
    try {
      await requestRestore(snapshotId, parsed.data);
      toast("Restore requested — Accountex support will carry it out and contact you", { tone: "good", ms: 6000 });
      onDone();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESTORE_CONFIRM_MISMATCH") setErrs({ confirmText: `Type ${code} exactly` });
      else if (err instanceof ApiError && (err.code === "RESTORE_ALREADY_OPEN" || err.code === "BACKUP_NOT_AVAILABLE")) setFormError(err.message);
      else {
        if (err instanceof ApiError && err.details) setErrs(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? ""])));
        toast(errMsg(err, "Could not request the restore"), { tone: "danger" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Restore from backup" subtitle="This replaces ALL current company data."
      foot={<>
        <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn danger" disabled={busy || !snapshots.length} onClick={() => void go()}><RotateCcw />{busy ? "Requesting…" : "Restore data"}</button>
      </>}>
      <div className="mb"><Banner tone="danger" title="Destructive action">Transactions entered after the selected snapshot will be lost. All users will be signed out while Accountex support carries out the restore.</Banner></div>
      {formError && <div className="mb"><Banner tone="warn" title="Can't request this restore">{formError}</Banner></div>}
      {snapshots.length === 0 ? <EmptyState icon={<DatabaseBackup />} title="No completed backups" description="Take a backup first." /> : (
        <div className="form-grid">
          <Field label="Snapshot" full error={errs.snapshotId}>
            <select value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)}>
              {snapshots.map((s) => <option key={s.id} value={s.id}>{s.snapshotCode} · {fmtDateTime(s.startedAt)}</option>)}
            </select>
          </Field>
          <Field label="Reason" required full error={errs.reason}>
            <textarea rows={2} value={reason} aria-invalid={!!errs.reason} placeholder="Required for audit trail" onChange={(e) => { setReason(e.target.value); setErrs((x) => ({ ...x, reason: "" })); }} />
          </Field>
          <label className="full">
            <span>Type <b>{code}</b> to confirm</span>
            <input value={confirmText} placeholder={code} aria-invalid={!!errs.confirmText} autoComplete="off" onChange={(e) => { setConfirmText(e.target.value); setErrs((x) => ({ ...x, confirmText: "" })); }} />
            {errs.confirmText && <small className="hint text-danger" role="alert">{errs.confirmText}</small>}
          </label>
          <label className="check full"><input type="checkbox" checked={takeSafetyBackup} onChange={(e) => setTakeSafetyBackup(e.target.checked)} /> Take a safety backup of current data first</label>
        </div>
      )}
    </Modal>
  );
}
