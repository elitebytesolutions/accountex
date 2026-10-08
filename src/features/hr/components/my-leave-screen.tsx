"use client";

import { ArrowRight, BookOpen, CalendarOff, CalendarX, CircleAlert, CircleCheck, Inbox, Info, Plane, Repeat, Send, Sun, Thermometer, TriangleAlert, Undo2, Users, Wallet } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { LeavePreview, MyLeave } from "@/shared";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { applyLeave, cancelMyLeave, myLeave, previewMyLeave } from "../lifecycle-api";
import { dmy, StatusBadge } from "./attendance-ui";
import { Av, EsRing, EsTracker } from "./ess-bits";
import { COLOUR_VAR, days, dm, leaveRange, shortName } from "./leave-ui";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ICON: Record<string, typeof Plane> = { ANNUAL: Plane, CASUAL: Sun, SICK: Thermometer, COMP_OFF: Repeat, UNPAID: Wallet };
const iconOf = (category: string) => ICON[category] ?? Plane;
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmt = (n: number) => days(Math.round(n * 10) / 10);
type Form = { leaveTypeId: string; fromDate: string; toDate: string; half: boolean; halfPart: "HALF_AM" | "HALF_PM"; reason: string; contact: string };

/** Template app/profile/leave (6A-ess.html + 9C-ess.js): balance rings, my requests with trackers, team calendar, holidays, the apply sheet with live working days and balance preview, leave policy. */
export function MyLeaveScreen({ can }: { can: { create: boolean } }) {
  const toast = useToast();
  const [data, setData] = useState<MyLeave | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string; status?: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState<Form | null>(null);
  const [preview, setP] = useState<LeavePreview | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [cancel, setCancel] = useState<MyLeave["requests"][number] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    myLeave().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, status: e.status } : { message: "Could not load your leave" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const ready = !!form?.leaveTypeId && !!form.fromDate && !!form.toDate;
  useEffect(() => {
    if (!form || !ready) return;
    let cancelled = false;
    const body = { leaveTypeId: form.leaveTypeId, duration: form.half ? form.halfPart : "FULL", fromDate: form.fromDate, toDate: form.half ? form.fromDate : form.toDate };
    const t = setTimeout(() => previewMyLeave(body).then((r) => !cancelled && setP(r)).catch(() => !cancelled && setP(null)), 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ready, form?.leaveTypeId, form?.fromDate, form?.toDate, form?.half, form?.halfPart]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  // a user not linked to an employee record has no leave: an empty state, not an error
  if (error?.status === 403) return <><PageHead eyebrow="My Work / Leave" title="My Leave" description="Leave balances and requests." /><div className="es-card"><div className="es-empty"><span className="icon-tile"><Inbox /></span><b>No employee record</b><span>{error.message}</span></div></div></>;
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!data) return <Skeleton style={{ height: 480 }} />;
  const p = form && ready ? preview : null;

  const today = data.today;
  const paid = data.balances.filter((b) => b.leaveType.isPaid);
  const total = (b: MyLeave["balances"][number]) => b.figures.entitled + b.figures.carriedIn + b.figures.adjusted;
  const CORE = ["ANNUAL", "CASUAL", "SICK", "COMP_OFF"];
  const cards = [...paid.filter((b) => CORE.includes(b.leaveType.category)), ...paid.filter((b) => !CORE.includes(b.leaveType.category) && total(b) > 0)].slice(0, 4);
  const freeAnnualCasual = paid.filter((b) => ["ANNUAL", "CASUAL"].includes(b.leaveType.category)).reduce((n, b) => n + b.figures.available, 0);
  const list = data.requests.filter((r) => filter === "all" || r.status.toLowerCase() === filter);
  const count = (f: string) => data.requests.filter((r) => f === "all" || r.status.toLowerCase() === f).length;
  const openApply = (typeId?: string) => {
    setErrs({}); setP(null);
    const from = addDay(today, 7);
    setForm({ leaveTypeId: typeId ?? cards[0]?.leaveType.id ?? data.balances[0]?.leaveType.id ?? "", fromDate: from, toDate: from, half: false, halfPart: "HALF_AM", reason: "", contact: "" });
  };
  const submit = async () => {
    if (!form) return;
    if (!form.reason.trim()) { setErrs({ reason: "Add a short reason for your manager" }); return; }
    setBusy(true);
    try {
      const r = await applyLeave({ leaveTypeId: form.leaveTypeId, duration: form.half ? form.halfPart : "FULL", fromDate: form.fromDate, toDate: form.half ? form.fromDate : form.toDate, reason: form.reason, contactDuringLeave: form.contact || null });
      toast(`${r.docNo} sent${r.waitingOn ? ` to ${r.waitingOn.replace(/^[^—]*— /, "")}` : ""} · ${fmt(r.days)} day${r.days === 1 ? "" : "s"}`, { tone: "good" });
      setForm(null); setFilter("all"); setFresh(r.id); reload();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not submit the request"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const doCancel = async () => {
    const r = cancel;
    if (!r) return;
    setCancel(null);
    try { await cancelMyLeave(r.id, r.rowVersion); toast(`${r.docNo} ${r.status === "PENDING" ? "withdrawn" : "cancelled"} · ${fmt(r.days)} day(s) back in your balance`, { tone: "info" }); reload(); }
    catch (e) { toast(apiMessage(e, "Could not cancel"), { tone: "danger" }); }
  };

  // team calendar: this month
  const m = today.slice(0, 7), first = `${m}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  const out = data.team.filter((t) => t.toDate >= first && t.fromDate <= addDay(first, dim - 1));
  const upcoming = data.team.filter((t) => t.toDate >= today);
  const type = form ? data.balances.find((b) => b.leaveType.id === form.leaveTypeId) : null;
  const f = p?.balance;
  const state = !type?.leaveType.isPaid ? "unpaid" : !p ? "ok" : (f?.after ?? 0) < 0 ? "over" : (f?.after ?? 0) <= 1 ? "low" : "ok";
  const pct = (v: number) => `${Math.max(0, f && total(type!) ? (v / Math.max(total(type!), 1)) * 100 : 0)}%`;
  const errList = p ? Object.values(p.errors) : [];

  return (
    <>
      <PageHead eyebrow="My Work / Leave" title="My Leave"
        description={`Balances for leave year ${data.yearStart.slice(0, 4)}-${data.yearEnd.slice(2, 4)} · approvals go to ${data.route}.`}
        actions={<>
          <button className="btn secondary" type="button" onClick={() => setPolicy(true)}><BookOpen />Leave policy</button>
          {can.create && <button className="btn primary" type="button" onClick={() => openApply()}><Plane />Apply leave</button>}
        </>} />

      <div className="es-grid es-g4 es-lv-bals">
        {cards.map((b, i) => {
          const Ic = iconOf(b.leaveType.category), tone = COLOUR_VAR[b.leaveType.colour] ?? "var(--primary)", tot = total(b);
          return (
            <div key={b.leaveType.id} className="es-card es-lv-bal" style={{ ["--i" as string]: i } as CSSProperties}>
              <div className="es-head"><span className="icon-tile" style={{ ["--tc" as string]: tone } as CSSProperties}><Ic /></span><div><h3>{shortName(b.leaveType)}</h3><p>{b.note}</p></div></div>
              <div className="es-lv-bal-body">
                <EsRing pct={tot ? (b.figures.available / tot) * 100 : 0} size={92} stroke={3.4} tone={tone} label={<span className="es-lv-free">{fmt(b.figures.available)}</span>} sub={`of ${fmt(tot)}`} />
                <div className="es-lv-bal-r">
                  <div><span>Used</span><b>{fmt(b.figures.used)}</b></div>
                  <div><span>Booked</span><b className={b.figures.booked ? "es-lv-bk" : ""}>{fmt(b.figures.booked)}</b></div>
                  {can.create && <button type="button" className="es-link" onClick={() => openApply(b.leaveType.id)}>Apply<ArrowRight /></button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="es-grid es-main es-lv-main">
        <div className="es-card flush">
          <div className="es-head"><div><h3>My requests</h3><p><b>{fmt(freeAnnualCasual)}</b> annual + casual days free to book</p></div><span className="spacer" />
            <div className="chips es-lv-chips">{[["all", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]].map(([c, l]) => <button key={c} type="button" className={filter === c ? "active" : ""} onClick={() => setFilter(c!)}>{l} <i>{count(c!)}</i></button>)}</div>
          </div>
          <div className="es-lv-reqs">
            {list.length ? list.map((r, i) => {
              const Ic = iconOf(r.leaveType.category), tone = COLOUR_VAR[r.leaveType.colour] ?? "var(--muted)";
              const steps = ["Submitted", ...(r.appliedOnBehalf ? ["HR"] : r.waitingOn || r.decidedBy ? ["Manager", "HR"] : ["HR"]), "Approved"];
              // rejected: at the first approver; cancelled: where it stood (approved leave cancelled later → the last step)
              const at = r.status === "APPROVED" ? steps.length : r.status === "PENDING" ? (r.stage === "LINE_MANAGER" ? 1 : steps.length - 2)
                : r.status === "CANCELLED" && r.decidedAt ? steps.length - 1 : 1;
              const canCancel = r.status === "PENDING" || (r.status === "APPROVED" && r.fromDate > today);
              return (
                <article key={r.id} className={`es-lv-req es-in${fresh === r.id ? " fresh" : ""}`} data-st={r.status.toLowerCase()} style={{ ["--i" as string]: i } as CSSProperties}>
                  <div className="es-lv-req-top"><span className="icon-tile" style={{ ["--tc" as string]: tone } as CSSProperties}><Ic /></span>
                    <div className="es-lv-req-t"><b>{r.leaveType.name} · {fmt(r.days)} {r.days === 1 ? "day" : "days"}{r.duration !== "FULL" && <span className="pill">{r.duration === "HALF_AM" ? "First half" : "Second half"}</span>}</b><small>{r.fromDate === r.toDate ? dmy(r.fromDate) : `${dm(r.fromDate)} – ${dmy(r.toDate)}`} · {r.docNo}</small></div>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.reason && <p className="es-lv-reason">“{r.reason}”{r.handover && <span> · handover to {r.handover.name}</span>}</p>}
                  <EsTracker steps={steps} at={Math.min(at, steps.length - 1)} state={r.status === "REJECTED" ? "rej" : r.status === "CANCELLED" ? "cancel" : "ok"}
                    subs={[`You · ${dm(r.submittedAt.slice(0, 10))}`, ...steps.slice(1, -1).map((s, k) => (k === 0 && r.status === "PENDING" && r.waitingOn ? r.waitingOn.replace(/^[^—]*— /, "") : s === "HR" && r.appliedOnBehalf ? "Applied by HR" : null)), r.status === "APPROVED" ? "Done" : null]} />
                  {r.status === "REJECTED" && <div className="es-lv-note"><CircleAlert />{r.decisionComment ?? "Rejected"}{r.suggestAlternative ? " — please pick other dates" : ""}</div>}
                  {can.create && canCancel && <div className="es-lv-req-acts"><button type="button" className="btn ghost sm" onClick={() => setCancel(r)}>{r.status === "PENDING" ? <><Undo2 />Withdraw</> : <><CalendarX />Cancel leave</>}</button></div>}
                </article>
              );
            }) : <div className="es-empty"><span className="icon-tile"><Inbox /></span><b>No {filter === "all" ? "" : `${filter} `}requests</b><span>{filter === "all" ? "Apply for leave to see it here." : "Try another filter."}</span></div>}
          </div>
        </div>
        <div className="es-col">
          <div className="es-card">
            <div className="es-head"><div><h3>Team calendar</h3><p>{MON[Number(m.slice(5)) - 1]} {m.slice(0, 4)}{data.employee.department ? ` · ${data.employee.department}` : ""}</p></div><span className="spacer" /><span className="pill"><Users /><b>{new Set(out.filter((o) => !o.me).map((o) => o.name)).size}</b> out this month</span></div>
            <div className="es-lv-tcal">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="es-lv-dow">{d}</span>)}
              {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
              {Array.from({ length: dim }, (_, i) => {
                const iso = addDay(first, i), dow = new Date(`${iso}T00:00:00Z`).getUTCDay(), wk = dow === 0;
                const here = wk ? [] : out.filter((o) => o.fromDate <= iso && o.toDate >= iso);
                return (
                  <div key={iso} className={`es-lv-tday${wk ? " wk" : ""}${iso === today ? " today" : ""}${here.length > 1 ? " busy" : ""}`}><b>{i + 1}</b>
                    <div className="es-lv-avs">{here.slice(0, 3).map((o) => <span key={o.name + o.fromDate} className={`es-lv-av${o.me ? " me" : ""}`} title={`${o.name}${o.me ? " (you)" : ""} · ${o.leaveType}${o.status === "PENDING" ? " · pending" : ""}`}><Av name={o.name} size="xs" /></span>)}{here.length > 3 && <span className="es-lv-more">+{here.length - 3}</span>}</div>
                  </div>
                );
              })}
            </div>
            <div className="es-lv-outlist">{upcoming.length ? upcoming.slice(0, 6).map((o) => (
              <div key={o.name + o.fromDate} className="es-lv-outrow"><Av name={o.name} /><div><b>{o.name}{o.me && <span className="es-muted"> (you)</span>}</b><small>{leaveRange(o)} · {o.leaveType}{o.status === "PENDING" ? " · pending" : ""}</small></div>{o.fromDate <= today && o.toDate >= today && <span className="badge warn dot">Out today</span>}</div>
            )) : <p className="es-hint">Nobody in your team has leave coming up.</p>}</div>
          </div>
          <div className="es-card">
            <div className="es-head"><h3>Upcoming holidays</h3><span className="spacer" /><span className="es-count">{data.holidays.length}</span></div>
            <div className="es-lv-hols">{data.holidays.length ? data.holidays.slice(0, 6).map((h, i) => {
              const away = Math.round((Date.parse(`${h.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
              return <div key={h.date + h.name} className="es-lv-hol es-in" style={{ ["--i" as string]: i } as CSSProperties}><span className="es-lv-hd"><b>{h.date.slice(8)}</b><small>{MON[Number(h.date.slice(5, 7)) - 1]}</small></span><div><b>{h.name}</b><small>{DOW[new Date(`${h.date}T00:00:00Z`).getUTCDay()]} · public holiday</small></div><span className="pill">{away} days</span></div>;
            }) : <p className="es-hint">No holidays in the next six months.</p>}</div>
          </div>
        </div>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="Apply for leave" subtitle={`Approved by ${data.route}`}
        foot={<><button className="btn secondary" type="button" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy || !!errList.length || !p?.days} onClick={submit}><Send />{busy ? "Submitting…" : "Submit request"}</button></>}>
        {form && <div className="es-lv-form">
          <div className="es-field"><span>Leave type</span><div className="es-lv-types">{data.balances.map((b) => { const Ic = iconOf(b.leaveType.category); return (
            <button key={b.leaveType.id} type="button" className={`es-opt${b.leaveType.id === form.leaveTypeId ? " on" : ""}`} onClick={() => setForm({ ...form, leaveTypeId: b.leaveType.id, half: b.leaveType.allowHalfDay ? form.half : false })}><Ic /><span>{shortName(b.leaveType).replace(/ leave$/i, "")}<small>{b.leaveType.isPaid ? `${fmt(b.figures.available)} left` : "No limit"}</small></span></button>
          ); })}</div>{errs.leaveTypeId && <small className="es-down">{errs.leaveTypeId}</small>}</div>
          <div className="es-lv-dates">
            <label className="es-field"><span>From</span><input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value, toDate: form.toDate < e.target.value ? e.target.value : form.toDate })} /></label>
            <label className="es-field"><span>To</span><input type="date" value={form.half ? form.fromDate : form.toDate} min={form.fromDate} disabled={form.half} onChange={(e) => setForm({ ...form, toDate: e.target.value })} /></label>
            <div className="es-lv-wd"><b>{p ? fmt(p.days) : "—"}</b><span>{p?.days === 1 ? "working day" : "working days"}</span></div>
          </div>
          {p && <div className="es-lv-range">
            <div className="es-lv-strip">{Array.from({ length: Math.min(p.calendarDays, 31) }, (_, k) => {
              const iso = addDay(form.fromDate, k), hol = p.holidays.find((h) => h.date === iso), wk = p.weeklyOffDays.includes(iso);
              return <span key={iso} className={hol ? "hol" : wk ? "wk" : `on${form.half ? " half" : ""}`} style={{ ["--i" as string]: k } as CSSProperties} title={`${dmy(iso)}${hol ? ` · ${hol.name}` : wk ? " · weekly off" : ""}`}><small>{DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()]!.slice(0, 2)}</small><b>{Number(iso.slice(8))}</b></span>;
            })}</div>
            <small>{p.calendarDays} calendar day{p.calendarDays > 1 ? "s" : ""}{p.weeklyOffDays.length || p.holidays.length ? ` · excludes ${[p.weeklyOffDays.length ? `${p.weeklyOffDays.length} weekly off day${p.weeklyOffDays.length > 1 ? "s" : ""}` : "", p.holidays.map((h) => h.name).join(", ")].filter(Boolean).join(" + ")}` : ""}</small>
          </div>}
          {type?.leaveType.allowHalfDay && <div className="es-lv-half"><label className="switch"><input type="checkbox" checked={form.half} onChange={(e) => setForm({ ...form, half: e.target.checked })} /><i /><span>Half day</span></label>
            <div className="seg">{(["HALF_AM", "HALF_PM"] as const).map((h) => <button key={h} type="button" className={form.halfPart === h ? "active" : ""} onClick={() => setForm({ ...form, half: true, halfPart: h })}>{h === "HALF_AM" ? "First half" : "Second half"}</button>)}</div><span className="es-hint">A single day</span></div>}
          <div className="es-lv-preview" data-state={state}>
            <div className="es-lv-prev-top">
              <div><span className="es-cap">Balance after this request</span><div className="es-lv-after"><b>{f ? fmt(f.after) : "—"}</b><span>{f && Math.abs(f.after) === 1 ? "day" : "days"}</span><em>{f ? `from ${fmt(f.available)}${f.booked ? ` (${fmt(f.booked)} booked)` : ""}` : "no balance used"}</em></div></div>
              <div className="es-lv-prev-msg">
                {errList.length ? <span><CircleAlert />{errList[0]}</span> : !type?.leaveType.isPaid ? <span><Info />Unpaid: payroll deducts these days.</span> : p && !p.days ? <span><CalendarOff />No working days in this range.</span> : f && f.after <= 1 ? <span><TriangleAlert />Almost out of {shortName(type!.leaveType).toLowerCase()}.</span> : <span><CircleCheck />Enough balance.</span>}
                {p?.clashes.length ? <span className="es-lv-clash"><Users />{p.clashes.map((c) => c.name.split(" ")[0]).join(", ")} also out</span> : null}
              </div>
            </div>
            {f && type && <>
              <div className="es-lv-meter"><i className="u" style={{ width: pct(f.used) }} /><i className="b" style={{ width: pct(f.booked) }} /><i className="r" style={{ width: pct(Math.min(p!.days, Math.max(0, f.available))) }} /><i className="n" style={{ width: pct(Math.max(0, f.after)) }} /></div>
              <div className="es-lv-mlegend"><span><i className="u" />Used <b>{fmt(f.used)}</b></span><span><i className="b" />Booked <b>{fmt(f.booked)}</b></span><span><i className="r" />This request <b>{fmt(p!.days)}</b></span><span><i className="n" />Left <b>{fmt(Math.max(0, f.after))}</b></span></div>
            </>}
          </div>
          {p?.warnings.map((w) => <div key={w} className="banner warn"><TriangleAlert /><div><p>{w}</p></div></div>)}
          <label className="es-field"><span>Reason *</span><textarea rows={2} maxLength={500} value={form.reason} placeholder="e.g. Family wedding in Sialkot" onChange={(e) => { setForm({ ...form, reason: e.target.value }); setErrs((x) => ({ ...x, reason: "" })); }} />{errs.reason && <small className="es-down">{errs.reason}</small>}</label>
          <label className="es-field"><span>Contact during leave</span><input value={form.contact} maxLength={60} placeholder="e.g. 0312-4778899" onChange={(e) => setForm({ ...form, contact: e.target.value })} /></label>
          <div className="es-field"><span>Approval route</span><EsTracker steps={["Submitted", ...(p?.route ?? ["Manager"]), "Approved"]} at={0} subs={["You", ...(p?.route ?? []).map(() => null), null]} /></div>
        </div>}
      </Modal>

      <Drawer open={policy} onClose={() => setPolicy(false)} title={`Leave policy ${data.yearStart.slice(0, 4)}-${data.yearEnd.slice(2, 4)}`} subtitle="From the company's leave types (HR › Leave Policies)"
        foot={<><span className="spacer" /><button className="btn secondary" type="button" onClick={() => setPolicy(false)}>Close</button></>}>
        <div className="es-lv-pol">{data.policy.map((x) => { const Ic = iconOf(x.leaveType.category); return (
          <div key={x.leaveType.id} className="es-lv-polrow"><span className="icon-tile" style={{ ["--tc" as string]: COLOUR_VAR[x.leaveType.colour] ?? "var(--primary)" } as CSSProperties}><Ic /></span><div><b>{x.leaveType.name}</b><p>{x.lines.join(" ")}</p></div></div>
        ); })}
          <div className="es-lv-polrow"><span className="icon-tile"><Users /></span><div><b>Approvals</b><p>Requests go to {data.route}.</p></div></div>
        </div>
      </Drawer>

      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} danger title={cancel?.status === "PENDING" ? `Withdraw ${cancel.docNo}?` : "Cancel approved leave?"} confirmLabel={cancel?.status === "PENDING" ? "Withdraw request" : "Cancel leave"} onConfirm={doCancel}>
        {cancel ? `${cancel.leaveType.name}, ${leaveRange(cancel)} (${fmt(cancel.days)} day${cancel.days === 1 ? "" : "s"}). The days return to your balance.` : ""}
      </ConfirmDialog>
    </>
  );
}
