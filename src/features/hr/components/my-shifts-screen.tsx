"use client";

import { ArrowLeft, CalendarPlus, ArrowLeftRight, ArrowRight, Check, ChevronLeft, ChevronRight, Clock, Clock3, Coins, Hand, Info, MapPin, MoonStar, MousePointerClick, Plus, Search, Send, ShieldCheck, Sparkles, Undo2, User, Users, X } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { addDays, weekDays, weekStartOf, type MyShifts, type RosterShift, type SwapItem } from "@/shared";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { answerSwap, claimOpenShift, decideTeamSwap, myShifts, requestSwap, withdrawOpenClaim, withdrawSwap } from "../attendance-api";
import { dmy, dowShort, hhmm, STATUS_LABEL } from "./attendance-ui";
import { Av, EsRing, EsTracker } from "./ess-bits";

const REASONS: [string, string][] = [["FAMILY_EVENT", "Family event"], ["MEDICAL_APPOINTMENT", "Medical appointment"], ["CLIENT_VISIT", "Client visit"], ["TRAINING", "Training"], ["PERSONAL", "Personal"]];
const short = (t: string) => t.slice(0, 2) + (t.slice(3) !== "00" ? `:${t.slice(3)}` : "");
const dd = (d: string) => `${d.slice(8)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1]}`;
const weekNo = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7); };

