"use client";

import { BriefcaseBusiness, Download, Building2, CalendarClock, ChevronLeft, ChevronRight, CircleAlert, ClockAlert, Fingerprint, Hourglass, House, LocateFixed, LogIn, LogOut, MapPin, MousePointerClick, Plus, Send, ShieldCheck, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { distanceM, type MyAttendance, type MyAttendanceDay, type RegularisationList } from "@/shared";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { downloadCsv } from "@/features/finance/components/finance-ui";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { companyTimeZone } from "@/lib/company-time";
import { fileRegularisation, myAttendance, myRegularisation, punch, withdrawRegularisation } from "../attendance-api";
import { dmy, dowDmy, hhmm, localToday, minutes, monthLabel, REQUEST_TYPE, requestedPunch, shiftMonth, StatusBadge } from "./attendance-ui";
import { Av, EsRing, EsTracker } from "./ess-bits";

const LBL: Record<string, string> = { p: "P", lt: "LT", l: "L", a: "A", h: "H", w: "", f: "", t: "" };
const NAME: Record<string, string> = { p: "Present", lt: "Late", l: "Leave", a: "Absent", h: "Holiday", w: "Weekend", f: "Upcoming", t: "Today · not checked in" };
const TONE: Record<string, string> = { p: "good", lt: "warn", l: "info", a: "danger", h: "violet", w: "neutral", f: "neutral", t: "warn" };
const cls = (d: MyAttendanceDay, today: string) => {
  if (d.date > today) return d.holiday ? "h" : d.weeklyOff ? "w" : "f";
  if (d.date === today && !d.status) return "t";
  switch (d.status) {
    case "PRESENT": case "WFH": case "ON_DUTY": case "HALF_DAY": return "p";
    case "LATE": return "lt"; case "LEAVE": return "l"; case "ABSENT": return "a"; case "HOLIDAY": return "h"; case "WEEKLY_OFF": return "w";
    default: return d.holiday ? "h" : d.weeklyOff ? "w" : "f";
  }
};
const TYPES: [string, string, typeof LogIn][] = [["MISSED_IN", "Missed punch-in", LogIn], ["MISSED_OUT", "Missed punch-out", LogOut], ["LATE_ARRIVAL", "Late arrival", ClockAlert], ["ON_DUTY", "On-duty / field visit", BriefcaseBusiness], ["WFH", "Work from home", House]];
const MAP = `<svg class="es-at-map" viewBox="0 0 420 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect class="m-bg" width="420" height="250"/><path class="m-park" d="M300 20h90v70h-90z"/><path class="m-park" d="M20 170h70v60H20z"/><path class="m-canal" d="M-10 205 C 90 180, 160 240, 260 210 S 380 170, 440 190"/><g class="m-blk"><rect x="20" y="20" width="80" height="50" rx="6"/><rect x="115" y="20" width="70" height="50" rx="6"/><rect x="200" y="20" width="85" height="50" rx="6"/><rect x="20" y="85" width="80" height="70" rx="6"/><rect x="115" y="85" width="70" height="30" rx="6"/><rect x="115" y="125" width="70" height="30" rx="6"/><rect x="235" y="85" width="50" height="70" rx="6"/><rect x="300" y="105" width="90" height="50" rx="6"/><rect x="105" y="170" width="70" height="22" rx="5"/><rect x="300" y="168" width="90" height="10" rx="4"/></g><g class="m-road"><path d="M0 78h420M0 162h420M108 0v250M193 0v170M292 0v250"/></g><g class="m-road thin"><path d="M228 78v84M108 120h85"/></g><g class="m-fence"><circle class="m-pulse" cx="214" cy="120" r="78"/><circle class="m-pulse p2" cx="214" cy="120" r="78"/><circle class="m-zone" cx="214" cy="120" r="78"/></g><g class="m-you"><circle class="m-acc" cx="240" cy="140" r="14"/><circle class="m-dot" cx="240" cy="140" r="6"/></g><g class="m-pin" transform="translate(214 120)"><path d="M0 0 C -12 -14, -14 -20, -14 -26 A 14 14 0 1 1 14 -26 C 14 -20, 12 -14, 0 0z"/><circle cx="0" cy="-26" r="5.5"/></g></svg>`;

type Geo = { lat: number; lng: number; acc: number } | null;
const locate = () => new Promise<Geo>((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), () => resolve(null), { enableHighAccuracy: true, timeout: 10000 });
});

