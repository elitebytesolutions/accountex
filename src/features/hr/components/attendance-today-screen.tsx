"use client";

import Link from "next/link";
import { CalendarCog, Clock, Fingerprint, House, Plane, Table, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AttendanceOptions, AttendanceToday } from "@/shared";
import { Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { initialsOf } from "@/features/auth/initials";
import { ApiError } from "@/lib/api/errors";
import { attendanceOptions, attendanceToday, markAttendance, processAttendance, waiveLate } from "../attendance-api";
import { dowDmy, hhmm, localToday, Person } from "./attendance-ui";

type Can = { create: boolean; edit: boolean };
const blank = { employeeId: "", date: "", status: "PRESENT", checkIn: "09:00", checkOut: "18:00", locationLabel: "", reason: "" };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** Template app/hr/attendance (50-hr-core.html): today's KPIs, status, department split, late arrivals, live check-ins, manual marking. */
export function AttendanceTodayScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [data, setData] = useState<AttendanceToday | null>(null);
  const [opts, setOpts] = useState<AttendanceOptions | null>(null);
  const [branch, setBranch] = useState("");
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mark, setMark] = useState(false);
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([attendanceToday({ branch }), opts ? Promise.resolve(opts) : attendanceOptions()])
      .then(([d, o]) => { if (!cancelled) { setData(d); setOpts(o); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load attendance" }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, branch]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const k = data?.kpis;
  const set = (key: keyof typeof blank, v: string) => { setF((x) => ({ ...x, [key]: v })); setErrs((e) => ({ ...e, [key]: "" })); };
  const save = async () => {
    setBusy(true);
    try {
      await markAttendance({ ...f, employeeIds: f.employeeId ? [f.employeeId] : [], checkOut: f.status === "ABSENT" ? "" : f.checkOut, checkIn: f.status === "ABSENT" ? "" : f.checkIn });
      const who = opts?.employees.find((x) => x.id === f.employeeId)?.name ?? "the employee";
      toast(`Attendance marked for ${who}`, { tone: "good" }); setMark(false); reload();
    } catch (e) { const fe = apiFieldErrors(e); setErrs({ ...fe, employeeId: fe.employeeIds ?? fe.employeeId ?? "" }); toast(apiMessage(e, "Could not mark attendance"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const process = async () => {
    setBusy(true);
    try { const r = await processAttendance({ date: data?.date ?? localToday() }); toast(`Day processed · ${r.written} register row${r.written === 1 ? "" : "s"} written`, { tone: "good" }); reload(); }
    catch (e) { toast(apiMessage(e, "Could not process the day"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const waive = async (id: string, rv: number, name: string) => {
    try { await waiveLate(id, rv); toast(`Late mark waived for ${name}`, { tone: "good" }); reload(); } catch (e) { toast(apiMessage(e, "Could not waive"), { tone: "danger" }); }
  };
  const presentPct = data ? pct(k!.present, data.total) : 0;

  return (
    <>
      <PageHead eyebrow="HR / Attendance" title="Attendance — Today"
        description={data ? `${dowDmy(data.date)} · live from ${data.devices} biometric device${data.devices === 1 ? "" : "s"} and self-service${data.lastSync ? ` · last sync ${hhmm(data.lastSync)}` : ""}` : "Loading…"}
        actions={<>
          <Link className="btn secondary" href="/hr/attendance/register"><Table />Monthly register</Link>
          <Link className="btn secondary" href="/hr/devices"><Fingerprint />Devices</Link>
          {can.edit && <button className="btn secondary" type="button" disabled={busy || !data} onClick={process}><CalendarCog />Process day</button>}
          {can.create && <button className="btn primary" type="button" onClick={() => { setErrs({}); setF({ ...blank, date: data?.date ?? localToday() }); setMark(true); }}><UserCheck />Mark attendance</button>}
        </>} />

      <div className="kpi-grid c5 mb">
        <div className="kpi"><div className="kpi-top"><span>Present</span><span className="icon-well"><UserCheck /></span></div><strong>{k?.present ?? "—"}</strong><small className="up">{data ? `${presentPct}% of ${data.total}` : ""}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Absent</span><span className="icon-well"><UserX /></span></div><strong>{k?.absent ?? "—"}</strong><small className="down">{k ? `${k.absentNoPunch} without intimation` : ""}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>On Leave</span><span className="icon-well"><Plane /></span></div><strong>{k?.onLeave ?? "—"}</strong><small>Approved leaves</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Late</span><span className="icon-well"><Clock /></span></div><strong>{k?.late ?? "—"}</strong><small>{k?.late ? `Avg. ${k.avgLateMinutes} min after grace` : "No late arrivals"}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Work from Home</span><span className="icon-well"><House /></span></div><strong>{k?.wfh ?? "—"}</strong><small>Geo check-in via self-service</small></div>
      </div>

      <div className="grid-3 mb">
        <div className="panel">
          <div className="panel-head"><div><h3>Today&apos;s status</h3><p>{data ? `${data.total} employees` : "…"}</p></div></div>
          {!data ? <Skeleton style={{ height: 140 }} /> : (
            <div className="row" style={{ justifyContent: "center", gap: 28 }}>
              <div className="donut" style={{ ["--p" as string]: Math.round(presentPct), ["--c" as string]: "var(--brand-600)" }}><b>{Math.round(presentPct)}%</b><small>Present</small></div>
              <div className="stack small">
                <div className="row"><span className="badge good dot">Present</span><span className="spacer" /><b>{k!.present}</b></div>
                <div className="row"><span className="badge warn dot">Late (incl.)</span><span className="spacer" /><b>{k!.late}</b></div>
                <div className="row"><span className="badge info dot">Leave</span><span className="spacer" /><b>{k!.onLeave}</b></div>
                <div className="row"><span className="badge violet dot">WFH (incl.)</span><span className="spacer" /><b>{k!.wfh}</b></div>
                <div className="row"><span className="badge danger dot">Absent</span><span className="spacer" /><b>{k!.absent}</b></div>
                <div className="row"><span className="badge neutral dot">Not yet in</span><span className="spacer" /><b>{k!.notYetIn}</b></div>
              </div>
            </div>
          )}
        </div>
        <div className="panel" style={{ gridColumn: "span 2" }}>
          <div className="panel-head"><div><h3>By department</h3><p>Present · late · leave · absent</p></div>
            <div className="panel-actions"><select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"><option value="">All branches</option>{opts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div></div>
          {!data ? <Skeleton style={{ height: 160 }} /> : data.byDepartment.length ? (
            <div className="stack">
              {data.byDepartment.map((d) => {
                const w = (n: number) => `${d.total ? (n / d.total) * 100 : 0}%`;
                return (
                  <div key={d.department}>
                    <div className="row small"><b>{d.department}</b><span className="spacer" /><span className="muted">{d.total} · {d.in} in</span></div>
                    <div className="stackbar"><i style={{ width: w(d.onTime), background: "var(--primary)" }} /><i style={{ width: w(d.late), background: "var(--warn)" }} /><i style={{ width: w(d.leave), background: "var(--blue)" }} /><i style={{ width: w(d.absent), background: "var(--danger)" }} /></div>
                  </div>
                );
              })}
              <div className="legend"><span><i style={{ background: "var(--primary)" }} />On time</span><span><i style={{ background: "var(--warn)" }} />Late</span><span><i style={{ background: "var(--blue)" }} />Leave</span><span><i style={{ background: "var(--danger)" }} />Absent</span></div>
            </div>
          ) : <EmptyState title="No employees" description="Employees of the branch appear here." />}
        </div>
      </div>

      <div className="split">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Late arrivals</h3><p>Minutes after the shift start and grace</p></div></div>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Employee</th><th>Department</th><th>Branch</th><th>Check-in</th><th className="num">Late by</th><th>Late this month</th><th>Action</th></tr></thead>
            <tbody>
              {!data ? <tr><td colSpan={7}><Skeleton style={{ height: 80 }} /></td></tr> : data.late.length ? data.late.map((l) => (
                <tr key={l.day.id}>
                  <td><Person e={l.employee} /></td><td>{l.employee.department ?? "—"}</td><td>{l.employee.branch ?? "—"}</td>
                  <td>{hhmm(l.day.firstIn)}{l.day.shift && l.day.shift.code !== "GEN" && <> <small className="muted">({l.day.shift.name})</small></>}</td>
                  <td className="num neg">{l.day.lateMinutes} min</td>
                  <td>{l.lateThisMonth >= 3 ? <span className="badge danger">{l.lateThisMonth}th — deduct ½ day</span> : l.lateThisMonth === 1 ? <span className="badge neutral">1st</span> : <span className="badge warn">{l.lateThisMonth === 2 ? "2nd" : `${l.lateThisMonth}rd`}</span>}</td>
                  <td>{can.edit && <button className="btn ghost sm" type="button" onClick={() => waive(l.day.id, l.day.rowVersion, l.employee.name)}>Waive</button>}</td>
                </tr>
              )) : <tr><td colSpan={7}><EmptyState icon={<Clock />} title="No late arrivals" description="Late check-ins after the grace period appear here." /></td></tr>}
            </tbody>
          </table></div>
          <div className="table-foot"><span>{data ? `Showing ${data.late.length} late arrival${data.late.length === 1 ? "" : "s"}` : ""}</span><Link className="btn ghost sm" href="/hr/attendance/requests">Regularisation requests</Link></div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Live check-ins</h3><p><span className="badge good dot">Today</span></p></div></div>
          {!data ? <Skeleton style={{ height: 160 }} /> : data.live.length ? (
            <div className="list">
              {data.live.map((p) => (
                <div className="list-item" key={p.id}><span className="avatar sm">{initialsOf(p.employee.name)}</span>
                  <div><b>{p.employee.name}</b><small>{hhmm(p.punchAt)} · {p.device ?? (p.source === "ESS_GEO" ? "Self-service" : "Manual")}{p.locationLabel ? ` · ${p.locationLabel}` : ""}</small></div>
                  <span className="spacer" />
                  {p.direction === "OUT" ? <span className="badge neutral">Out</span> : p.workMode === "WFH" ? <span className="badge violet">WFH</span> : p.workMode === "FIELD" ? <span className="badge info">Field</span> : <span className="badge good">In</span>}
                </div>
              ))}
            </div>
          ) : <EmptyState icon={<Fingerprint />} title="No check-ins yet" description="Device and self-service punches appear here as they arrive." />}
        </div>
      </div>

      <Modal open={mark} onClose={() => setMark(false)} wide title="Mark attendance manually" subtitle="Entries are flagged &quot;Manual&quot; in the register and audit log."
        foot={<><button className="btn secondary" type="button" onClick={() => setMark(false)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save attendance"}</button></>}>
        <div className="form-grid c3">
          <Field label="Employee(s)" required error={errs.employeeId}><select value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)}><option value="">Choose…</option>{opts?.employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.code}</option>)}</select></Field>
          <Field label="Date" required error={errs.date}><input type="date" value={f.date} max={localToday()} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Status" required error={errs.status}><select value={f.status} onChange={(e) => set("status", e.target.value)}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="HALF_DAY">Half day</option><option value="WFH">Work from home</option><option value="ON_DUTY">On duty (field)</option></select></Field>
          <Field label="Check-in" error={errs.checkIn}><input type="time" value={f.checkIn} disabled={f.status === "ABSENT"} onChange={(e) => set("checkIn", e.target.value)} /></Field>
          <Field label="Check-out" error={errs.checkOut}><input type="time" value={f.checkOut} disabled={f.status === "ABSENT"} onChange={(e) => set("checkOut", e.target.value)} /></Field>
          <Field label="Location" error={errs.locationLabel}><select value={f.locationLabel} onChange={(e) => set("locationLabel", e.target.value)}><option value="">—</option>{opts?.branches.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}<option value="Client site">Client site</option></select></Field>
          <Field label="Reason" required full error={errs.reason}><textarea rows={2} value={f.reason} maxLength={500} placeholder="e.g. Biometric device offline 08:30–09:45; employee signed the manual register." onChange={(e) => set("reason", e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}