/** Template app/profile/shifts (6A-ess.html + 9C-ess.js): today's shift, my week, swap requests, the published weekly roster, open shifts and the swap wizard. */
export function MyShiftsScreen({ can }: { can: { create: boolean } }) {
  const toast = useToast();
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [data, setData] = useState<MyShifts | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [onlyMe, setOnlyMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wiz, setWiz] = useState<{ step: number; date: string | null; peer: string | null; reason: string | null; note: string; find: string } | null>(null);
  const [decline, setDecline] = useState<{ s: SwapItem; team: boolean; reason: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    myShifts(week).then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load your shifts" }));
    return () => { cancelled = true; };
  }, [attempt, week]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!data) return <Skeleton style={{ height: 420 }} />;

  const shifts = data.roster.shifts;
  const tone = (s: RosterShift | undefined, remarks?: string | null) => (remarks?.startsWith("Open shift") ? "x" : !s ? "g" : ["g", "m", "e"][Math.max(0, shifts.findIndex((x) => x.id === s.id)) % 3]);
  const run = async (w: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await w(); toast(done, { tone: "good" }); setWiz(null); setDecline(null); reload(); } catch (e) { toast(apiMessage(e, "Could not complete that"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const days = data.roster.days;
  const thisMonday = weekStartOf(data.today);
  const rows = onlyMe ? data.roster.rows.filter((r) => r.employee.id === data.myId) : data.roster.rows;
  const t = data.todayShift;
  const progress = t ? Math.max(0, Math.min(1, (now - new Date(`${data.today}T${t.startTime}:00`).getTime()) / (new Date(`${data.today}T${t.endTime}:00`).getTime() - new Date(`${data.today}T${t.startTime}:00`).getTime()))) : 0;
  const leftMin = t ? Math.max(0, Math.round((new Date(`${data.today}T${t.endTime}:00`).getTime() - now) / 60000)) : 0;
  const pendingSwaps = data.swaps.filter((s) => ["REQUESTED", "ACCEPTED"].includes(s.status)).length + data.toAnswer.length + data.toApprove.length;
  // swap wizard: my upcoming working days (published roster and planned shifts) in the next two weeks
  const myRow = data.roster.rows.find((r) => r.employee.id === data.myId);
  const upcoming = [...weekDays(thisMonday), ...weekDays(addDays(thisMonday, 7))].filter((d) => d >= data.today).map((d) => ({ d, c: myRow?.cells[d] })).filter((x) => x.c?.entryType === "SHIFT").slice(0, 10);
  const peerShift = (pid: string, d: string) => data.peers.find((p) => p.employee.id === pid)?.entries[d];
  const myShift = (d: string) => shifts.find((s) => s.id === myRow?.cells[d]?.shiftId);

  const SwapCard = ({ s }: { s: SwapItem }) => {
    const at = s.status === "APPROVED" ? 4 : s.acceptedAt ? 2 : 1;
    const state = ["DECLINED", "REJECTED"].includes(s.status) ? "rej" : s.status === "WITHDRAWN" ? "cancel" : "ok";
    return (
      <div className="es-sh-sw es-in">
        <div className="es-sh-sw-top"><span className="es-sh-pair"><Av name={s.requester.name} />{s.swapMode === "SWAP" ? <ArrowLeftRight /> : <ArrowRight />}<Av name={s.counterpart.name} /></span>
          <div><b>{s.swapMode === "SWAP" ? "Swap with " : "Cover by "}{s.counterpart.name}</b><small>{dowShort(s.swapDate)} {dd(s.swapDate)} · {s.requesterShift ? `${s.requesterShift.name} ${short(s.requesterShift.startTime)}–${short(s.requesterShift.endTime)}` : "—"}{s.counterpartShift ? ` ⇄ ${s.counterpartShift.name} ${short(s.counterpartShift.startTime)}–${short(s.counterpartShift.endTime)}` : ""} · {REASONS.find(([c]) => c === s.reasonCategory)?.[1]}</small></div>
          <span className={`badge dot ${state === "rej" ? "danger" : state === "cancel" ? "neutral" : s.status === "APPROVED" ? "good" : "warn"}`}>{STATUS_LABEL[s.status] ?? s.status}</span></div>
        <EsTracker small steps={["Requested", "Accepted", "Manager", "Approved"]} at={Math.min(at, s.status === "APPROVED" ? 4 : 3)} state={state} subs={[dd(s.docDate), s.acceptedAt ? s.counterpart.name.split(" ")[0]! : "Waiting", data.approver ?? "HR", s.status === "APPROVED" ? "Done" : ""]} />
        {["REQUESTED", "ACCEPTED"].includes(s.status) && <div className="es-sh-sw-acts"><span className="es-label">{s.docNo}</span><span className="spacer" /><button className="btn ghost sm" type="button" disabled={busy} onClick={() => run(() => withdrawSwap(s.id, s.rowVersion), "Swap request withdrawn")}><Undo2 />Withdraw</button></div>}
      </div>
    );
  };

  return (
    <>
      <PageHead eyebrow="My Work / Shifts & Swaps" title="Shifts & Swaps" description="Your roster and your team’s. Tap one of your shifts to swap it, or pick up an open shift for extra allowance."
        actions={<>
          <button className="btn secondary" type="button" disabled title="Calendar export comes later"><CalendarPlus />Add to calendar</button>
          {can.create && <button className="btn primary" type="button" onClick={() => setWiz({ step: 0, date: upcoming[0]?.d ?? null, peer: null, reason: null, note: "", find: "" })}><ArrowLeftRight />Request swap</button>}
        </>} />
      <div className="es-grid es-g3 es-sh-top">
        <div className="es-card night es-sh-now">
          <div className="es-head"><span className="es-sh-live"><i />{t ? (data.firstIn ? "On shift" : "Not checked in") : "Off today"}</span><span className="spacer" /><span className="es-sh-loc"><MapPin />{data.employee.branch ?? "—"}</span></div>
          <div><span className="es-sh-cap">Today · {dowShort(data.today)} {dd(data.today)}</span><b className="es-sh-title">{t ? `${t.name} shift` : "Rest day"}</b><span className="es-sh-time">{t ? `${t.startTime} – ${t.endTime}` : "No shift rostered"}</span></div>
          {t && <div className="es-sh-tl"><div className={data.firstIn ? "on" : ""}><span>Check-in</span><b>{data.firstIn ? hhmm(data.firstIn) : "Pending"}</b></div>{t.breakStart && <div><span>Break</span><b>{t.breakStart} – {t.breakEnd}</b></div>}<div><span>Check-out</span><b>{t.endTime}</b></div></div>}
          <div className="es-sh-bar"><i style={{ width: `${(progress * 100).toFixed(2)}%` }} /></div>
          <div className="es-row"><span className="es-sh-cap">{t ? `${Math.floor(leftMin / 60)}h ${String(leftMin % 60).padStart(2, "0")}m left` : ""}</span><span className="spacer" /><span className="es-sh-cap">{data.nextShift ? `Next · ${dowShort(data.nextShift.date)} ${dd(data.nextShift.date)}, ${data.nextShift.startTime}` : "No next shift rostered"}</span></div>
        </div>
        <div className="es-card es-sh-hrs">
          <div className="es-head"><h3>My week</h3><span className="spacer" /><span className="pill"><Clock />Scheduled <b>{data.week.scheduledHours}h</b></span></div>
          <div className="es-row es-sh-ringrow"><EsRing pct={data.week.scheduledHours ? (data.week.workedHours / data.week.scheduledHours) * 100 : 0} size={104} stroke={3.4} label={`${data.week.workedHours}h`} sub="worked" className="es-sh-ring" />
            <div className="es-sh-mini"><div><span>Overtime</span><b>{Math.floor(data.week.overtimeMinutes / 60)}h {String(data.week.overtimeMinutes % 60).padStart(2, "0")}m</b></div><div><span>Rest days</span><b>{data.week.restDays.map(dowShort).join(", ") || "—"}</b></div><div><span>Swaps this month</span><b>{data.week.swapsThisMonth}</b></div></div></div>
        </div>
        <div className="es-card es-sh-swapcard">
          <div className="es-head"><h3>Swap requests</h3><span className="es-count">{pendingSwaps}</span><span className="spacer" />{can.create && <button className="es-link" type="button" onClick={() => setWiz({ step: 0, date: upcoming[0]?.d ?? null, peer: null, reason: null, note: "", find: "" })}>New<Plus /></button>}</div>
          <div className="es-sh-swaps">
            {data.toApprove.map((s) => (
              <div className="es-sh-sw team es-in" key={s.id}><div className="es-sh-sw-top"><span className="es-sh-pair"><Av name={s.requester.name} /><ArrowLeftRight /><Av name={s.counterpart.name} /></span><div><b>{s.requester.name.split(" ")[0]} ⇄ {s.counterpart.name.split(" ")[0]} · {dowShort(s.swapDate)} {dd(s.swapDate)}</b><small>{s.requesterShift?.name ?? "—"} ⇄ {s.counterpartShift?.name ?? "cover"} · {REASONS.find(([c]) => c === s.reasonCategory)?.[1]}</small></div><span className="badge warn dot">Needs you</span></div>
                <div className="es-sh-sw-acts"><button className="btn secondary sm" type="button" onClick={() => setDecline({ s, team: true, reason: "" })}><X />Decline</button><button className="btn primary sm" type="button" disabled={busy} onClick={() => run(() => decideTeamSwap(s.id, true), "Swap approved")}><Check />Approve swap</button></div></div>
            ))}
            {data.toAnswer.map((s) => (
              <div className="es-sh-sw team es-in" key={s.id}><div className="es-sh-sw-top"><span className="es-sh-pair"><Av name={s.requester.name} /><ArrowLeftRight /><Av name={s.counterpart.name} /></span><div><b>{s.requester.name} asks you · {dowShort(s.swapDate)} {dd(s.swapDate)}</b><small>{s.noteToCounterpart ?? REASONS.find(([c]) => c === s.reasonCategory)?.[1]}</small></div><span className="badge warn dot">Your answer</span></div>
                <div className="es-sh-sw-acts"><button className="btn secondary sm" type="button" onClick={() => setDecline({ s, team: false, reason: "" })}><X />Decline</button><button className="btn primary sm" type="button" disabled={busy} onClick={() => run(() => answerSwap(s.id, true), `Swap accepted · sent to ${data.approver ?? "HR"}`)}><Check />Accept</button></div></div>
            ))}
            {data.swaps.map((s) => <SwapCard key={s.id} s={s} />)}
            {!pendingSwaps && !data.swaps.length && <p className="es-hint">No swap requests. Tap one of your upcoming shifts in the roster to swap it.</p>}
          </div>
        </div>
      </div>

      <div className="es-card flush es-sh-roster">
        <div className="es-head"><h3>Weekly roster</h3>
          <div className="es-sh-nav"><button className="icon-btn-sm" type="button" aria-label="Previous week" onClick={() => setWeek(addDays(data.roster.weekStart, -7))}><ChevronLeft /></button><span id="es-sh-wk"><b>Week {weekNo(data.roster.weekStart)}</b><span>{dd(days[0]!)} – {dd(days[6]!)} {days[6]!.slice(0, 4)}</span></span><button className="icon-btn-sm" type="button" aria-label="Next week" onClick={() => setWeek(addDays(data.roster.weekStart, 7))}><ChevronRight /></button><button className="btn ghost sm" type="button" disabled={data.roster.weekStart === thisMonday} onClick={() => setWeek(undefined)}>Today</button></div>
          <span className="spacer" />
          <div className="seg es-sh-seg"><button type="button" className={!onlyMe ? "active" : ""} onClick={() => setOnlyMe(false)}><Users />My team</button><button type="button" className={onlyMe ? "active" : ""} onClick={() => setOnlyMe(true)}><User />Only me</button></div></div>
        <div className="es-sh-legend">{shifts.slice(0, 3).map((s) => <span key={s.id}><i className={`es-sh-${tone(s)}`} />{s.name} {short(s.startTime)}–{short(s.endTime)}</span>)}<span><i className="es-sh-x" />Open shift</span><span><i className="es-sh-l" />Leave</span><span><i className="es-sh-o" />Off</span>{can.create && <span className="es-sh-tipline"><MousePointerClick />Tap your upcoming shift to swap it</span>}</div>
        <div className="es-scroll-x"><div className="es-sh-grid" style={{ ["--rows" as string]: rows.length } as CSSProperties}>
          <div className="es-sh-corner"><span className="es-cap">Team</span><b>{rows.length} {rows.length === 1 ? "person" : "people"}</b></div>
          {days.map((d) => <div key={d} className={`es-sh-day${d === data.today ? " today" : ""}${["Sat", "Sun"].includes(dowShort(d)) ? " wk" : ""}`}><span>{dowShort(d)}</span><b>{d.slice(8)}</b>{d === data.today && <em>Today</em>}</div>)}
          {rows.map((r, ri) => {
            const me = r.employee.id === data.myId;
            return [
              <div key={`w${r.employee.id}`} className={`es-sh-who${me ? " mine" : ""}`}><Av name={r.employee.name} /><div><b>{me ? "You" : r.employee.name}{me && <span className="es-sh-you">{r.employee.name}</span>}</b><small>{r.employee.designation ?? r.employee.code} · {r.hours}h</small></div></div>,
              ...days.map((d, di) => {
                const c = r.cells[d], s = shifts.find((x) => x.id === c?.shiftId);
                const k = !c ? "o" : c.entryType === "OFF" ? "o" : c.entryType === "LEAVE" ? "l" : tone(s, c.remarks);
                const past = d < data.today, pend = data.swaps.some((x) => ["REQUESTED", "ACCEPTED"].includes(x.status) && x.swapDate === d && (x.requester.id === r.employee.id || x.counterpart.id === r.employee.id));
                const clickable = me && !past && c?.entryType === "SHIFT" && can.create;
                return (
                  <button key={`${r.employee.id}${d}`} type="button" tabIndex={clickable ? 0 : -1} className={`es-sh-cell es-sh-${k}${me ? " mine" : ""}${past ? " past" : ""}${d === data.today ? " today" : ""}${pend ? " pend" : ""}`} style={{ ["--i" as string]: ri * 7 + di } as CSSProperties}
                    data-tip={`${r.employee.name} · ${dmy(d)} · ${c ? (c.entryType === "SHIFT" ? `${s?.name ?? "Shift"} ${s?.startTime ?? ""} – ${s?.endTime ?? ""}` : c.entryType === "OFF" ? "Off" : "Leave") : "Not rostered"}`}
                    onClick={clickable ? () => setWiz({ step: 1, date: d, peer: null, reason: null, note: "", find: "" }) : undefined}>
                    {c?.entryType === "SHIFT" ? <><b>{c.remarks?.startsWith("Open shift") ? "Open shift" : s?.name ?? "Shift"}</b><small>{s ? `${short(s.startTime)}–${short(s.endTime)}` : ""}</small></> : <b>{c ? (c.entryType === "OFF" ? "Off" : "Leave") : "—"}</b>}
                    {pend && <em className="es-sh-pend"><Clock3 />Swap</em>}
                  </button>
                );
              }),
            ];
          })}
          <div className="es-sh-foot"><span className="es-cap">Coverage</span></div>
          {days.map((d) => { const on = data.roster.coverage[d] ?? 0, n = data.roster.rows.length || 1; return <div key={`c${d}`} className="es-sh-cov"><i style={{ ["--w" as string]: `${(on / n) * 100}%` } as CSSProperties} className={on < Math.ceil(n / 2) ? "low" : ""} /><span>{on}/{data.roster.rows.length} on</span></div>; })}
        </div></div>
      </div>

      <div className="es-grid es-wide" style={{ marginTop: 16 }}>
        <div className="es-card"><div className="es-head"><h3>Open shifts</h3><span className="es-count">{data.openShifts.length}</span><span className="spacer" /><span className="es-label">First come, first served · manager confirms</span></div>
          <div className="es-sh-openlist">
            {data.openShifts.length ? data.openShifts.map((o, i) => (
              <div key={o.id} className={`es-sh-os es-in${o.myClaim && o.myClaim.status !== "WITHDRAWN" && o.myClaim.status !== "DECLINED" ? " taken" : ""}`} style={{ ["--i" as string]: i } as CSSProperties}>
                <span className="es-sh-date"><b>{o.shiftDate.slice(8)}</b><small>{dowShort(o.shiftDate)}</small></span>
                <div className="es-sh-os-txt"><b>{o.title}</b><small>{o.shift.startTime} – {o.shift.endTime} · {o.shift.scheduledHours}h · {o.slotsTotal - o.slotsTaken} slot{o.slotsTotal - o.slotsTaken === 1 ? "" : "s"} left</small>{(o.perkText || o.allowanceAmount) && <span className="pill"><Sparkles /><b>{o.perkText ?? `+Rs ${o.allowanceAmount!.toLocaleString("en-US")} allowance`}</b></span>}</div>
                {o.myClaim?.status === "REQUESTED" ? <button className="btn ghost sm" type="button" disabled={busy} onClick={() => run(() => withdrawOpenClaim(o.id), "Pick-up withdrawn")}><span className="badge warn dot">Requested</span></button>
                  : o.myClaim?.status === "CONFIRMED" ? <span className="badge good dot">Confirmed</span>
                    : can.create && <button className="btn secondary sm" type="button" disabled={busy || o.slotsTaken >= o.slotsTotal} onClick={() => run(() => claimOpenShift(o.id), `Requested “${o.title}”${o.perkText ? ` · ${o.perkText}` : ""}`)}><Hand />Pick up</button>}
              </div>
            )) : <p className="es-hint">No open shifts right now.</p>}
          </div></div>
        <div className="es-card"><div className="es-head"><h3>Shift rules</h3><span className="spacer" /><span className="pill"><ShieldCheck />Attendance policy</span></div>
          <ul className="es-sh-rules">
            <li><Clock /><div><b>Grace period {data.roster.shifts[0] ? "as per your shift" : ""}</b><small>3 late marks in a month deduct half a day.</small></div></li>
            <li><ArrowLeftRight /><div><b>Swaps need your colleague first</b><small>Your colleague accepts, then {data.approver ?? "your manager"} and HR approve.</small></div></li>
            <li><MoonStar /><div><b>Rest between shifts</b><small>Evening → morning back-to-back is avoided in the roster.</small></div></li>
            <li><Coins /><div><b>Open shifts pay extra</b><small>The perk is shown on each open shift.</small></div></li>
          </ul></div>
      </div>

      <Modal open={!!wiz} onClose={() => setWiz(null)} title="Request a shift swap" subtitle={`${data.approver ?? "Your manager"} approves after your colleague accepts.`}
        foot={wiz && <>
          <button className="btn secondary" type="button" onClick={() => (wiz.step ? setWiz({ ...wiz, step: wiz.step - 1 }) : setWiz(null))}>{wiz.step ? <><ArrowLeft />Back</> : "Cancel"}</button><span className="spacer" />
          <button className="btn primary" type="button" disabled={busy || (wiz.step === 0 && !wiz.date) || (wiz.step === 1 && !wiz.peer) || (wiz.step === 2 && !wiz.reason)}
            onClick={() => (wiz.step < 2 ? setWiz({ ...wiz, step: wiz.step + 1 }) : run(() => requestSwap({ swapDate: wiz.date, counterpartEmployeeId: wiz.peer, reasonCategory: wiz.reason, noteToCounterpart: wiz.note || null }), "Swap request sent"))}>
            {wiz.step === 2 ? <><Send />Submit request</> : <>Continue<ArrowRight /></>}</button></>}>
        {wiz && <>
          <ol className="es-sh-steps">{["Shift", "Colleague", "Reason"].map((s, i) => <li key={s} className={`${i <= wiz.step ? "on" : ""}${i === wiz.step ? " cur" : ""}`}><b>{i + 1}</b>{s}</li>)}</ol>
          <div className="es-sh-pane es-in">
            {wiz.step === 0 && <><p className="es-label">Which of your shifts do you want to give away?</p><div className="es-sh-pick">{upcoming.length ? upcoming.map((u) => { const s = shifts.find((x) => x.id === u.c?.shiftId); return <button key={u.d} type="button" className={`es-opt es-sh-opt${wiz.date === u.d ? " on" : ""}`} onClick={() => setWiz({ ...wiz, date: u.d, peer: null })}><span className="es-sh-date"><b>{u.d.slice(8)}</b><small>{dowShort(u.d)}</small></span><span><b>{s?.name ?? "Shift"}</b><small>{s ? `${s.startTime} – ${s.endTime}` : ""}{u.d === data.today ? " · today" : ""}</small></span></button>; }) : <p className="es-hint">No published shifts in the next two weeks.</p>}</div></>}
            {wiz.step === 1 && wiz.date && <>
              <div className="es-sh-sum"><span className="es-sh-date"><b>{wiz.date.slice(8)}</b><small>{dowShort(wiz.date)}</small></span><div><b>{myShift(wiz.date)?.name ?? "Shift"} · {myShift(wiz.date)?.startTime} – {myShift(wiz.date)?.endTime}</b><small>Pick a colleague. People off that day can cover; others swap.</small></div></div>
              <label className="search-field es-sh-find"><Search /><input placeholder="Search colleagues…" value={wiz.find} onChange={(e) => setWiz({ ...wiz, find: e.target.value })} /></label>
              <div className="es-sh-peers">{data.peers.filter((p) => p.employee.name.toLowerCase().includes(wiz.find.toLowerCase())).map((p) => {
                const e = peerShift(p.employee.id, wiz.date!), s = shifts.find((x) => x.id === e?.shiftId), same = e?.entryType === "SHIFT" && e.shiftId === myRow?.cells[wiz.date!]?.shiftId, leave = e?.entryType === "LEAVE";
                const tag = leave ? <span className="badge neutral">On leave</span> : same ? <span className="badge neutral">Same shift</span> : e?.entryType !== "SHIFT" ? <span className="badge info">Off · can cover</span> : <span className="badge violet">{s?.name ?? "Shift"} {s ? `${short(s.startTime)}–${short(s.endTime)}` : ""}</span>;
                return <button key={p.employee.id} type="button" className={`es-sh-peer${wiz.peer === p.employee.id ? " on" : ""}`} disabled={same || leave} onClick={() => setWiz({ ...wiz, peer: p.employee.id })}><Av name={p.employee.name} /><span><b>{p.employee.name}</b><small>{p.employee.designation ?? p.employee.code}</small></span>{tag}<i className="es-sh-radio" /></button>;
              })}</div></>}
            {wiz.step === 2 && wiz.date && wiz.peer && (() => {
              const p = data.peers.find((x) => x.employee.id === wiz.peer)!, e = peerShift(wiz.peer!, wiz.date!), ps = shifts.find((x) => x.id === e?.shiftId), ms = myShift(wiz.date!), swap = e?.entryType === "SHIFT";
              return <>
                <div className="es-sh-deal"><div><Av name={data.employee.name} size="lg" /><b>You</b><small>{ms?.name}<br />{ms?.startTime} – {ms?.endTime}</small></div><span className="es-sh-deal-ic">{swap ? <ArrowLeftRight /> : <ArrowRight />}<small>{dmy(wiz.date!)}</small></span><div><Av name={p.employee.name} size="lg" /><b>{p.employee.name.split(" ")[0]}</b><small>{swap ? <>{ps?.name}<br />{ps?.startTime} – {ps?.endTime}</> : <>Off → covers<br />your shift</>}</small></div></div>
                <p className="es-label" style={{ margin: "14px 0 8px" }}>Reason</p>
                <div className="es-opts">{REASONS.map(([c, l]) => <button key={c} type="button" className={`es-opt${wiz.reason === c ? " on" : ""}`} onClick={() => setWiz({ ...wiz, reason: c })}>{l}</button>)}</div>
                <label className="es-field" style={{ marginTop: 14 }}><span>Note for {p.employee.name.split(" ")[0]} (optional)</span><textarea rows={3} value={wiz.note} maxLength={300} placeholder="e.g. I’ll cover your Saturday next week in return." onChange={(e2) => setWiz({ ...wiz, note: e2.target.value })} /></label>
                <div className="banner info es-sh-rule"><Info /><div><b>Swap policy</b><p>Your colleague accepts first, then {data.approver ?? "your manager"} and HR approve. You have {data.week.swapsThisMonth} swap{data.week.swapsThisMonth === 1 ? "" : "s"} this month.</p></div></div>
              </>;
            })()}
          </div>
        </>}
      </Modal>

      <Modal open={!!decline} onClose={() => setDecline(null)} title="Decline swap" subtitle={decline ? `${decline.s.requester.name.split(" ")[0]} ⇄ ${decline.s.counterpart.name.split(" ")[0]} · ${dowShort(decline.s.swapDate)} ${dd(decline.s.swapDate)}` : ""}
        foot={<><button className="btn secondary" type="button" onClick={() => setDecline(null)}>Cancel</button><button className="btn danger" type="button" disabled={busy || (decline?.reason.trim().length ?? 0) < 3} onClick={() => decline && run(() => (decline.team ? decideTeamSwap(decline.s.id, false, decline.reason) : answerSwap(decline.s.id, false, decline.reason)), "Swap declined")}><X />Decline</button></>}>
        {decline && <label className="es-field"><span>Reason{decline.team ? " (shared with both)" : ""}</span><textarea rows={3} value={decline.reason} onChange={(e) => setDecline({ ...decline, reason: e.target.value })} placeholder="e.g. I have a family event that day." /></label>}
      </Modal>
    </>
  );
}
