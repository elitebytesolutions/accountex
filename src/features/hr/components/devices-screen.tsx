"use client";

import { AlertTriangle, Download, Fingerprint, MoreHorizontal, Plus, RefreshCw, ScanFace, Users, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SYNC_INTERVALS, type Device, type DeviceSyncLog, type HrFormOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createDevice, deleteDevice, deviceLogs, hrBranches, listDevices, setDeviceActive, updateDevice } from "../api";
import { RecordModal } from "./record-modal";

const when = (iso: string | null) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  const ago = mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  return `${d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · ${ago}`;
};
const NO_CONNECTOR = "The device connector arrives with attendance; until then devices are registered only.";

/** Template app/hr/devices (50-hr-core.html): KPIs, device cards, sync logs and the add-device modal. Sync / test connection wait for the connector. */
export function DevicesScreen({ can }: { can: { create: boolean; edit: boolean; remove: boolean } }) {
  const toast = useToast();
  const lookups = useLookups(["Brand", "ConnectionType", "BiometricDevicePunchDirection", "BiometricDeviceStatus", "Operation", "DeviceSyncLogResult"]);
  const [rows, setRows] = useState<Device[] | null>(null);
  const [logs, setLogs] = useState<DeviceSyncLog[]>([]);
  const [branches, setBranches] = useState<HrFormOptions["branches"]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [logDevice, setLogDevice] = useState("");
  /** When the data was loaded (the 7-day failure window counts from it). */
  const [loadedAt, setLoadedAt] = useState(0);
  const [drawer, setDrawer] = useState<Device | null>(null);
  const [edit, setEdit] = useState<{ row: Device | null } | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listDevices(), deviceLogs(), hrBranches()])
      .then(([d, l, b]) => { if (!cancelled) { setRows(d); setLogs(l); setBranches(b); setLoadedAt(Date.now()); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load devices" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const live = (rows ?? []).filter((d) => d.isActive);
  const online = live.filter((d) => d.status === "ONLINE").length;
  const unstable = live.filter((d) => d.status === "UNSTABLE").length;
  const enrolled = live.reduce((s, d) => s + d.usersEnrolled, 0);
  const weekAgo = loadedAt - 7 * 86400000;
  const failures = logs.filter((l) => l.result === "FAILED" && new Date(l.occurredAt).getTime() >= weekAgo);
  const lost = live.filter((d) => d.status === "OFFLINE" && d.lastHeartbeatAt);
  const shownLogs = logDevice ? logs.filter((l) => l.device === logDevice) : logs;
  const intervals = [...new Set(live.map((d) => d.syncIntervalMin))];

  const open = (row: Device | null) => {
    setErrs({});
    setEdit({ row });
    setF({
      code: row?.code ?? "", locationLabel: row?.locationLabel ?? "", brand: row?.brand ?? "ZKTECO", model: row?.model ?? "", serialNo: row?.serialNo ?? "", branchId: row?.branch.id ?? branches[0]?.id ?? "",
      connectionType: row?.connectionType ?? "ADMS_PUSH", ipAddress: row?.ipAddress ?? "", port: String(row?.port ?? 4370), commKey: "", timezone: row?.timezone ?? "Asia/Karachi",
      punchDirection: row?.punchDirection ?? "AUTO", syncIntervalMin: String(row?.syncIntervalMin ?? 5), firmwareVersion: row?.firmwareVersion ?? "",
    });
  };
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => {
    if (!edit) return;
    const { commKey, ...rest } = f;
    const body = { ...rest, ...(commKey && { commKey }) };
    return run(() => (edit.row ? updateDevice(edit.row.id, { ...body, rowVersion: edit.row.rowVersion }) : createDevice(body)), edit.row ? `${f.code} saved` : "Device added");
  };
  const sel = (k: string, type: string) => <select value={f[k]} onChange={(e) => set(k, e.target.value)}>{lookupOptions(lookups, type, f[k]).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>;
  const icon = (d: Device) => (/face/i.test(d.model) ? <ScanFace /> : <Fingerprint />);
  const branchNames = [...new Set(live.map((d) => d.branch.name))];

  return (
    <>
      <PageHead eyebrow="HR / Attendance" title="Biometric Devices"
        description={live.length ? `${live.length} terminal${live.length === 1 ? "" : "s"} across ${branchNames.length} branch${branchNames.length === 1 ? "" : "es"}${intervals.length === 1 ? ` · sync every ${intervals[0]} minute${intervals[0] === 1 ? "" : "s"}` : ""}.` : "ZKTeco terminals per branch, ADMS push or TCP pull."}
        actions={<>
          <button className="btn secondary" type="button" disabled title={NO_CONNECTOR}><RefreshCw />Sync all</button>
          {can.create && <button className="btn primary" type="button" disabled={!branches.length} onClick={() => open(null)}><Plus />Add device</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Online</span><span className="icon-well"><Wifi /></span></div><strong>{online} / {live.length}</strong><small>{unstable} warning · {live.length - online - unstable} offline</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Punches today</span><span className="icon-well"><Fingerprint /></span></div><strong>—</strong><small>With attendance</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Users enrolled</span><span className="icon-well"><Users /></span></div><strong>{enrolled}</strong><small>As last reported by the devices</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Sync failures (7d)</span><span className="icon-well"><AlertTriangle /></span></div><strong>{failures.length}</strong><small>{failures[0] ? `${failures[0].device} last` : "None"}</small></div>
      </div>

      {lost.map((d) => (
        <div key={d.id} className="banner danger mb"><WifiOff /><div><b>{d.code}{d.locationLabel && ` (${d.locationLabel})`} offline</b><p>Last heartbeat {when(d.lastHeartbeatAt)}. Check LAN / power at {d.branch.name}.</p></div></div>
      ))}

      {!rows ? <Skeleton style={{ height: 240 }} /> : !rows.length ? (
        <div className="panel mb"><EmptyState icon={<ScanFace />} title="No devices yet" description={can.create ? "Register each terminal with its serial number and branch. Punches are pulled once attendance is live." : "Devices HR registers appear here."} /></div>
      ) : (
        <div className="card-grid mb">
          {rows.map((d) => (
            <div key={d.id} className={cn("card", !d.isActive && "muted")}>
              <div className="row"><span className="icon-well">{icon(d)}</span><div><b>{d.code}{d.locationLabel && ` · ${d.locationLabel}`}</b><small className="muted" style={{ display: "block" }}>{d.model} · {d.branch.name}</small></div><span className="spacer" />
                {d.isActive ? <span className={cn("badge dot", toneOf(lookups, "BiometricDeviceStatus", d.status))}>{labelOf(lookups, "BiometricDeviceStatus", d.status)}</span> : <span className="badge neutral">Inactive</span>}</div>
              <div className="dl mt">
                <div><span>IP / Serial</span><b>{d.ipAddress ?? labelOf(lookups, "ConnectionType", d.connectionType)} · {d.serialNo}</b></div>
                <div><span>Last sync</span><b>{when(d.lastSyncAt)}</b></div>
                <div><span>Users enrolled</span><b>{d.usersEnrolled}{(d.facesEnrolled || d.fingersEnrolled) ? ` (face ${d.facesEnrolled} · finger ${d.fingersEnrolled})` : ""}</b></div>
                <div><span>Punches today</span><b>—</b></div>
              </div>
              <div className="row mt">
                <button className="btn secondary sm" type="button" disabled title={NO_CONNECTOR}><RefreshCw />Sync</button>
                <button className="btn ghost sm" type="button" onClick={() => setDrawer(d)}>Logs</button>
                <span className="spacer" />
                {(can.edit || can.remove) && <button className="icon-btn-sm" type="button" aria-label={`Edit ${d.code}`} onClick={() => open(d)}><MoreHorizontal /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="panel flush">
        <div className="panel-head"><div><h3>Sync logs</h3><p>Latest 100 entries</p></div>
          <div className="panel-actions">
            <select value={logDevice} onChange={(e) => setLogDevice(e.target.value)} aria-label="Device"><option value="">All devices</option>{rows?.map((d) => <option key={d.id} value={d.code}>{d.code}</option>)}</select>
            <button className="btn ghost sm" type="button" disabled={!shownLogs.length} onClick={() => downloadCsv("device-sync-logs.csv", [["Time", "Device", "Operation", "Records", "Duration (ms)", "Result", "Message"], ...shownLogs.map((l) => [l.occurredAt, l.device ?? "All devices", labelOf(lookups, "Operation", l.operation), l.records, l.durationMs, labelOf(lookups, "DeviceSyncLogResult", l.result), l.message])])}><Download />Export</button>
          </div></div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Time</th><th>Device</th><th>Operation</th><th className="num">Records</th><th className="num">Duration</th><th>Result</th><th>Message</th></tr></thead>
          <tbody>
            {shownLogs.length ? shownLogs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.occurredAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>{l.device ?? "All devices"}</td><td>{labelOf(lookups, "Operation", l.operation)}</td>
                <td className={cn("num", l.records === null && "zero")}>{l.records ?? "—"}</td><td className="num">{l.durationMs === null ? "—" : `${(l.durationMs / 1000).toFixed(1)} s`}</td>
                <td><span className={cn("badge", toneOf(lookups, "DeviceSyncLogResult", l.result))}>{labelOf(lookups, "DeviceSyncLogResult", l.result)}</span></td><td className="muted">{l.message ?? ""}</td>
              </tr>
            )) : <tr><td colSpan={7}><EmptyState icon={<RefreshCw />} title="No sync activity yet" description={NO_CONNECTOR} /></td></tr>}
          </tbody>
        </table></div>
      </div>

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={`Device log · ${drawer?.code ?? ""}`} subtitle="Latest entries">
        {drawer && (logs.filter((l) => l.device === drawer.code).length ? (
          <div className="timeline">{logs.filter((l) => l.device === drawer.code).map((l) => <div key={l.id} className="tl-item"><span className={cn("tl-dot", l.result === "FAILED" ? "danger" : l.result === "PARTIAL" ? "warn" : "")} /><div><b>{l.message ?? labelOf(lookups, "Operation", l.operation)}</b><small>{new Date(l.occurredAt).toLocaleString("en-GB")}</small></div></div>)}</div>
        ) : <EmptyState title="No log entries" description={NO_CONNECTOR} />)}
      </Drawer>

      {edit && (
        <RecordModal open wide onClose={() => setEdit(null)} busy={busy} title={edit.row ? `Edit ${edit.row.code}` : "Add biometric device"} subtitle="Supports ZKTeco ADMS push and TCP pull (port 4370)."
          history={edit.row ? { schema: "HumanResources", table: "BiometricDevices", id: edit.row.id } : null} active={edit.row?.isActive}
          canSave={edit.row ? can.edit : can.create} canToggle={can.edit} canDelete={can.remove} saveLabel={edit.row ? "Save" : "Add device"} onSave={save}
          onToggle={() => edit.row && run(() => setDeviceActive(edit.row!.id, !edit.row!.isActive, edit.row!.rowVersion), `${edit.row.code} ${edit.row.isActive ? "deactivated" : "activated"}`)}
          onDelete={async () => { if (edit.row) await run(() => deleteDevice(edit.row!.id, edit.row!.rowVersion), `${edit.row.code} deleted`); }}
          deleteNote="Only a device with no punches or sync logs can be deleted; otherwise deactivate it.">
          <FormGrid cols={3}>
            <Field label="Device code" required error={errs.code}><input value={f.code} maxLength={20} placeholder="ZK-ISB-02" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Location" error={errs.locationLabel}><input value={f.locationLabel} maxLength={60} placeholder="Server Room" onChange={(e) => set("locationLabel", e.target.value)} /></Field>
            <Field label="Branch" required error={errs.branchId}><select value={f.branchId} onChange={(e) => set("branchId", e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Brand" error={errs.brand}>{sel("brand", "Brand")}</Field>
            <Field label="Model" required error={errs.model}><input value={f.model} maxLength={60} placeholder="SpeedFace-V5L" list="zk-models" onChange={(e) => set("model", e.target.value)} />
              <datalist id="zk-models">{["SpeedFace-V5L", "SpeedFace-V4L", "MB460", "K40", "uFace 800", "iClock 680"].map((m) => <option key={m} value={m} />)}</datalist></Field>
            <Field label="Serial number" required error={errs.serialNo}><input value={f.serialNo} maxLength={40} placeholder="CN7H2…" onChange={(e) => set("serialNo", e.target.value)} /></Field>
            <Field label="Connection" error={errs.connectionType}>{sel("connectionType", "ConnectionType")}</Field>
            <Field label="IP address" required={f.connectionType === "TCP_PULL"} error={errs.ipAddress}><input value={f.ipAddress} placeholder="172.16.5.31" onChange={(e) => set("ipAddress", e.target.value)} /></Field>
            <Field label="Port" error={errs.port}><input inputMode="numeric" value={f.port} onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Comm key" error={errs.commKey} hint={edit.row?.hasCommKey ? "Set — leave blank to keep" : "Stored, never shown again"}><input type="password" autoComplete="new-password" value={f.commKey} placeholder={edit.row?.hasCommKey ? "••••••" : ""} onChange={(e) => set("commKey", e.target.value)} /></Field>
            <Field label="Time zone" error={errs.timezone}><select value={f.timezone} onChange={(e) => set("timezone", e.target.value)}><option value="Asia/Karachi">Asia/Karachi (UTC+5)</option></select></Field>
            <Field label="Punch direction" error={errs.punchDirection}>{sel("punchDirection", "BiometricDevicePunchDirection")}</Field>
            <Field label="Sync interval" error={errs.syncIntervalMin}><select value={f.syncIntervalMin} onChange={(e) => set("syncIntervalMin", e.target.value)}>{SYNC_INTERVALS.map((m) => <option key={m} value={m}>{m === 60 ? "Hourly" : `${m} minute${m === 1 ? "" : "s"}`}</option>)}</select></Field>
            <Field label="Firmware" error={errs.firmwareVersion}><input value={f.firmwareVersion} maxLength={40} placeholder="Ver 6.60 Apr 2024" onChange={(e) => set("firmwareVersion", e.target.value)} /></Field>
            <label className="check full" title={NO_CONNECTOR}><input type="checkbox" disabled /> Upload all branch employees to device after connection <small className="muted">— with the device connector</small></label>
          </FormGrid>
        </RecordModal>
      )}
    </>
  );
}