/** Template app/profile/attendance (6A-ess.html + 9C-ess.js): geofence, geo punch with live timer, month calendar, month at a glance, correction requests. Selfie / face match stays off. */
export function MyAttendanceScreen({ can }: { can: { create: boolean } }) {
  const toast = useToast();
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const [data, setData] = useState<MyAttendance | null>(null);
  const [reqs, setReqs] = useState<RegularisationList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [geo, setGeo] = useState<Geo>(null);
  const [mode, setMode] = useState("OFFICE");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pop, setPop] = useState<{ d: MyAttendanceDay; left: number; top: number } | null>(null);
  const [form, setForm] = useState<{ date: string; type: string; in: string; out: string; reason: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const calRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([myAttendance(month), myRegularisation()])
      .then(([a, r]) => { if (!cancelled) { setData(a); setReqs(r); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load your attendance" }));
    return () => { cancelled = true; };
  }, [attempt, month]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { void locate().then(setGeo); }, []);
  useEffect(() => { const close = () => setPop(null); window.addEventListener("resize", close); return () => window.removeEventListener("resize", close); }, []);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!data) return <Skeleton style={{ height: 420 }} />;

  const fence = data.geofence;
  const dist = fence && geo ? distanceM(fence.latitude, fence.longitude, geo.lat, geo.lng) : null;
  const inside = dist !== null && fence ? dist <= fence.radiusM : null;
  const t = new Date(now);
  const clock = t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: companyTimeZone() });
  const inAt = data.firstIn ? new Date(data.firstIn).getTime() : null;
  const outAt = data.state === "done" && data.lastOut ? new Date(data.lastOut).getTime() : null;
  const workedMs = inAt ? (outAt ?? now) - inAt : 0;
  const dur = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const shiftStart = data.shift ? new Date(`${data.today}T${data.shift.startTime}:00`).getTime() : null;
  const lateMin = shiftStart ? Math.floor((now - shiftStart) / 60000) : 0;
  const ringPct = data.shift && shiftStart ? Math.max(2, Math.min(100, ((now - shiftStart) / (data.shift.scheduledHours * 3600000)) * 100)) : 2;

  const doPunch = async () => {
    setBusy(true);
    const g = geo ?? (await locate());
    if (!g) { setBusy(false); toast("Allow location access to check in", { tone: "danger" }); return; }
    setGeo(g);
    try {
      const r = await punch({ direction: "AUTO", latitude: g.lat, longitude: g.lng, workMode: mode });
      setData(r);
      const last = r.punches.at(-1);
      toast(last?.direction === "OUT" ? `Checked out at ${hhmm(last.punchAt)}` : `Checked in at ${hhmm(last?.punchAt)}${last?.geofenceDistanceM != null ? ` · ${last.locationLabel}` : ""}`, { tone: "good" });
    } catch (e) { toast(apiMessage(e, "Could not punch"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const openPop = (d: MyAttendanceDay, el: HTMLElement) => {
    const host = calRef.current?.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!host) return;
    setPop({ d, left: Math.max(8, Math.min(r.left - host.left + r.width / 2 - 150, host.width - 308)), top: r.bottom - host.top + 8 });
  };
  const submit = async () => {
    if (!form) return;
    const type = form.type === "MISSED_IN" || form.type === "MISSED_OUT" ? "MISSED_PUNCH" : form.type;
    const body = {
      requestType: type, punchDirection: form.type === "MISSED_IN" ? "IN" : form.type === "MISSED_OUT" ? "OUT" : null, attDate: form.date, reason: form.reason,
      requestedIn: form.type === "MISSED_OUT" || form.type === "EARLY_LEAVING" ? null : form.in || null, requestedOut: form.type === "MISSED_IN" || form.type === "LATE_ARRIVAL" ? null : form.out || null,
    };
    setBusy(true);
    try { const r = await fileRegularisation(body); toast(`${r.docNo} sent${data.approver ? ` to ${data.approver}` : ""} for ${dmy(r.attDate)}`, { tone: "good" }); setForm(null); reload(); }
    catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not submit the request"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const first = new Date(`${month}-01T00:00:00Z`), lead = (first.getUTCDay() + 6) % 7;
  const stats = data.stats;
  const pendingN = reqs?.items.filter((r) => r.status === "PENDING").length ?? 0;
  const lbl = { out: ["Check in", "Geofence check-in"], in: ["Check out", "Tap when you leave"], done: ["Done for today", "See you tomorrow"] }[data.state];

  const newRequest = () => { setErrs({}); setForm({ date: data.today, type: "LATE_ARRIVAL", in: data.shift?.startTime ?? "09:00", out: data.shift?.endTime ?? "18:00", reason: "" }); };
  return (
    <>
      <PageHead eyebrow="My Work / Attendance" title="My Attendance"
        description={`${data.shift ? `${data.shift.name} shift ${data.shift.startTime} – ${data.shift.endTime}` : "No shift"} · geofence check-in · corrections go to ${data.approver ?? "HR"}.`}
        actions={<>
          <button className="btn secondary" type="button" onClick={() => downloadCsv(`Attendance_${month}.csv`, [["Date", "Status", "Check in", "Check out", "Worked (min)", "Overtime (min)"], ...data.days.map((d) => [d.date, d.status ?? "", d.firstIn ? hhmm(d.firstIn) : "", d.lastOut ? hhmm(d.lastOut) : "", d.workedMinutes, d.overtimeMinutes])])}><Download />Export</button>
          {can.create && <button className="btn primary" type="button" disabled={data.locked} onClick={newRequest}><CalendarClock />Request correction</button>}
        </>} />
      <div className="es-grid es-at-top">
        <div className="es-card flush es-at-geo">
          <div className="es-head"><div><h3>Geofence</h3><p>{fence ? `${fence.branch} · ${fence.radiusM} m radius` : "No geofence is set for your branch"}</p></div><span className="spacer" />
            <button type="button" className="btn secondary sm" onClick={async () => { const g = await locate(); setGeo(g); toast(g ? (dist !== null ? "Location refreshed" : "Location found") : "Location access is blocked", { tone: g ? "info" : "danger" }); }}><LocateFixed />Re-locate</button></div>
          <div className="es-at-mapwrap">
            <div dangerouslySetInnerHTML={{ __html: MAP }} />
            <span className="es-at-inside"><ShieldCheck />{dist === null ? (geo ? "No geofence — punch is accepted and flagged" : "Locating you…") : inside ? <>You are <b>{dist}</b> m from the centre</> : <>You are <b>{dist - (fence?.radiusM ?? 0)}</b> m outside</>}</span>
            <span className="es-at-hq"><Building2 />{fence?.branch ?? data.employee.branch ?? "Branch"}</span>
            <div className="es-at-mapchips"><span className="pill"><MapPin />GPS <b>{geo ? `±${geo.acc} m` : "—"}</b></span><span className="pill"><Smartphone />Selfie <b>off</b></span></div>
          </div>
        </div>
        <div className="es-card es-at-punch" data-state={data.state}>
          <div className="es-head"><h3>Today</h3><span className="es-label">{dowDmy(data.today)}</span><span className="spacer" /><span className="es-at-chip"><i />{data.state === "out" ? "Not checked in" : data.state === "in" ? "On the clock" : "Shift complete"}</span></div>
          <div className="es-at-punch-body">
            <div className="es-at-btnwrap"><EsRing pct={ringPct} size={196} stroke={1.6} className="es-at-btn-ring" label="" tone="var(--lime)" />
              <button type="button" className="es-at-btn" disabled={!can.create || busy || data.state === "done" || data.locked} onClick={doPunch}><Fingerprint /><b>{busy ? "Locating…" : lbl[0]}</b><small>{data.locked ? "Month locked" : lbl[1]}</small></button></div>
            <div className="es-at-time"><span className="es-label">Local time</span><div className="es-at-clock">{clock.replace(/ (AM|PM)$/, "")}<small>{clock.slice(-2)}</small></div>
              <span className="es-label">Timer</span><div className="es-at-timer">{dur(workedMs)}</div>
              <span className="es-at-timer-sub">{inAt ? (outAt ? "Worked today" : `Since check-in at ${hhmm(data.firstIn)}`) : !data.shift ? "No shift today" : lateMin <= 0 ? `Shift starts at ${data.shift.startTime}` : lateMin <= data.shift.graceMinutes ? `Shift started ${lateMin} min ago · within ${data.shift.graceMinutes} min grace` : `You are ${lateMin} min late`}</span>
              {data.state !== "done" && <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Work mode" style={{ marginTop: 8 }}><option value="OFFICE">At the office</option><option value="WFH">Work from home</option><option value="FIELD">Field visit</option></select>}
            </div>
          </div>
          <div className="es-at-log"><div><span>Check in</span><b>{hhmm(data.firstIn)}</b></div><div><span>Check out</span><b>{data.state === "done" ? hhmm(data.lastOut) : "—"}</b></div><div><span>Worked</span><b>{minutes(Math.floor(workedMs / 60000))}</b></div></div>
        </div>
      </div>

      <div className="es-grid es-main">
        <div className="es-card es-at-calcard" ref={calRef} style={{ position: "relative" }}>
          <div className="es-head"><h3>{monthLabel(month)}</h3><span className="spacer" />
            <div className="es-at-legend"><span><i className="s-p" />P</span><span><i className="s-lt" />LT</span><span><i className="s-l" />L</span><span><i className="s-a" />A</span><span><i className="s-h" />H</span></div>
            <div className="es-row"><button type="button" className="icon-btn-sm" aria-label="Previous month" onClick={() => { setPop(null); setMonth(shiftMonth(month, -1)); }}><ChevronLeft /></button><button type="button" className="icon-btn-sm" aria-label="Next month" disabled={month >= localToday().slice(0, 7)} onClick={() => { setPop(null); setMonth(shiftMonth(month, 1)); }}><ChevronRight /></button></div></div>
          <div className="es-at-cal">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} className="es-at-dow">{d}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} className="es-at-cell blank" />)}
            {data.days.map((d, i) => {
              const s = cls(d, data.today);
              return (
                <button key={d.date} type="button" className={`es-at-cell s-${s}${d.date === data.today ? " today" : ""}${d.pending ? " corr" : ""}`} style={{ ["--i" as string]: lead + i }} aria-label={`${dowDmy(d.date)} · ${NAME[s]}`} onClick={(e) => { e.stopPropagation(); openPop(d, e.currentTarget); }}>
                  <b>{Number(d.date.slice(8))}</b>{LBL[s] && <em>{LBL[s]}</em>}{d.firstIn ? <small>{hhmm(d.firstIn)}</small> : d.holiday ? <small>{d.holiday.split(" ")[0]}</small> : d.date === data.today ? <small>Today</small> : null}
                </button>
              );
            })}
          </div>
          <p className="es-hint es-at-calhint"><MousePointerClick />Tap a day for punch details or to request a correction.</p>
          {pop && (() => {
            const d = pop.d, s = cls(d, data.today);
            return (
              <div className="es-at-pop" style={{ left: pop.left, top: pop.top }} onClick={(e) => e.stopPropagation()}>
                <div className="es-head"><div><h3>{dowDmy(d.date)}</h3><p>{d.holiday ?? d.leave ?? (s === "w" ? "Weekly off" : data.shift ? `${data.shift.name} shift ${data.shift.startTime} – ${data.shift.endTime}` : "")}</p></div><span className="spacer" /><span className={`badge dot ${TONE[s]}`}>{d.status ? StatusLabel(d.status) : NAME[s]}</span></div>
                {d.firstIn && <><div className="es-at-pop-grid"><div><span>Check in</span><b>{hhmm(d.firstIn)}</b></div><div><span>Check out</span><b>{hhmm(d.lastOut)}</b></div><div><span>Worked</span><b>{d.workedMinutes ? minutes(d.workedMinutes) : "—"}</b></div><div><span>Overtime</span><b>{d.overtimeMinutes ? minutes(d.overtimeMinutes) : "—"}</b></div></div>
                  <div className="es-at-pop-src"><MapPin />{d.location ?? "—"}<span>·</span><Smartphone />{d.source ?? "—"}</div></>}
                {s === "a" && <div className="banner danger es-at-pop-ban"><CircleAlert /><div><b>No punch recorded</b><p>Marked as loss of pay unless regularised.</p></div></div>}
                {d.pending && <div className="es-at-pop-corr"><Hourglass />Correction {d.pending} pending{data.approver ? ` with ${data.approver}` : ""}</div>}
                {can.create && ["p", "lt", "a", "t"].includes(s) && !d.pending && !data.locked && <button type="button" className="btn secondary sm" onClick={() => { setPop(null); setErrs({}); setForm({ date: d.date, type: s === "lt" ? "LATE_ARRIVAL" : "MISSED_IN", in: data.shift?.startTime ?? "09:00", out: data.shift?.endTime ?? "18:00", reason: "" }); }}><CalendarClock />Request correction</button>}
                <button type="button" className="btn ghost sm" onClick={() => setPop(null)}>Close</button>
              </div>
            );
          })()}
        </div>
        <div className="es-col">
          <div className="es-card"><div className="es-head"><h3>Month at a glance</h3></div>
            <div className="es-at-glance"><EsRing pct={stats.onTimePct ?? 0} size={108} stroke={3.4} label={stats.onTimePct !== null ? `${stats.onTimePct}%` : "—"} sub="On time" />
              <div className="es-at-glance-r"><div><span>Present</span><b>{stats.present} / {stats.workingDays}</b></div><div><span>Late marks</span><b>{stats.lateMarks}</b><small>3rd late = ½ day</small></div></div></div>
            <div className="es-stats"><div className="es-stat"><span>Avg check-in</span><b>{stats.avgCheckIn ?? "—"}</b><small>{data.shift ? `Shift ${data.shift.startTime}` : ""}</small></div><div className="es-stat"><span>Overtime</span><b>{minutes(stats.overtimeMinutes)}</b><small>From the register</small></div></div></div>
          <div className="es-card es-at-week"><div className="es-head"><h3>Hours · last 7 days</h3></div>
            <div className="es-at-wbars">{data.last7.length ? data.last7.map((b, i) => <div key={b.date} style={{ ["--h" as string]: `${Math.min(100, (b.minutes / 60 / 11) * 100)}%`, ["--i" as string]: i }} data-tip={`${(b.minutes / 60).toFixed(1)} h`}><i className={b.minutes > 600 ? "ot" : ""} /><span>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${b.date}T00:00:00Z`).getUTCDay()]}</span></div>) : <p className="es-hint">No worked days in the last week.</p>}</div>
            <div className="es-at-target"><span>{data.shift ? `${data.shift.scheduledHours} h target` : "No shift"}</span></div></div>
        </div>
      </div>

      <div className="es-card flush" id="es-at-reqs">
        <div className="es-head"><div><h3>My correction requests</h3><p>{pendingN} pending</p></div><span className="spacer" />{can.create && <button type="button" className="btn secondary sm" disabled={data.locked} onClick={() => { setErrs({}); setForm({ date: data.today, type: "LATE_ARRIVAL", in: data.shift?.startTime ?? "09:00", out: data.shift?.endTime ?? "18:00", reason: "" }); }}><Plus />New request</button>}</div>
        <div className="table-wrap"><table className="tbl" data-plain="">
          <thead><tr><th>Request</th><th>Type</th><th>Reason</th><th>Approver</th><th>Status</th><th /></tr></thead>
          <tbody>{reqs?.items.length ? reqs.items.map((r) => (
            <tr key={r.id}><td><b>{r.docNo}</b><small>{dowDmy(r.attDate)}</small></td><td>{REQUEST_TYPE[r.requestType]?.[0] ?? r.requestType}<small>{requestedPunch(r)}</small></td>
              <td className="es-at-reason">{r.reason}{r.status === "REJECTED" && r.decisionComment && <small className="es-down">{r.decisionComment}</small>}</td>
              <td><div className="cell-user"><Av name={r.decidedBy?.name ?? data.approver ?? "HR"} size="xs" /><span>{r.decidedBy?.name ?? r.waitingOn?.replace(/^[^—]*— /, "") ?? data.approver ?? "HR"}</span></div></td>
              <td><StatusBadge status={r.status} /></td>
              <td className="right">{r.status === "PENDING" && <button type="button" className="btn ghost sm" onClick={async () => { try { await withdrawRegularisation(r.id, r.rowVersion); toast(`${r.docNo} withdrawn`, { tone: "info" }); reload(); } catch (e) { toast(apiMessage(e, "Could not withdraw"), { tone: "danger" }); } }}>Withdraw</button>}</td></tr>
          )) : <tr><td colSpan={6} className="muted">No correction requests yet.</td></tr>}</tbody>
        </table></div>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="Request correction" subtitle={`Goes to ${data.approver ?? "HR"}${data.approver ? ", then HR" : ""}`}
        foot={<><button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={submit}><Send />{busy ? "Submitting…" : "Submit request"}</button></>}>
        {form && <div className="es-at-form">
          <label className="es-field"><span>Date</span><input type="date" value={form.date} max={data.today} onChange={(e) => setForm({ ...form, date: e.target.value })} />{errs.attDate && <small className="es-down">{errs.attDate}</small>}</label>
          <div className="es-field"><span>What happened?</span><div className="es-opts">{TYPES.map(([c, l, Ic]) => <button key={c} type="button" className={`es-opt${form.type === c ? " on" : ""}`} onClick={() => setForm({ ...form, type: c })}><Ic />{l}</button>)}</div></div>
          <div className="es-at-2">
            <label className="es-field"><span>Actual check in</span><input type="time" value={form.in} disabled={form.type === "MISSED_OUT"} onChange={(e) => setForm({ ...form, in: e.target.value })} />{errs.requestedIn && <small className="es-down">{errs.requestedIn}</small>}</label>
            <label className="es-field"><span>Actual check out</span><input type="time" value={form.out} disabled={form.type === "MISSED_IN" || form.type === "LATE_ARRIVAL"} onChange={(e) => setForm({ ...form, out: e.target.value })} />{errs.requestedOut && <small className="es-down">{errs.requestedOut}</small>}</label>
          </div>
          <label className="es-field"><span>Reason *</span><textarea rows={3} value={form.reason} placeholder="e.g. Client meeting at Lucky Cement from 08:30" onChange={(e) => setForm({ ...form, reason: e.target.value })} />{errs.reason && <small className="es-down">{errs.reason}</small>}</label>
          <div className="es-at-c-flow"><EsTracker steps={["Submitted", "Manager", "HR", "Attendance updated"]} at={0} subs={["Now", data.approver ?? "Skipped", "HR", "Auto"]} /></div>
        </div>}
      </Modal>
    </>
  );
}

function StatusLabel(s: string) {
  return ({ PRESENT: "Present", LATE: "Late", WFH: "Work from home", ON_DUTY: "On duty", HALF_DAY: "Half day", ABSENT: "Absent", LEAVE: "Leave", HOLIDAY: "Holiday", WEEKLY_OFF: "Weekly off" } as Record<string, string>)[s] ?? s;
}
