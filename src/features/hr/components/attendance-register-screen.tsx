"use client";

import Link from "next/link";
import { AlarmClock, CalendarCheck, CalendarCog, CalendarX, ChevronLeft, ChevronRight, Download, History, Lock, LockOpen, PencilLine, Printer, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceOptions, AttendanceRegisterView, RegisterDay } from "@/shared";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { attendanceOptions, attendanceRegister, lockRegister, processAttendance, unlockRegister, waiveLate } from "../attendance-api";
import { dmy, dowDmy, dowShort, hhmm, localToday, minutes, monthLabel, shiftMonth, StatusBadge } from "./attendance-ui";

const CELL: Record<string, string> = { P: "p", A: "a", L: "l", H: "h", W: "w", LT: "lt", HD: "hd" };
const PAGE = 25;

/** Template app/hr/attendance/register (50-hr-core.html): the monthly grid, lock banner and month KPIs; days open a detail / history modal. */
export function AttendanceRegisterScreen({ can }: { can: { edit: boolean; approve: boolean } }) {
  const toast = useToast();
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [branch, setBranch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AttendanceRegisterView | null>(null);
  const [opts, setOpts] = useState<AttendanceOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<{ day: RegisterDay; name: string } | null>(null);
  const [tab, setTab] = useState<"day" | "history">("day");
  const [confirm, setConfirm] = useState<"lock" | "unlock" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([attendanceRegister({ month, search: q, department, branch }), opts ? Promise.resolve(opts) : attendanceOptions()])
      .then(([d, o]) => { if (!cancelled) { setData(d); setOpts(o); setError(null); setPage(1); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the register" }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, month, q, department, branch]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const rows = useMemo(() => data?.rows.slice((page - 1) * PAGE, page * PAGE) ?? [], [data, page]);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await work(); toast(done, { tone: "good" }); reload(); } catch (e) { toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } finally { setBusy(false); setConfirm(null); }
  };
  const exportCsv = () => data && downloadCsv(`Attendance_${month}.csv`, [
    ["Employee", "Code", "Department", ...data.days.map((d) => d.slice(8)), "Payable", "Present", "Absent", "Late", "Leave"],
    ...data.rows.map((r) => [r.employee.name, r.employee.code, r.employee.department, ...data.days.map((d) => r.days[d]?.code ?? ""), r.payable, r.present, r.absent, r.late, r.leave]),
  ]);
  const future = month > localToday().slice(0, 7);
  const pages = data ? Math.max(1, Math.ceil(data.rows.length / PAGE)) : 1;
  const cols = data?.days.length ?? 30;

  return (
    <>
      <PageHead eyebrow={<><Link className="link" href="/hr/attendance">HR / Attendance</Link> / Register</>} title="Monthly Attendance Register"
        description={data ? `${monthLabel(month)} · ${data.workingDays} working days · ${data.weeklyOffs} weekly offs${data.locked ? ` · locked ${dmy(data.locked.lockedAt.slice(0, 10))}${data.locked.payrollRunId ? " for payroll" : ""}` : ""}` : monthLabel(month)}
        actions={<>
          <button className="btn secondary" type="button" onClick={() => window.print()}><Printer />Print</button>
          <button className="btn secondary" type="button" disabled={!data} onClick={exportCsv}><Download />Export</button>
          {can.edit && !data?.locked && <button className="btn secondary" type="button" disabled={busy || future} onClick={() => run(() => processAttendance({ month }), `${monthLabel(month)} processed`)}><CalendarCog />Process month</button>}
          {can.approve && (data?.locked
            ? <button className="btn primary" type="button" disabled={busy || !!data.locked.payrollRunId} onClick={() => setConfirm("unlock")} title={data.locked.payrollRunId ? "Payroll consumed this register" : undefined}><LockOpen />Unlock</button>
            : <button className="btn primary" type="button" disabled={busy || !data || future} onClick={() => setConfirm("lock")}><Lock />Lock for payroll</button>)}
          {!can.approve && data?.locked && <button className="btn primary" type="button" disabled><Lock />Locked</button>}
        </>} />

      {data?.locked && (
        <div className="banner info mb"><Lock /><div><b>Attendance locked on {dmy(data.locked.lockedAt.slice(0, 10))}</b><p>{data.locked.payrollRunId ? "Payroll consumed this register. Changes now require an adjustment in the next payroll." : "Punches, corrections and manual marking for this month are blocked until it is unlocked."}</p></div></div>
      )}

      <div className="panel flush">
        <div className="panel-head"><div><h3>Monthly register</h3><p>{monthLabel(month)} · P present · A absent · L leave · H holiday</p></div></div>
        <div className="toolbar">
          <div className="row"><button className="btn secondary sm icon" type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></button><b>{monthLabel(month)}</b><button className="btn secondary sm icon" type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></button></div>
          <label className="search-field"><Search /><input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{opts?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"><option value="">All branches</option>{opts?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <span className="spacer" />
          <div className="legend"><span><i style={{ background: "var(--primary)" }} />P Present</span><span><i style={{ background: "var(--danger)" }} />A Absent</span><span><i style={{ background: "var(--blue)" }} />L Leave</span><span><i style={{ background: "var(--info)" }} />H Holiday</span><span><i style={{ background: "var(--muted-2)" }} />W Weekly off</span><span><i style={{ background: "var(--warn)" }} />LT Late</span><span><i style={{ background: "var(--violet)" }} />HD Half day</span></div>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Employee</th><th>
            <div className="att-grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, minWidth: 780, textAlign: "center" }}>
              {(data?.days ?? []).map((d) => <span key={d}>{Number(d.slice(8))}<br />{dowShort(d).slice(0, 2)}</span>)}
            </div></th><th className="num" title="Payable days">P</th></tr></thead>
          <tbody>
            {!data ? <tr><td colSpan={3}><Skeleton style={{ height: 160 }} /></td></tr> : rows.length ? rows.map((r) => (
              <tr key={r.employee.id}>
                <td><div className="cell-user"><span className="avatar sm">{r.employee.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span><div><b><Link className="link" href={`/hr/employees/${r.employee.id}`}>{r.employee.name}</Link></b><small>{r.employee.code}{r.employee.department ? ` · ${r.employee.department}` : ""}</small></div></div></td>
                <td><div className="att-grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, minWidth: 780 }}>
                  {data.days.map((d) => {
                    const x = r.days[d];
                    return x ? <i key={d} className={CELL[x.code]} role="button" tabIndex={0} title={`${dowDmy(d)} · ${x.status}`} style={{ cursor: "pointer" }}
                      onClick={() => { setTab("day"); setOpen({ day: x, name: r.employee.name }); }} onKeyDown={(e) => e.key === "Enter" && setOpen({ day: x, name: r.employee.name })}>{x.code}</i>
                      : <i key={d} title={`${dowDmy(d)} · not processed`}>·</i>;
                  })}
                </div></td>
                <td className="num">{r.payable % 1 ? r.payable.toFixed(1) : r.payable}</td>
              </tr>
            )) : <tr><td colSpan={3}><EmptyState icon={<CalendarCheck />} title="No employees" description="Employees working this month appear here." /></td></tr>}
          </tbody>
        </table></div>
        <div className="table-foot"><span>{data ? `Showing ${rows.length} of ${data.total} employees · Payable = present + leave + weekly off + ½ half days` : ""}</span>
          {pages > 1 && <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>{i + 1}</button>)}<button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button></div>}
        </div>
      </div>

      <div className="kpi-grid mt">
        <div className="kpi"><div className="kpi-top"><span>Avg. attendance</span><span className="icon-well"><CalendarCheck /></span></div><strong>{data?.kpis.avgAttendance != null ? `${data.kpis.avgAttendance}%` : "—"}</strong><div className="progress"><i style={{ width: `${data?.kpis.avgAttendance ?? 0}%` }} /></div></div>
        <div className="kpi red"><div className="kpi-top"><span>Total absent days</span><span className="icon-well"><CalendarX /></span></div><strong>{data?.kpis.absentDays ?? "—"}</strong><small>Unpaid · deducted in payroll</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Late marks</span><span className="icon-well"><AlarmClock /></span></div><strong>{data?.kpis.lateMarks ?? "—"}</strong><small>3 lates = ½ day</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Manual entries</span><span className="icon-well"><PencilLine /></span></div><strong>{data?.kpis.manualEntries ?? "—"}</strong><small>Marked by HR or regularised</small></div>
      </div>

      {open && (
        <Modal open onClose={() => setOpen(null)} title={`${open.name} · ${dmy(open.day.date)}`} subtitle={open.day.shift ? `${open.day.shift.name} ${open.day.shift.startTime} – ${open.day.shift.endTime}` : "No shift"}
          foot={<>
            <button className="btn ghost" type="button" onClick={() => setTab(tab === "day" ? "history" : "day")}><History />{tab === "day" ? "History" : "Back to the day"}</button>
            <span className="spacer" />
            {can.edit && open.day.status === "LATE" && !open.day.lockedAt && <button className="btn secondary" type="button" disabled={busy} onClick={() => run(() => waiveLate(open.day.id, open.day.rowVersion), `Late mark waived for ${open.name}`).then(() => setOpen(null))}>Waive late mark</button>}
            <button className="btn secondary" type="button" onClick={() => setOpen(null)}>Close</button>
          </>}>
          {tab === "history" ? <HistoryTab schema="HumanResources" table="AttendanceRegister" id={open.day.id} /> : (
            <div className="dl">
              <div><span>Status</span><b><StatusBadge status={open.day.status} />{open.day.isManual && <> <span className="badge neutral">Manual</span></>}{open.day.lockedAt && <> <span className="badge info">Locked</span></>}</b></div>
              <div><span>Check-in</span><b>{hhmm(open.day.firstIn)}</b></div>
              <div><span>Check-out</span><b>{hhmm(open.day.lastOut)}</b></div>
              <div><span>Worked</span><b>{minutes(open.day.workedMinutes)}</b></div>
              <div><span>Late / early</span><b>{open.day.lateMinutes} min / {open.day.earlyLeaveMinutes} min{open.day.lateMarkWaived ? " (waived)" : ""}</b></div>
              <div><span>Overtime</span><b>{minutes(open.day.overtimeMinutes)}</b></div>
              <div><span>Payable</span><b>{open.day.payableFraction === 1 ? "Full day" : open.day.payableFraction === 0.5 ? "Half day" : "Unpaid"}</b></div>
              {open.day.holiday && <div><span>Holiday</span><b>{open.day.holiday}</b></div>}
              {open.day.leaveType && <div><span>Leave</span><b>{open.day.leaveType}</b></div>}
              {open.day.requestDocNo && <div><span>Regularised by</span><b><Link className="link" href="/hr/attendance/requests">{open.day.requestDocNo}</Link></b></div>}
              {open.day.manualReason && <div><span>Reason</span><b>{open.day.manualReason}</b></div>}
              {open.day.locationLabel && <div><span>Location</span><b>{open.day.locationLabel}</b></div>}
            </div>
          )}
        </Modal>
      )}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} busy={busy} title={confirm === "lock" ? `Lock ${monthLabel(month)}?` : `Unlock ${monthLabel(month)}?`} confirmLabel={confirm === "lock" ? "Lock" : "Unlock"}
        onConfirm={() => run(() => (confirm === "lock" ? lockRegister(month) : unlockRegister(month)), confirm === "lock" ? `${monthLabel(month)} locked for payroll` : `${monthLabel(month)} unlocked`)}>
        {confirm === "lock" ? "The month is processed up to today and locked: punches, corrections and manual marking are refused until it is unlocked." : "Punches, corrections and manual marking for this month will be accepted again."}
      </ConfirmDialog>
    </>
  );
}
